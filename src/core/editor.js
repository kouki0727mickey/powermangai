// エディター状態と編集コマンド（Undo/Redo 付き）。DOM には依存しない。
import {
  clone, createObject, createSlide, createPresentation, newId, bounds, hasText, objText, isLine, allParas, hasTextContent,
} from './model.js';
import { fitTable, createTable, insertRow, insertColumn, deleteRow, deleteColumn } from './table.js';
import {
  fromPlainText, applyFontAll, allRunFonts, normalizeParagraph, MAX_LEVEL,
} from './richtext.js';
import { layoutObjectText, approxMeasure } from './textlayout.js';
import { themeOf } from './colors.js';
import { replaceAll as replaceAllText, replaceMatch } from './search.js';
import { defaultDuration } from './animation.js';

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
const HISTORY_LIMIT = 200;
const PASTE_OFFSET = 16;

export class Editor {
  /** options.measure(font, text): 文字幅の計測（画面では canvas、テストでは概算） */
  constructor(pres = createPresentation(), options = {}) {
    this.measure = options.measure || approxMeasure;
    this.pres = pres;
    this.slideIndex = 0;
    this.selection = [];
    this.editingId = null;
    this._pane = 'editor'; // 'editor' | 'slides' | 'notes' | 'sorter'
    this.slideSel = null; // スライド一覧での複数選択（スライド ID の配列）
    this.slideAnchor = null;
    this.lastDup = null; // 直前の複製（Ctrl+D の間隔を覚えるため）
    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = null; // { kind: 'objects' | 'slides', items, pasteCount }
    this.formatClipboard = null;
    this.listeners = new Set();
    this.lastMessage = '';
  }

  // ---- 基本 ----
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  get slide() { return this.pres.slides[this.slideIndex]; }

  load(pres) {
    this.pres = pres;
    this.slideIndex = 0;
    this.selection = [];
    this.editingId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  snapshot() {
    return JSON.stringify({ pres: this.pres, slideIndex: this.slideIndex, selection: this.selection });
  }

  restore(snap) {
    const s = JSON.parse(snap);
    this.pres = s.pres;
    this.slideIndex = Math.min(s.slideIndex, this.pres.slides.length - 1);
    this.selection = s.selection.filter((id) => this.slide.objects.some((o) => o.id === id));
    this.editingId = null;
  }

  /** プレゼンテーションを変更する操作。変化があった場合だけ履歴に積む。 */
  mutate(fn) {
    const before = this.snapshot();
    const presBefore = JSON.stringify(this.pres);
    const result = fn();
    this.fitAll();
    this.pruneAnimations();
    // 文字の編集中の変更は、編集の終了時に編集全体と合わせて 1 回の操作として履歴に積む
    if (!this.editingId && JSON.stringify(this.pres) !== presBefore) {
      this.undoStack.push(before);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.emit();
    return result;
  }

  get theme() { return themeOf(this.pres); }
  get size() { return { width: this.pres.width, height: this.pres.height }; }

  /** 「テキストに合わせて図形のサイズを調整」: 文字の量に合わせて高さを変える */
  fitText(o) {
    if (o.autoFit !== 'shape' || !hasText(o) || o.vertical) return;
    const h = Math.round(layoutObjectText(o, this.measure, this.theme).contentHeight * 10) / 10;
    if (Math.abs(o.h - h) > 0.05) o.h = h;
  }

  /** 削除されたオブジェクトを対象にしたアニメーションを取り除く */
  pruneAnimations() {
    for (const s of this.pres.slides) {
      if (!s.animations || !s.animations.length) continue;
      const ids = new Set(s.objects.map((o) => o.id));
      if (s.animations.some((a) => !ids.has(a.target))) s.animations = s.animations.filter((a) => ids.has(a.target));
    }
  }

  fitAll() {
    for (const s of this.pres.slides) {
      for (const o of s.objects) {
        if (o.type === 'table') fitTable(o, this.measure, this.theme);
        else this.fitText(o);
      }
    }
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    this.emit();
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    this.emit();
    return true;
  }

  // ---- 選択 ----
  findObject(id) { return this.slide.objects.find((o) => o.id === id) || null; }

  selectedObjects() {
    const set = new Set(this.selection);
    return this.slide.objects.filter((o) => set.has(o.id));
  }

  /** グループを 1 単位として扱った選択単位（Z 順） */
  units() {
    const result = [];
    const seen = new Map();
    for (const o of this.slide.objects) {
      if (o.groupId) {
        if (seen.has(o.groupId)) { seen.get(o.groupId).push(o.id); continue; }
        const unit = [o.id];
        seen.set(o.groupId, unit);
        result.push(unit);
      } else {
        result.push([o.id]);
      }
    }
    return result;
  }

  expandGroups(ids) {
    const groups = new Set(this.slide.objects.filter((o) => ids.includes(o.id) && o.groupId).map((o) => o.groupId));
    return this.slide.objects.filter((o) => ids.includes(o.id) || (o.groupId && groups.has(o.groupId))).map((o) => o.id);
  }

  setSelection(ids) {
    this.selection = this.expandGroups(ids);
    this.editingId = null;
    this.emit();
  }

  /** Tab / Shift+Tab で次（前）のオブジェクトを選択 */
  selectNext(dir = 1) {
    // 非表示（選択ウィンドウで隠した）オブジェクトは Tab で選ばない
    const units = this.units().filter((u) => u.some((id) => !this.findObject(id).hidden));
    if (units.length === 0) { this.setSelection([]); return; }
    const cur = units.findIndex((u) => u.some((id) => this.selection.includes(id)));
    let next;
    if (cur === -1) next = dir > 0 ? 0 : units.length - 1;
    else next = (cur + dir + units.length) % units.length;
    this.setSelection(units[next]);
  }

  selectAll() { this.setSelection(this.slide.objects.filter((o) => !o.hidden).map((o) => o.id)); }

  /** 選択ウィンドウ: 1 つを選択（add = true なら選択に追加 / 解除） */
  toggleSelect(id, add) {
    if (!add) { this.setSelection([id]); return; }
    const ids = this.expandGroups([id]);
    const on = ids.every((x) => this.selection.includes(x));
    this.setSelection(on ? this.selection.filter((x) => !ids.includes(x)) : [...this.selection, ...ids]);
  }
  clearSelection() { this.setSelection([]); }

  // ---- 挿入 ----
  insertObject(type, props = {}) {
    return this.mutate(() => {
      const obj = createObject(type, props);
      this.fitText(obj);
      if (props.x === undefined) obj.x = Math.round((this.pres.width - obj.w) / 2);
      if (props.y === undefined) obj.y = Math.round((this.pres.height - obj.h) / 2);
      this.slide.objects.push(obj);
      this.selection = [obj.id];
      this.editingId = null;
      return obj;
    });
  }

  /** 表の挿入（rows 行 × cols 列）。幅はスライド幅に合わせる */
  insertTable(rows, cols) {
    return this.mutate(() => {
      const t = createTable(rows, cols, { w: this.pres.width - 120 });
      fitTable(t, this.measure, this.theme);
      t.x = Math.round((this.pres.width - t.w) / 2);
      t.y = Math.round((this.pres.height - t.h) / 2);
      this.slide.objects.push(t);
      this.selection = [t.id];
      this.editingId = null;
      return t;
    });
  }

  /** 図の挿入。natural: 画像の元のサイズ（スライドの 8 割に収まるよう縮小） */
  insertImage(src, natural) {
    const maxW = this.pres.width * 0.8, maxH = this.pres.height * 0.8;
    const k = Math.min(1, maxW / natural.w, maxH / natural.h);
    return this.insertObject('image', {
      src, w: Math.round(natural.w * k), h: Math.round(natural.h * k), fill: null, stroke: null, lockAspect: true, name: '',
    });
  }

  /** 選択中の表と、操作の基準にするセル（cell 省略時は末尾の行・列） */
  selectedTable() {
    const objs = this.selectedObjects();
    return objs.length === 1 && objs[0].type === 'table' ? objs[0] : null;
  }

  /** 表の構造の変更。op: rowAbove / rowBelow / colLeft / colRight / deleteRow / deleteCol */
  tableOp(op, cell) {
    const t = this.selectedTable();
    if (!t) return false;
    const r = cell ? cell.r : op === 'rowAbove' ? 0 : t.cells.length - 1;
    const c = cell ? cell.c : op === 'colLeft' ? 0 : t.colWidths.length - 1;
    let ok = true;
    this.mutate(() => {
      switch (op) {
        case 'rowAbove': insertRow(t, r); break;
        case 'rowBelow': insertRow(t, r + 1); break;
        case 'colLeft': insertColumn(t, c); break;
        case 'colRight': insertColumn(t, c + 1); break;
        case 'deleteRow': ok = deleteRow(t, r); break;
        case 'deleteCol': ok = deleteColumn(t, c); break;
        default: ok = false;
      }
    });
    return ok;
  }

  setTableProp(prop, value) {
    const t = this.selectedTable();
    if (!t) return false;
    this.mutate(() => { t[prop] = value; });
    return true;
  }

  /** セルの塗りつぶし（cell 省略時はすべてのセル） */
  setCellFill(color, cell) {
    const t = this.selectedTable();
    if (!t) return false;
    this.mutate(() => {
      if (cell) t.cells[cell.r][cell.c].fill = color;
      else for (const row of t.cells) for (const c of row) c.fill = color;
    });
    return true;
  }

  // ---- 削除 ----
  deleteSelection() {
    if (this.selection.length === 0) return false;
    this.mutate(() => {
      const set = new Set(this.selection);
      this.slide.objects = this.slide.objects.filter((o) => !set.has(o.id));
      this.slide.animations = this.slide.animations.filter((a) => !set.has(a.target));
      this.selection = [];
      this.editingId = null;
    });
    return true;
  }

  // ---- 変形 ----
  updateSelected(fn) {
    if (this.selection.length === 0) return false;
    this.mutate(() => { for (const o of this.selectedObjects()) fn(o); });
    return true;
  }

  move(dx, dy) {
    return this.updateSelected((o) => { o.x += dx; o.y += dy; });
  }

  resize(dw, dh) {
    return this.updateSelected((o) => {
      if (o.type === 'table') {
        // 表は列幅・行の高さを比例して変える（行の高さは文字量より小さくならない）
        const w = Math.max(10, o.w + dw);
        o.colWidths = o.colWidths.map((cw) => (cw * w) / o.w);
        const h = Math.max(10, o.h + dh);
        o.rowHeights = o.rowHeights.map((rh) => Math.max(8, (rh * h) / o.h));
        return;
      }
      if (o.type === 'image' && o.lockAspect !== false && o.h > 0) {
        // 図は縦横比を保つ
        const ratio = o.w / o.h;
        if (dw) { o.w = Math.max(1, o.w + dw); o.h = o.w / ratio; } else { o.h = Math.max(1, o.h + dh); o.w = o.h * ratio; }
        return;
      }
      o.w = Math.max(isLine(o) ? 0 : 1, o.w + dw);
      o.h = Math.max(isLine(o) ? 0 : 1, o.h + dh);
    });
  }

  /** 幅 / 高さを数値で指定（Alt → J → D → W / H） */
  setDimension(prop, value) {
    if (!Number.isFinite(value)) return false;
    return this.updateSelected((o) => {
      o[prop] = Math.max(o.type === 'line' ? 0 : 1, Math.round(value));
    });
  }

  /** 左右 / 上下反転（axis: 'h' | 'v'） */
  flip(axis) {
    return this.updateSelected((o) => {
      if (axis === 'h') o.flipH = !o.flipH;
      else o.flipV = !o.flipV;
    });
  }

  /** 線の太さ。枠線のない図形には枠線を付ける（それ以外の色は変えない） */
  setStrokeWidth(w) {
    return this.updateSelected((o) => {
      o.strokeWidth = w;
      if (!o.stroke) o.stroke = '@accent1';
    });
  }

  /** 線の種類（矢印の有無）を変える: line / arrow / doubleArrow */
  setLineType(type) {
    return this.setObjectProp('type', type, isLine);
  }

  /** 図形のスタイル（塗りつぶし・枠線・文字の色の組み合わせ） */
  applyShapeStyle(style) {
    const objs = this.selectedObjects().filter((o) => !isLine(o) && o.type !== 'image' && o.type !== 'table');
    if (objs.length === 0) return false;
    this.mutate(() => {
      for (const o of objs) {
        o.fill = style.fill;
        o.stroke = style.stroke;
        if (style.text) applyFontAll(o.paragraphs, (f) => { f.color = style.text; });
      }
    });
    return true;
  }

  /** 図形の書式設定ダイアログの結果をまとめて適用（patch は選択中の各オブジェクトに適用） */
  applyProps(patch) {
    return this.updateSelected((o) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        if (k === 'inset') o.inset = { ...o.inset, ...v };
        else if (k === 'fill' && (isLine(o) || o.type === 'image')) continue;
        else o[k] = v;
      }
      if (o.w < (isLine(o) ? 0 : 1)) o.w = 1;
      if (o.h < (isLine(o) ? 0 : 1)) o.h = 1;
      o.rotation = (((o.rotation % 360) + 360) % 360);
    });
  }

  renameObject(id, name) {
    const o = this.findObject(id);
    if (!o || o.name === name) return false;
    this.mutate(() => { o.name = name; });
    return true;
  }

  toggleHidden(id) {
    const o = this.findObject(id);
    if (!o) return false;
    this.mutate(() => {
      o.hidden = !o.hidden;
      // グループの一部だけが選択された状態にならないよう、グループごと選択を外す
      if (o.hidden) {
        const ids = new Set(this.expandGroups([id]));
        this.selection = this.selection.filter((x) => !ids.has(x));
      }
    });
    return true;
  }

  rotate(deg) {
    return this.updateSelected((o) => {
      o.rotation = (((o.rotation + deg) % 360) + 360) % 360;
    });
  }

  // ---- 書式（図形を選択した状態では、図形内のすべての文字に適用） ----
  textObjects() { return this.selectedObjects().filter(hasTextContent); }

  toggleFont(prop) {
    const objs = this.textObjects();
    if (objs.length === 0) return false;
    const value = !objs.every((o) => allRunFonts(allParas(o)).every((f) => f[prop]));
    this.mutate(() => { for (const o of objs) applyFontAll(allParas(o), (f) => { f[prop] = value; }); });
    return true;
  }

  /** 上付き / 下付きの切り替え */
  toggleBaseline(kind) {
    const objs = this.textObjects();
    if (objs.length === 0) return false;
    const value = objs.every((o) => allRunFonts(allParas(o)).every((f) => f.baseline === kind)) ? 0 : kind;
    this.mutate(() => { for (const o of objs) applyFontAll(allParas(o), (f) => { f.baseline = value; }); });
    return true;
  }

  setFont(prop, value) {
    const objs = this.textObjects();
    if (objs.length === 0) return false;
    this.mutate(() => { for (const o of objs) applyFontAll(allParas(o), (f) => { f[prop] = value; }); });
    return true;
  }

  /** フォント ダイアログ: 複数のプロパティをまとめて設定 */
  setFontProps(props) {
    const objs = this.textObjects();
    if (objs.length === 0) return false;
    this.mutate(() => { for (const o of objs) applyFontAll(allParas(o), (f) => Object.assign(f, props)); });
    return true;
  }

  changeFontSize(dir) {
    const objs = this.textObjects();
    if (objs.length === 0) return false;
    this.mutate(() => { for (const o of objs) applyFontAll(allParas(o), (f) => { f.size = stepFontSize(f.size, dir); }); });
    return true;
  }

  clearCharFormat() {
    const objs = this.textObjects();
    if (objs.length === 0) return false;
    this.mutate(() => {
      for (const o of objs) {
        applyFontAll(allParas(o), (f) => { f.bold = false; f.italic = false; f.underline = false; f.strike = false; f.baseline = 0; });
      }
    });
    return true;
  }

  changeCase() {
    const objs = this.selectedObjects().filter((o) => hasText(o) && objText(o));
    if (objs.length === 0) return false;
    this.mutate(() => {
      for (const o of objs) {
        const next = nextCase(objText(o));
        // ランの境界を保ったまま文字だけ置き換える（大文字小文字の変換で文字数は変わらない前提。変わる場合は全体を置換）
        if (next.length === objText(o).length) {
          // 位置は UTF-16 のコード単位でそろえる（絵文字などのサロゲートペアも 2 単位として数える）
          let k = 0;
          const flat = next.replace(/\n/g, '');
          for (const p of o.paragraphs) for (const r of p.runs) { r.text = r.text.split('').map((ch) => (ch === '\n' ? ch : flat[k++])).join(''); }
        } else {
          o.paragraphs = fromPlainText(next, o.paragraphs[0].runs[0].font, { align: o.paragraphs[0].align });
        }
      }
    });
    return true;
  }

  /** 段落の書式（配置・箇条書き・行間など）を図形内のすべての段落に適用 */
  setParagraphProp(prop, value) {
    const objs = this.textObjects();
    if (objs.length === 0) return false;
    this.mutate(() => { for (const o of objs) for (const p of allParas(o)) p[prop] = value; });
    return true;
  }

  setAlign(align) { return this.setParagraphProp('align', align); }

  /** 箇条書き / 段落番号の切り替え（すべての段落が同じ種類なら解除） */
  toggleBullet(kind) {
    const objs = this.textObjects();
    if (objs.length === 0) return false;
    const all = objs.every((o) => allParas(o).every((p) => p.bullet === kind));
    return this.setParagraphProp('bullet', all ? 'none' : kind);
  }

  /** インデントのレベルを増減（Alt+Shift+→ / ←） */
  changeLevel(dir) {
    const objs = this.textObjects();
    if (objs.length === 0) return false;
    this.mutate(() => {
      for (const o of objs) for (const p of allParas(o)) p.level = Math.max(0, Math.min(MAX_LEVEL, p.level + dir));
    });
    return true;
  }

  setObjectProp(prop, value, filter = () => true) {
    const objs = this.selectedObjects().filter(filter);
    if (objs.length === 0) return false;
    this.mutate(() => { for (const o of objs) o[prop] = value; });
    return true;
  }

  setFill(color) {
    return this.setObjectProp('fill', color, (o) => !isLine(o) && o.type !== 'image');
  }

  setStroke(color) {
    return this.setObjectProp('stroke', color);
  }

  /** 図形の文字をプレーンテキストで置き換える（先頭の文字の書式を引き継ぐ） */
  setText(id, text) {
    const obj = this.findObject(id);
    if (!obj || objText(obj) === text) return false;
    this.mutate(() => {
      const p0 = obj.paragraphs[0];
      const { runs, ...props } = p0;
      obj.paragraphs = fromPlainText(text, runs[0].font, props);
    });
    return true;
  }

  /** 図形の文字を段落ごと置き換える（リッチテキスト編集の確定） */
  setParagraphs(id, paragraphs) {
    const obj = this.findObject(id);
    if (!obj) return false;
    const next = paragraphs.map((p) => normalizeParagraph({ ...p, runs: p.runs.map((r) => ({ text: r.text, font: { ...r.font } })) }));
    if (JSON.stringify(next) === JSON.stringify(obj.paragraphs)) return false;
    this.mutate(() => { obj.paragraphs = next; });
    return true;
  }

  copyFormat() {
    const [o] = this.selectedObjects();
    if (!o) return false;
    const p0 = o.paragraphs?.[0];
    this.formatClipboard = clone({
      fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, dash: o.dash, opacity: o.opacity, shadow: o.shadow,
      font: p0 ? p0.runs[0].font : null,
      para: p0 ? { align: p0.align, bullet: p0.bullet, lineSpacing: p0.lineSpacing } : null,
    });
    return true;
  }

  pasteFormat() {
    if (!this.formatClipboard) return false;
    const f = this.formatClipboard;
    return this.updateSelected((o) => {
      if (!isLine(o) && o.type !== 'image') o.fill = f.fill;
      o.stroke = f.stroke;
      o.strokeWidth = f.strokeWidth;
      o.dash = f.dash;
      o.opacity = f.opacity;
      o.shadow = f.shadow;
      if (hasText(o) && f.font) {
        applyFontAll(o.paragraphs, (font) => Object.assign(font, clone(f.font)));
        for (const p of o.paragraphs) Object.assign(p, f.para);
      }
    });
  }

  // ---- 重なり順 ----
  reorder(mode) {
    if (this.selection.length === 0) return false;
    this.mutate(() => {
      const objs = this.slide.objects;
      const set = new Set(this.selection);
      const sel = objs.filter((o) => set.has(o.id));
      const rest = objs.filter((o) => !set.has(o.id));
      if (mode === 'front') this.slide.objects = [...rest, ...sel];
      else if (mode === 'back') this.slide.objects = [...sel, ...rest];
      else {
        // 1 つ前面 / 背面へ：選択群を、隣接する非選択オブジェクトと入れ替える
        const arr = [...objs];
        if (mode === 'forward') {
          for (let i = arr.length - 2; i >= 0; i--) {
            if (set.has(arr[i].id) && !set.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
          }
        } else {
          for (let i = 1; i < arr.length; i++) {
            if (set.has(arr[i].id) && !set.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
          }
        }
        this.slide.objects = arr;
      }
    });
    return true;
  }

  // ---- 配置 ----
  align(mode) {
    const objs = this.selectedObjects();
    if (objs.length === 0) return false;
    const toSlide = this.units().filter((u) => u.some((id) => this.selection.includes(id))).length < 2;
    const ref = toSlide ? { x: 0, y: 0, w: this.pres.width, h: this.pres.height } : bounds(objs);
    this.mutate(() => {
      // グループは 1 単位として動かす
      for (const unit of this.selectedUnits()) {
        const b = bounds(unit);
        let dx = 0, dy = 0;
        if (mode === 'left') dx = ref.x - b.x;
        else if (mode === 'center') dx = ref.x + (ref.w - b.w) / 2 - b.x;
        else if (mode === 'right') dx = ref.x + ref.w - b.w - b.x;
        else if (mode === 'top') dy = ref.y - b.y;
        else if (mode === 'middle') dy = ref.y + (ref.h - b.h) / 2 - b.y;
        else if (mode === 'bottom') dy = ref.y + ref.h - b.h - b.y;
        for (const o of unit) { o.x = Math.round(o.x + dx); o.y = Math.round(o.y + dy); }
      }
    });
    return true;
  }

  selectedUnits() {
    return this.units()
      .filter((u) => u.some((id) => this.selection.includes(id)))
      .map((u) => u.map((id) => this.findObject(id)));
  }

  distribute(axis) {
    const units = this.selectedUnits();
    if (units.length === 0) return false;
    const P = axis === 'h' ? 'x' : 'y';
    const S = axis === 'h' ? 'w' : 'h';
    const items = units.map((u) => ({ unit: u, b: bounds(u) })).sort((a, b) => a.b[P] - b.b[P]);
    let start, end;
    if (items.length < 3) {
      start = 0;
      end = axis === 'h' ? this.pres.width : this.pres.height;
    } else {
      start = items[0].b[P];
      end = Math.max(...items.map((i) => i.b[P] + i.b[S]));
    }
    const total = items.reduce((s, i) => s + i.b[S], 0);
    const gap = items.length < 3 ? (end - start - total) / (items.length + 1) : (end - start - total) / (items.length - 1);
    this.mutate(() => {
      let pos = items.length < 3 ? start + gap : start;
      for (const it of items) {
        const d = Math.round(pos - it.b[P]);
        for (const o of it.unit) o[P] += d;
        pos += it.b[S] + gap;
      }
    });
    return true;
  }

  // ---- グループ ----
  group() {
    if (this.selectedUnits().length < 2) return false;
    this.mutate(() => {
      const gid = newId('g');
      for (const o of this.selectedObjects()) o.groupId = gid;
    });
    return true;
  }

  ungroup() {
    if (!this.selectedObjects().some((o) => o.groupId)) return false;
    this.mutate(() => { for (const o of this.selectedObjects()) o.groupId = null; });
    return true;
  }

  /** スライド単位の操作をするペインか（スライド一覧・一覧表示） */
  get slidePane() { return this.pane === 'slides' || this.pane === 'sorter'; }

  get pane() { return this._pane; }
  set pane(v) {
    this._pane = v;
    if (v !== 'slides' && v !== 'sorter') this.clearSlideSelection();
  }

  // ---- スライドの複数選択（スライド一覧で Shift+↑↓ / Ctrl+A） ----
  clearSlideSelection() { this.slideSel = null; this.slideAnchor = null; }

  /** 操作の対象のスライドの番号（昇順）。複数選択がなければ現在のスライド */
  selectedSlideIndexes() {
    if (this.slideSel && this.slideSel.length > 1) {
      const idx = this.slideSel.map((id) => this.pres.slides.findIndex((s) => s.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
      if (idx.length) return idx;
    }
    return [this.slideIndex];
  }

  targetSlides() { return this.selectedSlideIndexes().map((i) => this.pres.slides[i]); }

  /** Shift+↑↓: 選択範囲を広げる / 狭める */
  extendSlideSelection(dir) {
    if (this.slideAnchor === null) this.slideAnchor = this.slideIndex;
    const to = Math.max(0, Math.min(this.pres.slides.length - 1, this.slideIndex + dir));
    this.slideIndex = to;
    const [a, b] = [Math.min(this.slideAnchor, to), Math.max(this.slideAnchor, to)];
    this.slideSel = this.pres.slides.slice(a, b + 1).map((sl) => sl.id);
    this.selection = [];
    this.emit();
  }

  selectAllSlides() {
    this.slideAnchor = 0;
    this.slideSel = this.pres.slides.map((sl) => sl.id);
    this.emit();
  }

  // ---- クリップボード ----
  copy() {
    if (this.slidePane) {
      this.clipboard = { kind: 'slides', items: clone(this.targetSlides()), pasteCount: 0 };
      return true;
    }
    if (this.selection.length === 0) return false;
    this.clipboard = { kind: 'objects', items: clone(this.selectedObjects()), pasteCount: 0 };
    return true;
  }

  cut() {
    if (this.slidePane) {
      if (!this.copy()) return false;
      return this.deleteSlide();
    }
    if (!this.copy()) return false;
    this.clipboard.pasteCount = -1; // 切り取りは元の位置に貼り付け
    return this.deleteSelection();
  }

  paste() {
    const clip = this.clipboard;
    if (!clip) return false;
    if (clip.kind === 'slides') {
      // 選択中のスライド（複数選択なら最後のスライド）の後ろに貼り付け、貼り付けたスライドを選択する
      const at = this.selectedSlideIndexes().at(-1) + 1;
      this.mutate(() => {
        const slides = clone(clip.items).map((s) => reidSlide(s));
        this.pres.slides.splice(at, 0, ...slides);
        this.slideIndex = at;
        this.clearSlideSelection();
        if (slides.length > 1) { this.slideSel = slides.map((sl) => sl.id); this.slideAnchor = at; }
        this.selection = [];
      });
      return true;
    }
    clip.pasteCount += 1;
    const offset = clip.pasteCount * PASTE_OFFSET;
    this.mutate(() => {
      const objs = reidObjects(clone(clip.items));
      for (const o of objs) { o.x += offset; o.y += offset; }
      this.slide.objects.push(...objs);
      this.selection = objs.map((o) => o.id);
      this.editingId = null;
    });
    return true;
  }

  /**
   * Ctrl+D。複製したものを動かしてからもう一度 Ctrl+D を押すと、同じ間隔で複製する（PowerPoint と同じ）。
   */
  duplicate() {
    if (this.slidePane || this.selection.length === 0) return this.duplicateSlide();
    const cur = this.selectedObjects();
    let dx = PASTE_OFFSET, dy = PASTE_OFFSET;
    const last = this.lastDup;
    if (last && last.slideId === this.slide.id && last.newIds.length === this.selection.length && last.newIds.every((id) => this.selection.includes(id))) {
      dx = cur[0].x - last.srcX;
      dy = cur[0].y - last.srcY;
    }
    this.mutate(() => {
      const objs = reidObjects(clone(cur));
      for (const o of objs) { o.x += dx; o.y += dy; }
      this.slide.objects.push(...objs);
      this.selection = objs.map((o) => o.id);
      this.lastDup = { slideId: this.slide.id, newIds: objs.map((o) => o.id), srcX: cur[0].x, srcY: cur[0].y };
    });
    return true;
  }

  /** 文字列の方向（縦書き / 横書き）。縦書きのテキスト ボックスは自動調整しない */
  setVertical(vertical) {
    return this.updateSelected((o) => {
      if (!hasText(o)) return;
      if (vertical) { o.vertical = true; o.autoFit = 'none'; } else delete o.vertical;
    });
  }

  /** 図形の変更（種類だけを変え、位置・書式・文字は保つ） */
  changeShape(type) {
    return this.setObjectProp('type', type, (o) => !isLine(o) && o.type !== 'image' && o.type !== 'table');
  }

  /** 図形のハイパーリンク（空文字で解除） */
  setShapeLink(url) {
    return this.updateSelected((o) => { if (url) o.link = url; else delete o.link; });
  }

  /** 自動的に切り替えるまでの秒数（null で解除）。all = すべてのスライド */
  setAdvanceAfter(sec, all = false) {
    this.mutate(() => { for (const sl of all ? this.pres.slides : this.targetSlides()) sl.advanceAfter = sec; });
    return true;
  }

  // ---- テキスト編集 ----
  canEdit() {
    const objs = this.selectedObjects();
    return objs.length === 1 && (hasText(objs[0]) || objs[0].type === 'table');
  }

  /** 編集中の段落の置き場所（表ならセル） */
  editTarget() {
    const obj = this.editingId && this.findObject(this.editingId);
    if (!obj) return null;
    if (obj.type === 'table') {
      const { r, c } = this.editingCell;
      return obj.cells[r][c];
    }
    return obj;
  }

  /** 編集を開始。表なら cell（{ r, c }、省略時は左上）のセル */
  startEdit(cell) {
    if (!this.canEdit()) return false;
    this.editingId = this.selection[0];
    this.editingCell = this.findObject(this.editingId).type === 'table' ? (cell || { r: 0, c: 0 }) : null;
    this.editBefore = this.snapshot();
    this.editPresBefore = JSON.stringify(this.pres);
    this.emit();
    return true;
  }

  /** 編集中の文字をその場で反映（履歴には積まない。自動調整の高さやサムネイルを更新するため） */
  previewEdit(paragraphs) {
    const target = this.editTarget();
    if (!target) return;
    target.paragraphs = paragraphs.map((p) => normalizeParagraph({ ...p, runs: p.runs.map((r) => ({ text: r.text, font: { ...r.font } })) }));
    this.fitAll();
    this.emit();
  }

  /** 表のセル間を移動（編集を続けたまま。履歴は編集の終了時にまとめて積む） */
  moveCell(r, c, paragraphs) {
    const obj = this.findObject(this.editingId);
    if (!obj || obj.type !== 'table') return false;
    if (paragraphs) this.previewEdit(paragraphs);
    this.editingCell = { r, c };
    this.emit();
    return true;
  }

  /** 編集を終了。text は段落の配列かプレーンテキスト。編集全体を 1 回の操作として履歴に積む */
  endEdit(text) {
    const id = this.editingId;
    if (!id) return;
    const obj = this.editTarget();
    if (obj && Array.isArray(text)) {
      obj.paragraphs = text.map((p) => normalizeParagraph({ ...p, runs: p.runs.map((r) => ({ text: r.text, font: { ...r.font } })) }));
    } else if (obj && typeof text === 'string' && text !== objText(obj)) {
      const { runs, ...props } = obj.paragraphs[0];
      obj.paragraphs = fromPlainText(text, runs[0].font, props);
    }
    this.fitAll();
    this.editingId = null;
    this.editingCell = null;
    if (JSON.stringify(this.pres) !== this.editPresBefore) {
      this.undoStack.push(this.editBefore);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.emit();
  }

  /** Ctrl+Enter：次のテキスト プレースホルダーへ。最後なら新しいスライド */
  nextPlaceholder() {
    const texts = this.slide.objects.filter((o) => o.ph);
    const cur = texts.findIndex((o) => this.selection.includes(o.id));
    if (cur + 1 < texts.length) {
      this.setSelection([texts[cur + 1].id]);
      return 'select';
    }
    this.newSlide('titleContent');
    return 'newSlide';
  }

  // ---- ノート・デザイン ----
  /** ノートの入力中はその場で反映し、ノート欄を離れるときに 1 回の操作として履歴に積む */
  beginNotes() {
    this.notesBefore = this.snapshot();
    this.notesPresBefore = JSON.stringify(this.pres);
  }

  previewNotes(text) {
    this.slide.notes = text;
    this.emit();
  }

  endNotes() {
    if (!this.notesBefore) return;
    if (JSON.stringify(this.pres) !== this.notesPresBefore) {
      this.undoStack.push(this.notesBefore);
      this.redoStack = [];
    }
    this.notesBefore = null;
  }

  toggleSlideHidden() {
    const value = !this.slide.hidden;
    this.mutate(() => { for (const sl of this.targetSlides()) sl.hidden = value; });
    return value;
  }

  /** 背景の色（all = すべてのスライドに適用、null = テーマの背景） */
  setBackground(color, all = false) {
    this.mutate(() => {
      for (const s of all ? this.pres.slides : this.targetSlides()) s.background = color;
    });
    return true;
  }

  setTheme(id) {
    // 読み込んだテーマ（custom）は、他のテーマに切り替えても戻せるよう保持しておく
    this.mutate(() => { this.pres.theme = id === 'custom' && !this.pres.customTheme ? 'office' : id; });
    return true;
  }

  /** スライドのサイズを変更し、オブジェクトの位置と幅を比例して調整する */
  setSlideSize(size) {
    const kx = size.width / this.pres.width;
    const ky = size.height / this.pres.height;
    if (kx === 1 && ky === 1) return false;
    this.mutate(() => {
      this.pres.width = size.width;
      this.pres.height = size.height;
      for (const s of this.pres.slides) {
        for (const o of s.objects) {
          o.x = Math.round(o.x * kx);
          o.w = Math.round(o.w * kx * 10) / 10;
          o.y = Math.round(o.y * ky);
          o.h = Math.round(o.h * ky * 10) / 10;
          if (o.type === 'table') {
            o.colWidths = o.colWidths.map((w) => w * kx);
            o.rowHeights = o.rowHeights.map((h) => h * ky);
          }
        }
      }
    });
    return true;
  }

  setHeaderFooter(hf) {
    this.mutate(() => { this.pres.headerFooter = { ...this.pres.headerFooter, ...hf }; });
    return true;
  }

  /**
   * スライドのレイアウトを変える。新しいレイアウトのプレースホルダーに、同じ種類の
   * 既存のプレースホルダーの文字を移す。移し先のないプレースホルダーや他のオブジェクトは残す。
   */
  changeLayout(layout) {
    this.mutate(() => {
      const slide = this.slide;
      const fresh = createSlide(layout, this.size);
      const kind = (ph) => (ph === 'ctrTitle' ? 'title' : ph === 'subTitle' ? 'body' : ph);
      const old = slide.objects.filter((o) => o.ph);
      const used = new Set();
      const next = [];
      for (const np of fresh.objects) {
        const match = old.find((o) => !used.has(o) && kind(o.ph) === kind(np.ph));
        if (match) {
          used.add(match);
          // 位置・サイズ・種類は新しいレイアウト、文字は既存のものを使う
          const hasContent = objText(match) !== '';
          next.push({ ...match, x: np.x, y: np.y, w: np.w, h: np.h, ph: np.ph, anchor: np.anchor, placeholder: np.placeholder, paragraphs: hasContent ? match.paragraphs : np.paragraphs });
        } else {
          next.push(np);
        }
      }
      const others = slide.objects.filter((o) => !o.ph || !used.has(o));
      // 使わなかった空のプレースホルダーは削除、文字のあるものは残す
      slide.objects = [...next, ...others.filter((o) => !o.ph || objText(o) !== '')];
      slide.layout = layout;
      this.selection = [];
      this.editingId = null;
    });
    return true;
  }

  /** すべて置換（1 回の操作として履歴に積む） */
  replaceAll(query, replacement, opts) {
    let n = 0;
    this.mutate(() => { n = replaceAllText(this.pres, query, replacement, opts); });
    return n;
  }

  /** 1 つの一致を置換 */
  replaceOne(match, replacement) {
    const obj = this.pres.slides[match.slide]?.objects.find((o) => o.id === match.objId);
    if (!obj) return false;
    this.mutate(() => {
      const paras = match.cell ? obj.cells[match.cell.r][match.cell.c].paragraphs : obj.paragraphs;
      replaceMatch(paras, match, replacement);
    });
    return true;
  }

  // ---- 画面切り替え・アニメーション ----
  /** 画面切り替え（all = すべてのスライドに適用） */
  setTransition(patch, all = false) {
    this.mutate(() => {
      for (const s of all ? this.pres.slides : this.targetSlides()) {
        const next = { type: 'fade', duration: 0.7, ...(s.transition || {}), ...patch };
        s.transition = next.type === 'none' ? null : next;
      }
    });
    return true;
  }

  /** 選択中のオブジェクトの開始効果を設定（既にあれば置き換え、なければ末尾に追加）。null で削除 */
  setAnimation(effect) {
    const ids = this.animTargets();
    if (!ids.length) return false;
    this.mutate(() => {
      const list = this.slide.animations;
      for (const id of ids) {
        const i = list.findIndex((a) => a.target === id);
        if (!effect) { if (i !== -1) list.splice(i, 1); continue; }
        if (i !== -1) {
          // 継続時間を変えていなければ、新しい効果の既定の時間にする（アピール 0.01 秒のままにならないように）
          const old = list[i];
          const duration = old.duration === defaultDuration(old.effect) ? defaultDuration(effect) : old.duration;
          list[i] = { ...old, effect, duration, direction: undefined };
        } else {
          list.push({ target: id, effect, trigger: 'click', duration: defaultDuration(effect) });
        }
      }
    });
    return true;
  }

  /** アニメーションの対象（グループは先頭のメンバーで代表する） */
  animTargets() {
    const out = [];
    const groups = new Set();
    for (const o of this.selectedObjects()) {
      if (o.groupId) { if (groups.has(o.groupId)) continue; groups.add(o.groupId); }
      out.push(o.id);
    }
    return out;
  }

  /** 選択中のオブジェクトのアニメーションの設定を変更（trigger / duration / direction） */
  updateAnimation(patch) {
    const ids = new Set(this.animTargets());
    const list = this.slide.animations.filter((a) => ids.has(a.target));
    if (!list.length) return false;
    this.mutate(() => { for (const a of list) Object.assign(a, patch); });
    return true;
  }

  /** アニメーションの順番を入れ替える（index の項目を dir だけ移動） */
  moveAnimation(index, dir) {
    const list = this.slide.animations;
    const to = index + dir;
    if (index < 0 || index >= list.length || to < 0 || to >= list.length) return false;
    this.mutate(() => { [list[index], list[to]] = [list[to], list[index]]; });
    return true;
  }

  removeAnimationAt(index) {
    if (!this.slide.animations[index]) return false;
    this.mutate(() => { this.slide.animations.splice(index, 1); });
    return true;
  }

  setAnimationAt(index, patch) {
    const a = this.slide.animations[index];
    if (!a) return false;
    this.mutate(() => { Object.assign(a, patch); });
    return true;
  }

  // ---- スライド操作 ----
  gotoSlide(index) {
    const i = Math.max(0, Math.min(this.pres.slides.length - 1, index));
    this.clearSlideSelection();
    if (i === this.slideIndex) { this.emit(); return false; }
    this.slideIndex = i;
    this.selection = [];
    this.editingId = null;
    this.emit();
    return true;
  }

  newSlide(layout) {
    this.mutate(() => {
      const l = layout || (this.pres.slides.length === 0 ? 'title' : 'titleContent');
      this.pres.slides.splice(this.slideIndex + 1, 0, createSlide(l, this.size));
      this.slideIndex += 1;
      this.selection = [];
      this.editingId = null;
    });
    return true;
  }

  /** 選択中のスライドを複製（複数選択なら、最後のスライドの後ろにまとめて） */
  duplicateSlide() {
    const idx = this.selectedSlideIndexes();
    this.mutate(() => {
      const copies = idx.map((i) => reidSlide(clone(this.pres.slides[i])));
      const at = idx[idx.length - 1] + 1;
      this.pres.slides.splice(at, 0, ...copies);
      this.slideIndex = at;
      this.slideSel = copies.length > 1 ? copies.map((c) => c.id) : null;
      this.slideAnchor = copies.length > 1 ? at : null;
      this.selection = [];
    });
    return true;
  }

  /** 選択中のスライドを削除 */
  deleteSlide() {
    const idx = this.selectedSlideIndexes();
    this.mutate(() => {
      for (const i of [...idx].reverse()) this.pres.slides.splice(i, 1);
      if (this.pres.slides.length === 0) this.pres.slides.push(createSlide('blank', this.size));
      this.slideIndex = Math.min(idx[0], this.pres.slides.length - 1);
      this.clearSlideSelection();
      this.selection = [];
      this.editingId = null;
    });
    return true;
  }

  /** 選択中のスライド（連続した範囲）を dir だけ移動 */
  moveSlide(dir) {
    const idx = this.selectedSlideIndexes();
    const first = idx[0], count = idx.length;
    const to = Math.max(0, Math.min(this.pres.slides.length - count, first + dir));
    if (to === first) return false;
    this.mutate(() => {
      const block = this.pres.slides.splice(first, count);
      this.pres.slides.splice(to, 0, ...block);
      this.slideIndex += to - first;
      if (this.slideAnchor !== null) this.slideAnchor += to - first;
    });
    return true;
  }
}

export function stepFontSize(size, dir) {
  if (dir > 0) {
    const next = FONT_SIZES.find((s) => s > size);
    return next ?? Math.min(size + 10, 4000);
  }
  const prev = [...FONT_SIZES].reverse().find((s) => s < size);
  return prev ?? Math.max(1, size - 1);
}

/** Shift+F3：大文字 → 小文字 → 先頭大文字 → 大文字 … の順に切り替え */
export function nextCase(text) {
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();
  const title = lower.replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase());
  if (text === upper && text !== lower) return lower;
  if (text === lower && text !== title) return title;
  return upper;
}

function reidObjects(objs, idMap = new Map()) {
  const groupMap = new Map();
  for (const o of objs) {
    const nid = newId('o');
    idMap.set(o.id, nid);
    o.id = nid;
    if (o.groupId) {
      if (!groupMap.has(o.groupId)) groupMap.set(o.groupId, newId('g'));
      o.groupId = groupMap.get(o.groupId);
    }
  }
  return objs;
}

function reidSlide(slide) {
  slide.id = newId('s');
  const idMap = new Map();
  reidObjects(slide.objects, idMap);
  // アニメーションの対象も新しい ID に付け替える
  slide.animations = (slide.animations || []).filter((a) => idMap.has(a.target)).map((a) => ({ ...a, target: idMap.get(a.target) }));
  return slide;
}
