// リッチテキスト編集（contenteditable）。DOM は常にモデル（段落 → ラン）から生成し、
// 入力のたびに DOM → モデルへ読み戻す。書式の変更はモデルに対して行い、DOM を作り直して選択範囲を復元する。
import {
  cloneParas, normalizeParagraph, paraLength, applyFont, rangeFonts, insertText, splitParagraph, deleteRange,
  mergeWithPrevious, wordRangeAt, insertSoftBreak, comparePos, paraIndexes, clampPos, defaultRunFont, paraText,
  MAX_LEVEL,
} from '../core/richtext.js';
import { stepFontSize, nextCase } from '../core/editor.js';
import { resolveColor } from '../core/colors.js';
import { effectiveFont, numberingLabels, LEVEL_INDENT, BULLET_HANG, LINE_FACTOR } from '../core/textlayout.js';
import { textRect } from '../core/shapes.js';
import { fontCss } from './render.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HISTORY_GAP_MS = 800;

export class RichEditor {
  /** box: 位置決め用の外枠、el: contenteditable */
  constructor(box, el) {
    this.box = box;
    this.el = el;
    this.paras = null; // 編集中の段落（null = 編集していない）
    this.fonts = [];
    this.paraProps = [];
    this.theme = null;
    this.scale = 1;
    this.undoStack = [];
    this.redoStack = [];
    this.lastPush = 0;
    this.pending = []; // カーソル位置で次に入力する文字に適用する書式
    this.preInput = null;
    this.composing = false;
    this.onChange = () => {};
    el.addEventListener('compositionstart', () => { this.composing = true; });
    el.addEventListener('compositionend', () => { this.composing = false; this.handleInput(); });
    el.addEventListener('beforeinput', () => {
      if (this.paras) this.preInput = { sel: this.getSel(), len: this.totalLength() };
    });
    el.addEventListener('input', (e) => { if (!e.isComposing && !this.composing) this.handleInput(); });
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      if (!this.paras) return;
      const text = e.clipboardData?.getData('text/plain') || '';
      if (text) this.insertText(text);
    });
    this.resetSink();
  }

  get active() { return this.paras !== null; }

  // ------------------------------------------------------------ 開始・終了
  /** obj の文字の編集を開始。clear: 文字を消して始める（選択中に文字を打ったとき） */
  begin(obj, theme, scale, { clear = false, select = 'end' } = {}) {
    this.displayFont = obj.displayFont || ((f) => f);
    this.theme = theme;
    this.scale = scale;
    this.obj = obj;
    this.paras = cloneParas(obj.paragraphs);
    if (clear) {
      const { runs, ...props } = this.paras[0];
      this.paras = [{ ...props, runs: [{ text: '', font: { ...runs[0].font } }] }];
    }
    this.undoStack = [];
    this.redoStack = [];
    this.pending = [];
    this.position(obj, scale);
    this.render();
    const end = { p: this.paras.length - 1, o: paraLength(this.paras[this.paras.length - 1]) };
    if (select === 'all') this.setSel({ p: 0, o: 0 }, end);
    else this.setSel(end, end);
    this.onChange(this.paras);
  }

  /**
   * IME の変換開始など、既に DOM に文字が入力されつつある状態から編集を始める。
   * 変換中の DOM を壊さないよう、ここでは DOM を作り直さない（確定後に作り直す）。
   */
  beginFromTyping(obj, theme, scale) {
    this.displayFont = obj.displayFont || ((f) => f);
    this.theme = theme;
    this.scale = scale;
    this.obj = obj;
    const { runs, ...props } = obj.paragraphs[0];
    this.paras = [{ ...props, runs: [{ text: '', font: { ...runs[0].font } }] }];
    this.fonts = [this.paras[0].runs[0].font];
    this.paraProps = [props];
    this.undoStack = [];
    this.redoStack = [];
    this.pending = [];
    this.position(obj, scale);
    const p = this.el.querySelector('.p') || this.el;
    p.setAttribute('data-pf', '0');
    p.setAttribute('style', this.paraStyle(this.paras[0], null));
  }

  /** 編集を終了して段落を返す */
  end() {
    if (!this.paras) return null;
    if (!this.composing) this.sync();
    const paras = this.paras;
    this.paras = null;
    this.obj = null;
    this.resetSink();
    return paras;
  }

  /** 編集していないときの状態（画面外に置き、キー入力と IME を受け取る） */
  resetSink() {
    this.el.innerHTML = '<div class="p" data-p="0"><br></div>';
    Object.assign(this.box.style, { left: '-10000px', top: '0px', width: '200px', height: '40px', transform: '' });
  }

  /** 図形の位置・回転・余白・上下の配置に合わせて編集枠を置く */
  position(obj, scale) {
    this.scale = scale;
    const tr = textRect(obj.type, obj.w, obj.h);
    const ins = obj.inset;
    const st = this.box.style;
    st.left = `${(obj.x + tr.x) * scale}px`;
    st.top = `${(obj.y + tr.y) * scale}px`;
    st.width = `${tr.w * scale}px`;
    st.height = `${tr.h * scale}px`;
    const rot = obj.rotation + (obj.flipV ? 180 : 0);
    st.transformOrigin = `${(obj.w / 2 - tr.x) * scale}px ${(obj.h / 2 - tr.y) * scale}px`;
    st.transform = rot ? `rotate(${rot}deg)` : '';
    st.padding = `${ins.t * scale}px ${ins.r * scale}px ${ins.b * scale}px ${ins.l * scale}px`;
    // 縦書きは列が右から左へ並ぶ。上下の配置は左右の配置になる（上 = 右寄せ）
    st.flexDirection = obj.vertical ? 'row' : 'column';
    st.justifyContent = obj.vertical
      ? ({ top: 'flex-end', middle: 'center', bottom: 'flex-start' }[obj.anchor] || 'flex-end')
      : ({ top: 'flex-start', middle: 'center', bottom: 'flex-end' }[obj.anchor] || 'flex-start');
    this.el.style.writingMode = obj.vertical ? 'vertical-rl' : '';
    this.el.style.whiteSpace = obj.wrap === false ? 'pre' : 'pre-wrap';
  }

  // ------------------------------------------------------------ DOM の生成と読み戻し
  runStyle(rawFont) {
    // 表示用の書式（表のタイトル行など）。モデルの書式は変えない
    const font = this.displayFont ? this.displayFont(rawFont) : rawFont;
    const ef = effectiveFont(font, this.theme);
    const s = this.scale;
    const deco = [font.underline ? 'underline' : '', font.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
    // 縦書きでは半角の英数字は横倒し（PowerPoint と同じ）
    const color = resolveColor(font.link ? '@hlink' : font.color, this.theme);
    const decoration = font.link && !deco.includes('underline') ? `underline ${deco === 'none' ? '' : deco}`.trim() : deco;
    return `font:${fontCss({ ...ef, size: ef.size * s })};color:${color};text-decoration:${decoration};`
      + `vertical-align:${font.baseline === 'super' ? 'super' : font.baseline === 'sub' ? 'sub' : 'baseline'};line-height:inherit`;
  }

  paraStyle(p, label) {
    const s = this.scale;
    const f = this.displayFont ? this.displayFont(p.runs[0].font) : p.runs[0].font;
    const ef = effectiveFont({ ...f, baseline: 0 }, this.theme);
    const indent = p.level * LEVEL_INDENT + (label ? BULLET_HANG : 0);
    return `text-align:${p.align === 'justify' ? 'justify' : p.align};padding-left:${indent * s}px;`
      + `line-height:${LINE_FACTOR * p.lineSpacing};font:${fontCss({ ...ef, size: ef.size * s })};color:${resolveColor(f.color, this.theme)};`
      + `--bx:${p.level * LEVEL_INDENT * s}px;margin-top:${(p.spaceBefore || 0) * s}px;margin-bottom:${(p.spaceAfter || 0) * s}px`;
  }

  html() {
    this.fonts = [];
    this.paraProps = [];
    const fontIndex = (f) => {
      let i = this.fonts.findIndex((x) => JSON.stringify(x) === JSON.stringify(f));
      if (i === -1) { i = this.fonts.length; this.fonts.push({ ...f }); }
      return i;
    };
    const labels = numberingLabels(this.paras);
    return this.paras.map((p, pi) => {
      const { runs, ...props } = p;
      this.paraProps.push(props);
      const pf = fontIndex(runs[0].font);
      let inner = '';
      for (const r of runs) {
        if (!r.text) continue;
        const parts = r.text.split('\n').map(esc).join('<br>');
        inner += `<span data-f="${fontIndex(r.font)}" style="${esc(this.runStyle(r.font))}">${parts}</span>`;
      }
      const text = paraText(p);
      if (text === '' || text.endsWith('\n')) inner += '<br>';
      const bullet = labels[pi] ? ` data-bullet="${esc(labels[pi])}"` : '';
      return `<div class="p" data-p="${pi}" data-pf="${pf}"${bullet} style="${esc(this.paraStyle(p, labels[pi]))}">${inner}</div>`;
    }).join('');
  }

  render() {
    this.el.innerHTML = this.html();
  }

  /** 段落要素の一覧（ブラウザが作った余分な要素も段落として扱う） */
  paraEls() {
    const out = [];
    for (const n of this.el.childNodes) {
      if (n.nodeType === 1 || (n.nodeType === 3 && n.data)) out.push(n);
    }
    return out.length ? out : [this.el];
  }

  fontOf(node, pEl) {
    for (let n = node; n && n !== pEl.parentNode; n = n.parentNode) {
      if (n.nodeType === 1 && n.hasAttribute('data-f')) return this.fonts[Number(n.getAttribute('data-f'))];
      if (n === pEl) break;
    }
    const pf = pEl.nodeType === 1 && pEl.getAttribute('data-pf');
    return this.fonts[Number(pf)] || this.fonts[0] || defaultRunFont();
  }

  /** DOM → モデル */
  sync() {
    const paras = [];
    let prevProps = this.paraProps[0] || { align: 'left', level: 0, bullet: 'none', lineSpacing: 1, spaceBefore: 0, spaceAfter: 0 };
    for (const pEl of this.paraEls()) {
      const idx = pEl.nodeType === 1 ? pEl.getAttribute('data-p') : null;
      const props = idx !== null && this.paraProps[Number(idx)] ? this.paraProps[Number(idx)] : prevProps;
      prevProps = props;
      const runs = [];
      const nodes = pEl.nodeType === 3 ? [pEl] : this.leaves(pEl);
      nodes.forEach((n, i) => {
        if (n.nodeType === 3) runs.push({ text: n.data.replace(/ /g, ' '), font: { ...this.fontOf(n, pEl) } });
        else if (n.nodeName === 'BR' && !this.isTrailingBr(nodes, i)) runs.push({ text: '\n', font: { ...this.fontOf(n, pEl) } });
      });
      const pf = this.fontOf(pEl, pEl);
      if (runs.length === 0) runs.push({ text: '', font: { ...pf } });
      paras.push(normalizeParagraph({ ...props, runs }));
    }
    this.paras = paras;
  }

  leaves(root) {
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) { if (n.data) out.push(n); return; }
      if (n.nodeName === 'BR') { out.push(n); return; }
      for (const c of n.childNodes) walk(c);
    };
    for (const c of root.childNodes) walk(c);
    return out;
  }

  /** 段落の最後の <br>（空行・末尾改行の表示用）は文字として数えない */
  isTrailingBr(nodes, i) {
    return nodes[i].nodeName === 'BR' && nodes.slice(i + 1).every((n) => n.nodeType === 3 && !n.data);
  }

  // ------------------------------------------------------------ 選択範囲（DOM ⇔ モデル）
  domToPos(node, offset) {
    const pEls = this.paraEls();
    let pi = pEls.findIndex((p) => p === node || p.contains(node));
    if (pi === -1) {
      // ルート要素上の位置
      if (node === this.el) {
        pi = Math.min(offset, pEls.length - 1);
        return offset >= pEls.length ? { p: pEls.length - 1, o: this.paraLen(pEls[pEls.length - 1]) } : { p: pi, o: 0 };
      }
      return { p: 0, o: 0 };
    }
    const pEl = pEls[pi];
    if (pEl.nodeType === 3) return { p: pi, o: node === pEl ? offset : 0 };
    const nodes = this.leaves(pEl);
    let count = 0;
    // (node, offset) より前にある葉ノードの長さを合計
    const boundary = document.createRange();
    boundary.setStart(node, offset);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n === node && n.nodeType === 3) return { p: pi, o: count + offset };
      const r = document.createRange();
      r.selectNode(n);
      // n が境界より後ろなら終了
      if (r.compareBoundaryPoints(Range.START_TO_START, boundary) >= 0) break;
      if (n.nodeType === 3) count += n.data.length;
      else if (!this.isTrailingBr(nodes, i)) count += 1;
    }
    return { p: pi, o: count };
  }

  paraLen(pEl) {
    if (pEl.nodeType === 3) return pEl.data.length;
    const nodes = this.leaves(pEl);
    return nodes.reduce((n, x, i) => n + (x.nodeType === 3 ? x.data.length : this.isTrailingBr(nodes, i) ? 0 : 1), 0);
  }

  posToDom(pos) {
    const pEls = this.paraEls();
    const pEl = pEls[Math.min(pos.p, pEls.length - 1)];
    if (pEl.nodeType === 3) return [pEl, Math.min(pos.o, pEl.data.length)];
    const nodes = this.leaves(pEl);
    let count = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.nodeType === 3) {
        if (pos.o <= count + n.data.length) return [n, pos.o - count];
        count += n.data.length;
      } else {
        const trailing = this.isTrailingBr(nodes, i);
        if (pos.o <= count) return [n.parentNode, [...n.parentNode.childNodes].indexOf(n)];
        if (!trailing) count += 1;
      }
    }
    return [pEl, pEl.childNodes.length];
  }

  getSel() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !this.el.contains(sel.anchorNode)) {
      const end = { p: this.paras.length - 1, o: paraLength(this.paras[this.paras.length - 1]) };
      return { from: end, to: end, anchor: end, focus: end };
    }
    const a = clampPos(this.paras, this.domToPos(sel.anchorNode, sel.anchorOffset));
    const f = clampPos(this.paras, this.domToPos(sel.focusNode, sel.focusOffset));
    const [from, to] = comparePos(a, f) <= 0 ? [a, f] : [f, a];
    return { from, to, anchor: a, focus: f };
  }

  setSel(anchor, focus = anchor) {
    const [an, ao] = this.posToDom(clampPos(this.paras, anchor));
    const [fn, fo] = this.posToDom(clampPos(this.paras, focus));
    const sel = window.getSelection();
    sel.setBaseAndExtent(an, ao, fn, fo);
  }

  totalLength() {
    return this.paras.reduce((n, p) => n + paraLength(p) + 1, 0);
  }

  // ------------------------------------------------------------ 入力と履歴
  pushHistory(force = false) {
    const now = Date.now();
    if (!force && now - this.lastPush < HISTORY_GAP_MS && this.undoStack.length) return;
    this.lastPush = now;
    const s = this.getSel();
    this.undoStack.push({ paras: cloneParas(this.paras), anchor: s.anchor, focus: s.focus });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  handleInput() {
    if (!this.paras) return;
    const before = this.paras;
    const prevSel = this.preInput;
    this.sync();
    // 直前に保存した状態（入力前）を履歴へ
    if (prevSel) {
      const now = Date.now();
      if (now - this.lastPush >= HISTORY_GAP_MS || !this.undoStack.length) {
        this.undoStack.push({ paras: cloneParas(before), anchor: prevSel.sel.anchor, focus: prevSel.sel.focus });
        this.redoStack = [];
      }
      this.lastPush = now;
    }
    const sel = this.getSel();
    // カーソル位置に予約された書式（Ctrl+B を押してから入力した場合など）
    if (this.pending.length && prevSel && sel.from.p === prevSel.sel.from.p && sel.from.o > prevSel.sel.from.o) {
      const from = prevSel.sel.from;
      for (const fn of this.pending) applyFont(this.paras, from, sel.from, fn);
      this.pending = [];
    }
    this.preInput = null;
    this.refresh(sel.anchor, sel.focus);
  }

  /** モデルから DOM を作り直す必要があれば作り直し、選択範囲を復元する */
  refresh(anchor, focus) {
    const tpl = document.createElement('div');
    tpl.innerHTML = this.html();
    if (tpl.innerHTML !== this.el.innerHTML) {
      this.el.innerHTML = tpl.innerHTML;
      this.setSel(anchor, focus);
    }
    this.onChange(this.paras);
  }

  /** 書式変更などの操作: 履歴に積み、fn(sel) を実行して、DOM と選択範囲を更新 */
  command(fn) {
    if (!this.paras) return false;
    this.sync();
    this.pushHistory(true);
    const sel = this.getSel();
    const r = fn(sel) || {};
    this.render();
    this.setSel(r.anchor ?? sel.anchor, r.focus ?? r.anchor ?? sel.focus);
    this.onChange(this.paras);
    return true;
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.sync();
    const s = this.getSel();
    this.redoStack.push({ paras: cloneParas(this.paras), anchor: s.anchor, focus: s.focus });
    const st = this.undoStack.pop();
    this.paras = st.paras;
    this.render();
    this.setSel(st.anchor, st.focus);
    this.onChange(this.paras);
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.sync();
    const s = this.getSel();
    this.undoStack.push({ paras: cloneParas(this.paras), anchor: s.anchor, focus: s.focus });
    const st = this.redoStack.pop();
    this.paras = st.paras;
    this.render();
    this.setSel(st.anchor, st.focus);
    this.onChange(this.paras);
    return true;
  }

  // ------------------------------------------------------------ 文字の書式
  /**
   * 選択範囲の文字に fn を適用。範囲がなければ、カーソルが単語の中なら単語全体、
   * そうでなければ次に入力する文字に適用（PowerPoint と同じ）。
   */
  formatRange(fn) {
    return this.command((sel) => {
      let { from, to } = sel;
      if (comparePos(from, to) === 0) {
        const w = wordRangeAt(this.paras, from);
        if (w) ({ from, to } = w);
        else if (paraLength(this.paras[from.p]) === 0) { applyFont(this.paras, from, to, fn); return null; }
        else { this.pending.push(fn); return null; }
      }
      applyFont(this.paras, from, to, fn);
      return null;
    });
  }

  selectionFonts() {
    this.sync();
    const { from, to } = this.getSel();
    if (comparePos(from, to) === 0) {
      const w = wordRangeAt(this.paras, from);
      if (w) return rangeFonts(this.paras, w.from, w.to);
    }
    return rangeFonts(this.paras, from, to);
  }

  toggleFont(prop) {
    const value = !this.selectionFonts().every((f) => f[prop]);
    return this.formatRange((f) => { f[prop] = value; });
  }

  toggleBaseline(kind) {
    const value = this.selectionFonts().every((f) => f.baseline === kind) ? 0 : kind;
    return this.formatRange((f) => { f.baseline = value; });
  }

  setFontProp(prop, value) { return this.formatRange((f) => { if (value === undefined) delete f[prop]; else f[prop] = value; }); }
  setFontProps(props) { return this.formatRange((f) => Object.assign(f, props)); }
  changeFontSize(dir) { return this.formatRange((f) => { f.size = stepFontSize(f.size, dir); }); }
  clearFormat() {
    return this.formatRange((f) => { f.bold = false; f.italic = false; f.underline = false; f.strike = false; f.baseline = 0; });
  }

  currentFont() { return this.selectionFonts()[0]; }

  changeCase() {
    return this.command((sel) => {
      let { from, to } = sel;
      if (comparePos(from, to) === 0) {
        const w = wordRangeAt(this.paras, from);
        if (!w) return null;
        ({ from, to } = w);
      }
      // 範囲内の各ランの該当部分の文字だけを変換（文字数は変わらない）
      const text = this.rangeText(from, to);
      const next = nextCase(text);
      if (next.length !== text.length) return null;
      let k = 0;
      for (const i of paraIndexes(from, to)) {
        let pos = 0;
        const s = i === from.p ? from.o : 0;
        const e = i === to.p ? to.o : paraLength(this.paras[i]);
        for (const r of this.paras[i].runs) {
          const rs = pos;
          pos += r.text.length;
          // DOM の位置と同じく UTF-16 のコード単位で数える
          r.text = r.text.split('').map((ch, j) => (rs + j >= s && rs + j < e ? next[k++] : ch)).join('');
        }
        k += 1; // 段落の区切り
      }
      return { anchor: from, focus: to };
    });
  }

  rangeText(from, to) {
    return paraIndexes(from, to).map((i) => {
      const t = paraText(this.paras[i]);
      return t.slice(i === from.p ? from.o : 0, i === to.p ? to.o : t.length);
    }).join('\n');
  }

  // ------------------------------------------------------------ 段落の書式
  setParaProp(prop, value) {
    return this.command((sel) => {
      for (const i of paraIndexes(sel.from, sel.to)) this.paras[i][prop] = value;
      return null;
    });
  }

  toggleBullet(kind) {
    this.sync();
    const { from, to } = this.getSel();
    const all = paraIndexes(from, to).every((i) => this.paras[i].bullet === kind);
    return this.setParaProp('bullet', all ? 'none' : kind);
  }

  changeLevel(dir) {
    return this.command((sel) => {
      for (const i of paraIndexes(sel.from, sel.to)) {
        this.paras[i].level = Math.max(0, Math.min(MAX_LEVEL, this.paras[i].level + dir));
      }
      return null;
    });
  }

  /** Alt+Shift+↑ / ↓: 段落を上下に移動 */
  moveParagraphs(dir) {
    return this.command((sel) => {
      const idx = paraIndexes(sel.from, sel.to);
      const a = idx[0], b = idx[idx.length - 1];
      if ((dir < 0 && a === 0) || (dir > 0 && b === this.paras.length - 1)) return null;
      const block = this.paras.splice(a, b - a + 1);
      this.paras.splice(a + dir, 0, ...block);
      return { anchor: { ...sel.anchor, p: sel.anchor.p + dir }, focus: { ...sel.focus, p: sel.focus.p + dir } };
    });
  }

  // ------------------------------------------------------------ キー操作
  insertText(text) {
    return this.command((sel) => {
      const start = deleteRange(this.paras, sel.from, sel.to);
      const font = this.pending.length ? (() => { const f = { ...rangeFonts(this.paras, start, start)[0] }; for (const fn of this.pending) fn(f); return f; })() : undefined;
      this.pending = [];
      return { anchor: insertText(this.paras, start, text, font) };
    });
  }

  enter() {
    return this.command((sel) => ({ anchor: splitParagraph(this.paras, deleteRange(this.paras, sel.from, sel.to)) }));
  }

  softBreak() {
    return this.command((sel) => ({ anchor: insertSoftBreak(this.paras, deleteRange(this.paras, sel.from, sel.to)) }));
  }

  /** Backspace が段落の先頭: レベルを下げる → 行頭文字を消す → 前の段落と結合。処理したら true */
  backspaceAtStart() {
    this.sync();
    const { from, to } = this.getSel();
    if (comparePos(from, to) !== 0 || from.o !== 0) return false;
    const p = this.paras[from.p];
    // command() は DOM から段落を読み直すので、段落は callback の中で取り直す
    if (p.level > 0) return this.command(() => { this.paras[from.p].level -= 1; return null; });
    if (p.bullet !== 'none') return this.command(() => { this.paras[from.p].bullet = 'none'; return null; });
    if (from.p === 0) return true;
    return this.command(() => ({ anchor: mergeWithPrevious(this.paras, from.p) }));
  }

  /** Delete が段落の末尾: 次の段落と結合 */
  deleteAtEnd() {
    this.sync();
    const { from, to } = this.getSel();
    if (comparePos(from, to) !== 0 || from.o !== paraLength(this.paras[from.p])) return false;
    if (from.p === this.paras.length - 1) return true;
    return this.command(() => ({ anchor: mergeWithPrevious(this.paras, from.p + 1) }));
  }

  /** Tab / Shift+Tab: 段落の先頭（または複数段落の選択）ならレベル変更、それ以外はタブ文字 */
  tab(shift) {
    this.sync();
    const { from, to } = this.getSel();
    if (from.o === 0 || from.p !== to.p) return this.changeLevel(shift ? -1 : 1);
    if (shift) return true;
    return this.insertText('\t');
  }

  /** 書式のコピー / 貼り付け（編集中は文字の書式のみ） */
  copyFormat() { this.formatClip = { ...this.currentFont() }; return true; }
  pasteFormat() {
    if (!this.formatClip) return false;
    const f = this.formatClip;
    return this.formatRange((font) => Object.assign(font, f));
  }
}
