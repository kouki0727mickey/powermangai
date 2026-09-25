// キーボードだけで操作するダイアログ群。すべて Promise を返し、キャンセル時は null。
import { paletteGrid } from '../core/colors.js';
import { createObject, SHAPE_LABELS } from '../core/model.js';
import { drawObject } from './render.js';
import { prettyKey } from '../core/keys.js';

const stack = [];
const root = () => document.getElementById('modal-root');

export function activeDialog() { return stack[stack.length - 1] || null; }

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') Object.assign(el.style, v);
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}
export { h };

class Dialog {
  constructor(title, foot) {
    this.el = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    this.el.append(h('h2', { text: title }));
    this.body = h('div', { class: 'body' });
    this.el.append(this.body);
    if (foot) this.el.append(h('div', { class: 'foot', text: foot }));
    this.promise = new Promise((resolve) => { this.resolve = resolve; });
    this.prevFocus = null;
  }

  show() {
    this.prevFocus = document.activeElement;
    stack.push(this);
    root().append(this.el);
    this.focus();
    return this.promise;
  }

  focus() { this.el.tabIndex = -1; this.el.focus(); }

  close(result = null) {
    const i = stack.indexOf(this);
    if (i !== -1) stack.splice(i, 1);
    this.el.remove();
    if (this.prevFocus && document.contains(this.prevFocus)) this.prevFocus.focus();
    this.resolve(result);
  }

  /** キーを処理したら true。false の場合は既定の動作（入力欄への文字入力など）に任せる */
  handleKey(e) {
    if (e.key === 'Escape') { this.close(null); return true; }
    return false;
  }
}

// ---------------------------------------------------------------- パレット
export function openPalette(title, { current = null, allowNone = true } = {}) {
  const grid = paletteGrid();
  const d = new Dialog(title, '矢印キー: 移動 ／ Enter: 決定 ／ N: なし ／ Esc: キャンセル');
  const wrap = h('div', { class: 'palette' });
  const cells = [];
  grid.forEach((row, r) => row.forEach((c, col) => {
    const sw = h('div', { class: `swatch${r === grid.length - 1 ? ' gap-before' : ''}${r === 1 ? ' gap-before' : ''}`, title: c.name, style: { background: c.hex } });
    cells.push({ r, col, el: sw, color: c });
    wrap.append(sw);
  }));
  const none = allowNone ? h('div', { class: 'palette-none', text: allowNone ? 'なし (N)' : '' }) : null;
  const name = h('div', { class: 'palette-name' });
  d.body.append(wrap);
  if (none) d.body.append(none);
  d.body.append(name);
  // PowerPoint と同じく左上から選び始める。行 grid.length は「なし」
  const NONE = grid.length;
  const pos = { r: 0, c: 0 };
  const cur = current ? current.toUpperCase() : null;
  for (const x of cells) if (x.color.hex === cur) x.el.style.boxShadow = 'inset 0 0 0 2px #fff, inset 0 0 0 3px #000';
  const render = () => {
    for (const x of cells) x.el.classList.toggle('sel', x.r === pos.r && x.col === pos.c);
    if (none) none.classList.toggle('sel', pos.r === NONE);
    name.textContent = pos.r === NONE ? 'なし' : `${grid[pos.r][pos.c].name}（${grid[pos.r][pos.c].hex}）`;
  };
  d.handleKey = (e) => {
    const rows = allowNone ? grid.length + 1 : grid.length;
    switch (e.key) {
      case 'Escape': d.close(null); return true;
      case 'Enter':
      case ' ':
        d.close({ color: pos.r === NONE ? null : grid[pos.r][pos.c].hex });
        return true;
      case 'ArrowRight': if (pos.r !== NONE) pos.c = (pos.c + 1) % 10; break;
      case 'ArrowLeft': if (pos.r !== NONE) pos.c = (pos.c + 9) % 10; break;
      case 'ArrowDown': pos.r = (pos.r + 1) % rows; break;
      case 'ArrowUp': pos.r = (pos.r - 1 + rows) % rows; break;
      case 'Home': pos.c = 0; break;
      case 'End': pos.c = 9; break;
      default:
        if (allowNone && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.altKey) { d.close({ color: null }); return true; }
        return true; // 他のキーは無視（誤操作防止）
    }
    render();
    return true;
  };
  render();
  return d.show();
}

// ---------------------------------------------------------------- ギャラリー
function shapeIcon(type) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 44;
  const ctx = c.getContext('2d');
  const o = createObject(type, { x: 6, y: 6, w: 52, h: type === 'line' ? 32 : 32, text: type === 'text' ? 'Aa' : '', font: { size: 16 } });
  drawObject(ctx, o);
  return c;
}

/** items: [{ label, value, icon?: HTMLCanvasElement }] */
export function openGallery(title, items, { columns = 4 } = {}) {
  const d = new Dialog(title, `矢印キー: 移動 ／ Enter: 決定 ／ 1〜${Math.min(9, items.length)}: 直接選択 ／ Esc: キャンセル`);
  const grid = h('div', { class: 'gallery', style: { gridTemplateColumns: `repeat(${columns}, 96px)` } });
  const els = items.map((it, i) => {
    const el = h('div', { class: 'item' }, it.icon || null, h('div', { text: `${i < 9 ? `${i + 1}. ` : ''}${it.label}` }));
    grid.append(el);
    return el;
  });
  d.body.append(grid);
  let sel = 0;
  const render = () => els.forEach((el, i) => el.classList.toggle('sel', i === sel));
  d.handleKey = (e) => {
    const n = items.length;
    switch (e.key) {
      case 'Escape': d.close(null); return true;
      case 'Enter': case ' ': d.close(items[sel].value); return true;
      case 'ArrowRight': sel = (sel + 1) % n; break;
      case 'ArrowLeft': sel = (sel - 1 + n) % n; break;
      case 'ArrowDown': sel = Math.min(n - 1, sel + columns); break;
      case 'ArrowUp': sel = Math.max(0, sel - columns); break;
      case 'Home': sel = 0; break;
      case 'End': sel = n - 1; break;
      default:
        if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) { d.close(items[Number(e.key) - 1].value); return true; }
        return true;
    }
    render();
    return true;
  };
  render();
  return d.show();
}

export function openShapeGallery(types) {
  return openGallery('図形の挿入', types.map((t) => ({ label: SHAPE_LABELS[t], value: t, icon: shapeIcon(t) })));
}

// ---------------------------------------------------------------- 入力
/** validate(value) はエラー文字列か null を返す */
export function openInput(title, { value = '', label = '', validate = () => null, suggestions = [] } = {}) {
  const d = new Dialog(title, 'Enter: 決定 ／ Esc: キャンセル' + (suggestions.length ? ' ／ ↑↓: 候補' : ''));
  const input = h('input', { type: 'text', 'aria-label': label || title });
  input.value = String(value);
  const err = h('div', { style: { color: 'var(--ng)', minHeight: '18px', marginTop: '4px' } });
  if (label) d.body.append(h('div', { text: label, style: { marginBottom: '4px' } }));
  d.body.append(input, err);
  let list = null;
  let sel = -1;
  if (suggestions.length) {
    list = h('ul', { class: 'list', style: { maxHeight: '240px', overflowY: 'auto', marginTop: '4px' } });
    suggestions.forEach((s) => list.append(h('li', { text: s })));
    d.body.append(list);
    sel = suggestions.indexOf(String(value));
  }
  const renderList = () => {
    if (!list) return;
    [...list.children].forEach((li, i) => li.classList.toggle('sel', i === sel));
    list.children[sel]?.scrollIntoView({ block: 'nearest' });
  };
  d.focus = () => { input.focus(); input.select(); };
  d.handleKey = (e) => {
    if (e.isComposing) return false;
    if (e.key === 'Escape') { d.close(null); return true; }
    if (e.key === 'Enter') {
      const v = input.value.trim();
      const msg = validate(v);
      if (msg) { err.textContent = msg; input.select(); return true; }
      d.close(v);
      return true;
    }
    if (list && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const n = suggestions.length;
      sel = e.key === 'ArrowDown' ? (sel + 1) % n : (sel - 1 + n) % n;
      input.value = suggestions[sel];
      input.select();
      renderList();
      return true;
    }
    if (e.key === 'Tab') return true; // フォーカスを外に出さない
    return false;
  };
  renderList();
  return d.show();
}

// ---------------------------------------------------------------- リスト
/** items: [{ label, sub?, right?, value }] */
export function openList(title, items, { initial = 0, foot } = {}) {
  const d = new Dialog(title, foot || '↑↓: 移動 ／ Enter: 決定 ／ Esc: キャンセル');
  const ul = h('ul', { class: 'list' });
  const els = items.map((it, i) => {
    const li = h('li', {}, h('span', { text: `${i < 9 ? `${i + 1}. ` : ''}${it.label}` }), it.sub ? h('span', { class: 'sub', text: it.sub }) : null, it.right ? h('span', { class: 'best', text: it.right }) : null);
    ul.append(li);
    return li;
  });
  d.body.append(ul);
  let sel = Math.max(0, Math.min(items.length - 1, initial));
  const render = () => {
    els.forEach((el, i) => el.classList.toggle('sel', i === sel));
    els[sel]?.scrollIntoView({ block: 'nearest' });
  };
  d.handleKey = (e) => {
    const n = items.length;
    switch (e.key) {
      case 'Escape': d.close(null); return true;
      case 'Enter': case ' ': d.close(items[sel].value); return true;
      case 'ArrowDown': sel = (sel + 1) % n; break;
      case 'ArrowUp': sel = (sel - 1 + n) % n; break;
      case 'Home': sel = 0; break;
      case 'End': sel = n - 1; break;
      default:
        if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) { d.close(items[Number(e.key) - 1].value); return true; }
        return true;
    }
    render();
    return true;
  };
  render();
  return d.show();
}

// ---------------------------------------------------------------- 確認・メッセージ
export function openConfirm(title, message) {
  const d = new Dialog(title, 'Enter / Y: はい ／ Esc / N: いいえ');
  d.body.append(h('p', { text: message }));
  d.handleKey = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'enter' || k === 'y') { d.close(true); return true; }
    if (k === 'escape' || k === 'n') { d.close(false); return true; }
    return true;
  };
  return d.show();
}

/** 読み取り専用の内容（ヘルプ・採点結果）。↑↓ PageUp/PageDown でスクロール */
export function openContent(title, content, { foot = '↑↓ / PageUp / PageDown: スクロール ／ Enter・Esc: 閉じる', onKey } = {}) {
  const d = new Dialog(title, foot);
  d.body.append(content);
  d.handleKey = (e) => {
    if (onKey && onKey(e, d)) return true;
    const b = d.body;
    switch (e.key) {
      case 'Escape': case 'Enter': d.close(true); return true;
      case 'ArrowDown': b.scrollTop += 40; return true;
      case 'ArrowUp': b.scrollTop -= 40; return true;
      case 'PageDown': case ' ': b.scrollTop += b.clientHeight - 40; return true;
      case 'PageUp': b.scrollTop -= b.clientHeight - 40; return true;
      case 'Home': b.scrollTop = 0; return true;
      case 'End': b.scrollTop = b.scrollHeight; return true;
      default: return true;
    }
  };
  return d.show();
}

// ---------------------------------------------------------------- ヘルプ
/** bindings はショートカット表、keytips は keyTipPaths() の結果 */
export function openHelp(bindingsByCat, keytipPaths) {
  const wrap = h('div');
  const filter = h('input', { type: 'text', placeholder: '絞り込み（例: 太字、Ctrl+G、配置）', 'aria-label': '絞り込み' });
  const list = h('div', { class: 'help-grid', style: { marginTop: '10px' } });
  wrap.append(filter, list);

  const rows = [];
  for (const [cat, items] of bindingsByCat) rows.push({ cat, items: items.map((b) => ({ keys: b.keys.map(prettyKey).join(' / '), label: b.label })) });
  rows.push({
    cat: 'KeyTips（Alt キー → 文字キー）',
    items: keytipPaths.map((p) => ({ keys: p.keys.join(' → '), label: p.labels.join(' › ') })),
  });

  const render = () => {
    const q = filter.value.trim().toLowerCase();
    list.textContent = '';
    for (const r of rows) {
      const items = r.items.filter((i) => !q || i.keys.toLowerCase().includes(q) || i.label.toLowerCase().includes(q) || r.cat.toLowerCase().includes(q));
      if (items.length === 0) continue;
      const cat = h('div', { class: 'help-cat' }, h('h3', { text: r.cat }));
      for (const i of items) cat.append(h('div', { class: 'help-row' }, h('span', { class: 'keys', text: i.keys }), h('span', { text: i.label })));
      list.append(cat);
    }
    if (!list.children.length) list.append(h('p', { text: '該当するショートカットはありません' }));
  };
  filter.addEventListener('input', render);
  render();

  const d = new Dialog('ショートカット一覧', '文字を入力して絞り込み ／ ↑↓ PageUp PageDown: スクロール ／ Esc: 閉じる');
  d.body.append(wrap);
  d.focus = () => filter.focus();
  d.handleKey = (e) => {
    if (e.isComposing) return false;
    const b = d.body;
    switch (e.key) {
      case 'Escape': d.close(true); return true;
      case 'ArrowDown': b.scrollTop += 40; return true;
      case 'ArrowUp': b.scrollTop -= 40; return true;
      case 'PageDown': b.scrollTop += b.clientHeight - 40; return true;
      case 'PageUp': b.scrollTop -= b.clientHeight - 40; return true;
      case 'Tab': return true;
      default: return false;
    }
  };
  return d.show();
}

// ---------------------------------------------------------------- フォント ダイアログ
export function openFontDialog(font, fontFamilies) {
  const d = new Dialog('フォント', 'Tab / Shift+Tab: 項目の移動 ／ Space: チェック切り替え ／ Alt+↓ または ↑↓: 選択肢 ／ Enter: OK ／ Esc: キャンセル');
  const fam = h('select', { id: 'fd-family' });
  const families = fontFamilies.includes(font.family) ? fontFamilies : [font.family, ...fontFamilies];
  for (const f of families) fam.append(h('option', { value: f, text: f }));
  fam.value = font.family;
  const size = h('input', { type: 'text', id: 'fd-size' });
  size.value = String(font.size);
  const cb = (id, checked) => { const c = h('input', { type: 'checkbox', id }); c.checked = checked; return c; };
  const bold = cb('fd-bold', font.bold);
  const italic = cb('fd-italic', font.italic);
  const underline = cb('fd-underline', font.underline);
  const row = (labelText, el, key) => h('div', { class: 'form-row' }, h('label', { for: el.id, text: `${labelText}${key ? ` (${key})` : ''}` }), el);
  d.body.append(
    row('フォント', fam, 'F'), row('サイズ', size, 'S'),
    row('太字', bold, 'B'), row('斜体', italic, 'I'), row('下線', underline, 'U'),
  );
  const err = h('div', { style: { color: 'var(--ng)', minHeight: '18px' } });
  d.body.append(err);
  const fields = [fam, size, bold, italic, underline];
  d.focus = () => fam.focus();
  d.handleKey = (e) => {
    if (e.isComposing) return false;
    if (e.key === 'Escape') { d.close(null); return true; }
    if (e.key === 'Tab') {
      const i = fields.indexOf(document.activeElement);
      const next = (i + (e.shiftKey ? -1 : 1) + fields.length) % fields.length;
      fields[next].focus();
      if (fields[next] === size) size.select();
      return true;
    }
    // Alt+文字 で項目へ移動（Windows のダイアログと同じ操作）
    if (e.altKey && !e.ctrlKey) {
      const map = { f: fam, s: size, b: bold, i: italic, u: underline };
      const target = map[e.key.toLowerCase()];
      if (target) {
        target.focus();
        if (target.type === 'checkbox') target.checked = !target.checked;
        return true;
      }
    }
    if (e.key === 'Enter') {
      const s = Number(size.value);
      if (!Number.isFinite(s) || s < 1 || s > 4000) { err.textContent = 'サイズは 1〜4000 の数値で入力してください'; size.focus(); size.select(); return true; }
      d.close({ family: fam.value, size: Math.round(s * 2) / 2, bold: bold.checked, italic: italic.checked, underline: underline.checked });
      return true;
    }
    return false; // Space でのチェック切り替えや select の矢印操作はブラウザに任せる
  };
  return d.show();
}
