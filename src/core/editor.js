// エディター状態と編集コマンド（Undo/Redo 付き）。DOM には依存しない。
import {
  SLIDE_W, SLIDE_H, clone, createObject, createSlide, createPresentation, newId, bounds, hasText,
} from './model.js';

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
const HISTORY_LIMIT = 200;
const PASTE_OFFSET = 16;

export class Editor {
  constructor(pres = createPresentation()) {
    this.pres = pres;
    this.slideIndex = 0;
    this.selection = [];
    this.editingId = null;
    this.pane = 'editor'; // 'editor' | 'slides'
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
    if (JSON.stringify(this.pres) !== presBefore) {
      this.undoStack.push(before);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.emit();
    return result;
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
    const units = this.units();
    if (units.length === 0) { this.setSelection([]); return; }
    const cur = units.findIndex((u) => u.some((id) => this.selection.includes(id)));
    let next;
    if (cur === -1) next = dir > 0 ? 0 : units.length - 1;
    else next = (cur + dir + units.length) % units.length;
    this.setSelection(units[next]);
  }

  selectAll() { this.setSelection(this.slide.objects.map((o) => o.id)); }
  clearSelection() { this.setSelection([]); }

  // ---- 挿入 ----
  insertObject(type, props = {}) {
    return this.mutate(() => {
      const obj = createObject(type, props);
      if (props.x === undefined) obj.x = Math.round((SLIDE_W - obj.w) / 2);
      if (props.y === undefined) obj.y = Math.round((SLIDE_H - obj.h) / 2);
      this.slide.objects.push(obj);
      this.selection = [obj.id];
      this.editingId = null;
      return obj;
    });
  }

  // ---- 削除 ----
  deleteSelection() {
    if (this.selection.length === 0) return false;
    this.mutate(() => {
      const set = new Set(this.selection);
      this.slide.objects = this.slide.objects.filter((o) => !set.has(o.id));
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
      o.w = Math.max(o.type === 'line' ? 0 : 1, o.w + dw);
      o.h = Math.max(o.type === 'line' ? 0 : 1, o.h + dh);
    });
  }

  /** 幅 / 高さを数値で指定（Alt → J → D → W / H） */
  setDimension(prop, value) {
    if (!Number.isFinite(value)) return false;
    return this.updateSelected((o) => {
      o[prop] = Math.max(o.type === 'line' ? 0 : 1, Math.round(value));
    });
  }

  rotate(deg) {
    return this.updateSelected((o) => {
      o.rotation = (((o.rotation + deg) % 360) + 360) % 360;
    });
  }

  // ---- 書式 ----
  toggleFont(prop) {
    const objs = this.selectedObjects().filter(hasText);
    if (objs.length === 0) return false;
    const value = !objs.every((o) => o.font[prop]);
    this.mutate(() => { for (const o of objs) o.font[prop] = value; });
    return true;
  }

  setFont(prop, value) {
    return this.updateSelected((o) => { if (hasText(o)) o.font[prop] = value; });
  }

  changeFontSize(dir) {
    return this.updateSelected((o) => {
      if (!hasText(o)) return;
      o.font.size = stepFontSize(o.font.size, dir);
    });
  }

  clearCharFormat() {
    return this.updateSelected((o) => {
      if (!hasText(o)) return;
      o.font.bold = false;
      o.font.italic = false;
      o.font.underline = false;
    });
  }

  changeCase() {
    const objs = this.selectedObjects().filter((o) => o.text);
    if (objs.length === 0) return false;
    this.mutate(() => {
      for (const o of objs) o.text = nextCase(o.text);
    });
    return true;
  }

  setAlign(align) {
    return this.updateSelected((o) => { if (hasText(o)) o.align = align; });
  }

  setFill(color) {
    return this.updateSelected((o) => { if (o.type !== 'line') o.fill = color; });
  }

  setStroke(color) {
    return this.updateSelected((o) => { o.stroke = color; });
  }

  setText(id, text) {
    const obj = this.findObject(id);
    if (!obj || obj.text === text) return false;
    this.mutate(() => { obj.text = text; });
    return true;
  }

  copyFormat() {
    const [o] = this.selectedObjects();
    if (!o) return false;
    this.formatClipboard = clone({ fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, font: o.font, align: o.align });
    return true;
  }

  pasteFormat() {
    if (!this.formatClipboard) return false;
    const f = this.formatClipboard;
    return this.updateSelected((o) => {
      if (o.type !== 'line') o.fill = f.fill;
      o.stroke = f.stroke;
      o.strokeWidth = f.strokeWidth;
      o.font = { ...f.font };
      o.align = f.align;
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
    const ref = toSlide ? { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H } : bounds(objs);
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
      end = axis === 'h' ? SLIDE_W : SLIDE_H;
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

  // ---- クリップボード ----
  copy() {
    if (this.pane === 'slides') {
      this.clipboard = { kind: 'slides', items: [clone(this.slide)], pasteCount: 0 };
      return true;
    }
    if (this.selection.length === 0) return false;
    this.clipboard = { kind: 'objects', items: clone(this.selectedObjects()), pasteCount: 0 };
    return true;
  }

  cut() {
    if (this.pane === 'slides') {
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
      this.mutate(() => {
        const slides = clone(clip.items).map((s) => reidSlide(s));
        this.pres.slides.splice(this.slideIndex + 1, 0, ...slides);
        this.slideIndex += 1;
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

  duplicate() {
    if (this.pane === 'slides' || this.selection.length === 0) return this.duplicateSlide();
    this.mutate(() => {
      const objs = reidObjects(clone(this.selectedObjects()));
      for (const o of objs) { o.x += PASTE_OFFSET; o.y += PASTE_OFFSET; }
      this.slide.objects.push(...objs);
      this.selection = objs.map((o) => o.id);
    });
    return true;
  }

  // ---- テキスト編集 ----
  canEdit() {
    const objs = this.selectedObjects();
    return objs.length === 1 && hasText(objs[0]);
  }

  startEdit() {
    if (!this.canEdit()) return false;
    this.editingId = this.selection[0];
    this.emit();
    return true;
  }

  endEdit(text) {
    const id = this.editingId;
    if (!id) return;
    this.editingId = null;
    if (text !== undefined && this.setText(id, text)) return;
    this.emit();
  }

  /** Ctrl+Enter：次のテキスト プレースホルダーへ。最後なら新しいスライド */
  nextPlaceholder() {
    const texts = this.slide.objects.filter((o) => o.type === 'text');
    const cur = texts.findIndex((o) => this.selection.includes(o.id));
    if (cur + 1 < texts.length) {
      this.setSelection([texts[cur + 1].id]);
      return 'select';
    }
    this.newSlide('titleContent');
    return 'newSlide';
  }

  // ---- スライド操作 ----
  gotoSlide(index) {
    const i = Math.max(0, Math.min(this.pres.slides.length - 1, index));
    if (i === this.slideIndex) return false;
    this.slideIndex = i;
    this.selection = [];
    this.editingId = null;
    this.emit();
    return true;
  }

  newSlide(layout) {
    this.mutate(() => {
      const l = layout || (this.pres.slides.length === 0 ? 'title' : 'titleContent');
      this.pres.slides.splice(this.slideIndex + 1, 0, createSlide(l));
      this.slideIndex += 1;
      this.selection = [];
      this.editingId = null;
    });
    return true;
  }

  duplicateSlide() {
    this.mutate(() => {
      const copy = reidSlide(clone(this.slide));
      this.pres.slides.splice(this.slideIndex + 1, 0, copy);
      this.slideIndex += 1;
      this.selection = [];
    });
    return true;
  }

  deleteSlide() {
    this.mutate(() => {
      this.pres.slides.splice(this.slideIndex, 1);
      if (this.pres.slides.length === 0) this.pres.slides.push(createSlide('blank'));
      this.slideIndex = Math.min(this.slideIndex, this.pres.slides.length - 1);
      this.selection = [];
      this.editingId = null;
    });
    return true;
  }

  moveSlide(dir) {
    const to = this.slideIndex + dir;
    if (to < 0 || to >= this.pres.slides.length) return false;
    this.mutate(() => {
      const [s] = this.pres.slides.splice(this.slideIndex, 1);
      this.pres.slides.splice(to, 0, s);
      this.slideIndex = to;
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

function reidObjects(objs) {
  const groupMap = new Map();
  for (const o of objs) {
    o.id = newId('o');
    if (o.groupId) {
      if (!groupMap.has(o.groupId)) groupMap.set(o.groupId, newId('g'));
      o.groupId = groupMap.get(o.groupId);
    }
  }
  return objs;
}

function reidSlide(slide) {
  slide.id = newId('s');
  reidObjects(slide.objects);
  return slide;
}
