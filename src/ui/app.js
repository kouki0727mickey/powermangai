// アプリ本体: キー入力の振り分け、画面描画、練習モード
import { Editor } from '../core/editor.js';
import {
  SHAPE_TYPES, SHAPE_LABELS, LAYOUTS, createPresentation, createSlide, normalizePresentation, hasText, objFont, objText,
  isLine, displayName, shapeStyles, LINE_WEIGHTS, createObject, allParas, hasTextContent, SLIDE_SIZES,
} from '../core/model.js';
import { findTheme, THEMES } from '../core/colors.js';
import { findAll, compareMatchPos } from '../core/search.js';
import { keyCandidates, findBinding, prettyKey, MODIFIER_KEYS } from '../core/keys.js';
import { BINDINGS, MOVE_STEP, bindingsByCategory } from '../core/shortcuts.js';
import { KeyTipSession, KEYTIPS, keyTipPaths } from '../core/keytips.js';
import { CHALLENGES } from '../core/challenges.js';
import { scorePresentation, imageSimilarity } from '../core/scoring.js';
import { drawSlide, drawSelection, drawObject, slideToDataUrl, measureText, setImageLoadCallback } from './render.js';
import { RichEditor } from './richeditor.js';
import {
  activeDialog, openPalette, openShapeGallery, openGallery, openInput, openList, openConfirm,
  openContent, openHelp, openFontDialog, openSelectionPane, openFormatShape, openTablePicker, openFindReplace, openHeaderFooter, h,
} from './dialogs.js';
import { openPresentationFile, savePresentationFile, openImageFile, setFullScreen, readSystemClipboard, writeSystemClipboardText, imageSize, printDocument } from './platform.js';
import { tableLayout, CELL_INSET, cellDisplayFont } from '../core/table.js';

const FONT_FAMILIES = ['+major', '+minor', 'Yu Gothic UI', '游ゴシック', 'メイリオ', 'MS ゴシック', 'MS 明朝', 'BIZ UDPゴシック', 'Arial', 'Segoe UI', 'Times New Roman', 'Consolas'];
const LINE_SPACINGS = [1, 1.5, 2, 2.5, 3];
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ 状態
const editor = new Editor(createPresentation(), { measure: measureText });
const app = {
  filePath: null,
  savedJson: JSON.stringify(editor.pres),
  keytips: null, // KeyTipSession
  altPending: false,
  show: null, // { index, cover, digits }
  lastRepeat: null,
  practice: newPractice('free'),
  scale: 1,
  view: 'normal', // 'normal' | 'sorter'
  showNotes: true,
  zoom: null, // null = ウィンドウに合わせる、数値 = %
  grid: false,
  guides: false,
  findMatch: null,
  findState: null,
};

function newPractice(mode, extra = {}) {
  return {
    mode, // 'free' | 'challenge' | 'image'
    challenge: null,
    target: null,
    targetImages: [],
    imageUrl: null,
    imageName: '',
    startTime: Date.now(),
    keys: 0,
    mouse: 0,
    used: new Map(), // label → { keys, count }
    hintsVisible: true,
    targetVisible: true,
    ...extra,
  };
}

const isDirty = () => JSON.stringify(editor.pres) !== app.savedJson;

// ------------------------------------------------------------------ 表示ユーティリティ
let statusTimer = null;
function setStatus(msg) {
  $('status-message').textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $('status-message').textContent = ''; }, 5000);
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

function logKey(keys, label, miss = false) {
  const log = $('keylog');
  const item = h('div', { class: `keylog-item${miss ? ' miss' : ''}` }, h('kbd', { text: keys }), label);
  log.append(item);
  while (log.children.length > 5) log.firstChild.remove();
  setTimeout(() => item.remove(), 3000);
}

function eventKeyText(e) {
  const c = keyCandidates(e);
  return c.length ? prettyKey(c[0]) : e.key;
}

// ------------------------------------------------------------------ 描画
const mainCanvas = $('slide-canvas');
const overlay = $('overlay-canvas');
const rich = new RichEditor($('text-box'), $('text-editor'));
rich.onChange = (paras) => editor.previewEdit(paras);

function layout() {
  $('center').hidden = app.view === 'sorter';
  $('sorter').hidden = app.view !== 'sorter';
  $('thumbs').hidden = app.view === 'sorter';
  $('notes-pane').hidden = !app.showNotes;
  const stage = $('stage');
  const { width: SW, height: SH } = editor.size;
  const availW = stage.clientWidth - 32;
  const availH = stage.clientHeight - 32;
  // ズーム 100% = 実寸（1pt = 96/72 px）
  const scale = app.zoom ? (app.zoom / 100) * (96 / 72) : Math.max(0.1, Math.min(availW / SW, availH / SH));
  app.scale = scale;
  const w = Math.round(SW * scale), hgt = Math.round(SH * scale);
  const dpr = window.devicePixelRatio || 1;
  const wrap = $('canvas-wrap');
  wrap.style.width = `${w}px`;
  wrap.style.height = `${hgt}px`;
  for (const c of [mainCanvas, overlay]) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(hgt * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${hgt}px`;
  }
  render();
}

let lastSize = '';
function render() {
  const size = `${editor.pres.width}x${editor.pres.height}`;
  if (size !== lastSize) { lastSize = size; layout(); return; }
  const slide = editor.slide;
  drawSlide(mainCanvas.getContext('2d'), slide, mainCanvas.width, mainCanvas.height, {
    pres: editor.pres, index: editor.slideIndex, showPlaceholder: true, hideTextOf: editor.editingId, hideCell: editor.editingCell,
  });
  const view = editor.editingCell ? editView() : null;
  drawSelection(overlay.getContext('2d'), slide, editor.selection, overlay.width, overlay.height, {
    editingId: editor.editingId, size: editor.size, cellRect: view, grid: app.grid ? 28.35 : 0, guides: app.guides,
  });
  if (app.view === 'sorter') renderSorter();
  renderNotes();
  scrollSelectionIntoView();
  renderThumbs();
  renderTextEditor();
  renderStatus();
  renderPractice();
  renderTitle();
}

let thumbCache = [];
function renderThumbs() {
  const pane = $('thumbs');
  const slides = editor.pres.slides;
  const dpr = window.devicePixelRatio || 1;
  while (pane.children.length > slides.length) pane.lastChild.remove();
  while (pane.children.length < slides.length) {
    const c = document.createElement('canvas');
    c.width = Math.round(150 * dpr);
    c.height = Math.round(84 * dpr);
    pane.append(h('div', { class: 'thumb' }, h('span', { class: 'num' }), c));
  }
  thumbCache.length = slides.length;
  slides.forEach((s, i) => {
    const el = pane.children[i];
    el.classList.toggle('current', i === editor.slideIndex);
    el.classList.toggle('hidden-slide', !!s.hidden);
    el.querySelector('.num').textContent = String(i + 1);
    const json = JSON.stringify(s) + editor.pres.theme + JSON.stringify(editor.pres.headerFooter) + i;
    if (thumbCache[i] !== json) {
      const c = el.querySelector('canvas');
      const hgt = Math.round((c.width * editor.pres.height) / editor.pres.width);
      if (c.height !== hgt) { c.height = hgt; c.style.height = `${Math.round((150 * editor.pres.height) / editor.pres.width)}px`; }
      drawSlide(c.getContext('2d'), s, c.width, c.height, { pres: editor.pres, index: i });
      thumbCache[i] = json;
    }
  });
  pane.children[editor.slideIndex]?.scrollIntoView({ block: 'nearest' });
  pane.classList.toggle('pane-focus', editor.pane === 'slides' && !editor.editingId);
  $('stage').classList.toggle('pane-focus', editor.pane === 'editor' || !!editor.editingId);
  $('notes-pane').classList.toggle('pane-focus', editor.pane === 'notes');
}

/** 編集中の文字の領域（表ならセルを図形に見立てたもの） */
function editView() {
  const obj = editor.editingId ? editor.findObject(editor.editingId) : null;
  if (!obj) return null;
  if (obj.type !== 'table') return obj;
  const { r, c } = editor.editingCell;
  const lay = tableLayout(obj, measureText, editor.theme);
  return {
    type: 'rect', x: obj.x + lay.xs[c], y: obj.y + lay.ys[r], w: obj.colWidths[c], h: lay.heights[r],
    rotation: 0, inset: CELL_INSET, anchor: 'top', wrap: true, paragraphs: obj.cells[r][c].paragraphs,
    displayFont: (f) => cellDisplayFont(obj, r, f),
  };
}

function renderTextEditor() {
  const view = editView();
  if (view && rich.active) rich.position(view, app.scale);
  focusSink();
}

/** ダイアログやスライドショーが無いときは常に編集用要素にフォーカスを置く（IME の入力を受け取るため） */
function focusSink() {
  if (activeDialog() || app.show) return;
  const target = editor.pane === 'notes' ? notesEl : rich.el;
  if (document.activeElement !== target) target.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- ノート・スライド一覧表示
const notesEl = $('notes');
notesEl.addEventListener('input', () => editor.previewNotes(notesEl.value));

function renderNotes() {
  if (editor.pane !== 'notes' && notesEl.value !== editor.slide.notes) notesEl.value = editor.slide.notes;
}

function enterNotes() {
  if (!app.showNotes) { app.showNotes = true; layout(); }
  editor.pane = 'notes';
  editor.beginNotes();
  notesEl.value = editor.slide.notes;
  render();
  focusSink();
  notesEl.setSelectionRange(notesEl.value.length, notesEl.value.length);
}

function leaveNotes() {
  if (editor.pane !== 'notes') return;
  editor.endNotes();
  editor.pane = 'editor';
}

let sorterCache = [];
function sorterColumns() {
  const el = $('sorter');
  return Math.max(1, Math.floor((el.clientWidth - 32 + 18) / (240 + 18)));
}

function renderSorter() {
  const el = $('sorter');
  const slides = editor.pres.slides;
  const dpr = window.devicePixelRatio || 1;
  const H = Math.round((240 * editor.pres.height) / editor.pres.width);
  while (el.children.length > slides.length) el.lastChild.remove();
  while (el.children.length < slides.length) {
    const c = document.createElement('canvas');
    el.append(h('div', { class: 'sorter-item' }, c, h('span', { class: 'num' })));
  }
  sorterCache.length = slides.length;
  slides.forEach((s, i) => {
    const item = el.children[i];
    item.classList.toggle('current', i === editor.slideIndex);
    item.classList.toggle('hidden-slide', !!s.hidden);
    item.querySelector('.num').textContent = String(i + 1);
    const c = item.querySelector('canvas');
    const key = JSON.stringify(s) + editor.pres.theme + JSON.stringify(editor.pres.headerFooter) + H + i;
    if (sorterCache[i] !== key) {
      c.width = Math.round(240 * dpr); c.height = Math.round(H * dpr);
      c.style.width = '240px'; c.style.height = `${H}px`;
      drawSlide(c.getContext('2d'), s, c.width, c.height, { pres: editor.pres, index: i });
      sorterCache[i] = key;
    }
  });
  el.children[editor.slideIndex]?.scrollIntoView({ block: 'nearest' });
}

function setView(view) {
  commitEdit();
  leaveNotes();
  app.view = view;
  editor.pane = view === 'sorter' ? 'sorter' : 'editor';
  editor.selection = [];
  layout();
}

/** ズーム中は選択した図形が見えるようにスクロール */
function scrollSelectionIntoView() {
  if (!app.zoom || !editor.selection.length) return;
  const o = editor.selectedObjects()[0];
  const stage = $('stage');
  const wrap = $('canvas-wrap');
  const s = app.scale;
  const left = wrap.offsetLeft + o.x * s, top = wrap.offsetTop + o.y * s;
  const right = left + o.w * s, bottom = top + o.h * s;
  if (left < stage.scrollLeft || right > stage.scrollLeft + stage.clientWidth) stage.scrollLeft = left - 40;
  if (top < stage.scrollTop || bottom > stage.scrollTop + stage.clientHeight) stage.scrollTop = top - 40;
}

// 図形を選択した状態で IME の変換を始めたら、その図形の文字を置き換えて編集を始める
rich.el.addEventListener('compositionstart', () => {
  if (editor.editingId || editor.pane !== 'editor' || !editor.canEdit() || app.keytips) return;
  editor.startEdit();
  rich.beginFromTyping(editView(), editor.theme, app.scale);
});
// キー操作を伴わない文字の入力（音声入力・一部の入力方式）でも同様に編集を始める
rich.el.addEventListener('beforeinput', (e) => {
  if (rich.active || rich.composing || !e.inputType.startsWith('insert')) return;
  if (editor.editingId || editor.pane !== 'editor' || !editor.canEdit() || app.keytips) return;
  editor.startEdit();
  rich.beginFromTyping(editView(), editor.theme, app.scale);
});
rich.el.addEventListener('input', () => {
  if (rich.active || rich.composing) return;
  // 編集できない状態で入力された文字（IME の確定など）は捨てる
  logKey('文字', editor.selection.length ? 'この図形には文字を入力できません' : '図形が選択されていません（Tab で選択）', true);
  rich.resetSink();
});

function renderStatus() {
  $('status-slide').textContent = `スライド ${editor.slideIndex + 1} / ${editor.pres.slides.length}`;
  $('status-pane').textContent = editor.editingId ? 'テキスト編集中（Esc で終了）'
    : { slides: 'スライド一覧（F6 で編集領域へ）', notes: 'ノート（Esc で編集領域へ）', sorter: 'スライド一覧表示（Enter で標準表示）' }[editor.pane] || '編集領域';
  const sel = editor.selectedObjects();
  let selText = '選択なし（Tab で選択）';
  if (sel.length === 1) selText = `選択: ${displayName(sel[0], editor.slide)}`;
  else if (sel.length > 1) selText = `選択: ${sel.length} 個${sel.every((o) => o.groupId && o.groupId === sel[0].groupId) ? '（グループ）' : ''}`;
  $('status-selection').textContent = selText;
  $('status-view').textContent = `${editor.slide.hidden ? '非表示スライド ／ ' : ''}${app.view === 'sorter' ? 'スライド一覧 ／ ' : ''}ズーム ${app.zoom ? `${app.zoom}%` : 'ウィンドウに合わせる'}${app.grid ? ' ／ グリッド' : ''}${app.guides ? ' ／ ガイド' : ''}`;
}

function renderTitle() {
  const name = app.filePath ? app.filePath.split(/[\\/]/).pop() : '無題';
  $('doc-title').textContent = `${isDirty() ? '● ' : ''}${name}`;
  document.title = `${name} - PowerMangai`;
}

function renderStats() {
  const p = app.practice;
  const sec = Math.floor((Date.now() - p.startTime) / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  $('stats').textContent = `⏱ ${mm}:${ss} ／ キー ${p.keys} 回 ／ マウス ${p.mouse} 回`;
}
setInterval(renderStats, 1000);

function renderPractice() {
  const p = app.practice;
  const panel = $('practice');
  panel.classList.toggle('hidden-target', !p.targetVisible);
  const img = $('target-image');
  const hints = $('hint-list');
  hints.textContent = '';
  $('hints').hidden = !p.hintsVisible || p.mode !== 'challenge';
  if (p.mode === 'challenge') {
    const c = p.challenge;
    $('practice-title').textContent = c.title;
    $('practice-meta').textContent = `${'★'.repeat(c.level)}${'☆'.repeat(4 - c.level)}  ${c.description}\nF9: 採点 ／ F11: お手本の表示切替 ／ Alt → Y → T: ヒント切替`;
    const i = Math.min(editor.slideIndex, p.targetImages.length - 1);
    img.src = p.targetImages[i];
    $('target-caption').textContent = `お手本 スライド ${i + 1} / ${p.targetImages.length}`;
    for (const t of c.hints) hints.append(h('li', { text: t }));
  } else if (p.mode === 'image') {
    $('practice-title').textContent = '画像から再現';
    $('practice-meta').textContent = `「${p.imageName}」を見ながら、ショートカットだけで同じスライドを作りましょう。\nF9: 現在のスライドとの一致度を採点`;
    img.src = p.imageUrl;
    $('target-caption').textContent = 'お手本画像';
  } else {
    $('practice-title').textContent = '自由練習';
    $('practice-meta').textContent = 'F8: 課題を選ぶ\nAlt → Y → I: お手本画像を読み込む\nF1: ショートカット一覧';
    img.removeAttribute('src');
    $('target-caption').textContent = '';
  }
  $('practice-meta').style.whiteSpace = 'pre-line';
}

function renderRibbon() {
  const tabs = $('ribbon-tabs');
  tabs.textContent = '';
  const s = app.keytips;
  const topLevel = s && s.stack.length === 1;
  const activeKey = s && s.stack.length > 1 ? s.path[0] : null;
  for (const t of KEYTIPS.children) {
    const el = h('span', { class: `ribbon-tab${activeKey === t.key ? ' active' : ''}`, text: t.label });
    if (topLevel && t.key.startsWith(s.buffer)) el.append(h('span', { class: 'badge', text: t.key }));
    tabs.append(el);
  }
}

function renderKeytips() {
  renderRibbon();
  const box = $('keytips');
  const s = app.keytips;
  if (!s || s.stack.length === 1) { box.hidden = true; return; }
  box.hidden = false;
  box.textContent = '';
  box.append(h('div', { class: 'kt-path', text: `Alt → ${s.path.flatMap((k) => k.split('')).join(' → ')}　${s.stack.slice(1).map((n) => n.label).join(' › ')}` }));
  for (const c of s.visibleTips()) {
    box.append(h('div', { class: 'kt-item' }, h('span', { class: 'badge', text: c.key }), `${c.label}${c.children ? ' ▸' : ''}`));
  }
  box.append(h('div', { class: 'kt-buffer', text: s.buffer ? `入力中: ${s.buffer}` : 'Esc: 1 つ戻る ／ Alt: 閉じる' }));
}

// ------------------------------------------------------------------ テキスト編集
function beginEdit({ clear = false, select = 'end', cell } = {}) {
  if (!editor.startEdit(cell)) return false;
  rich.begin(editView(), editor.theme, app.scale, { clear, select });
  render();
  return true;
}

function commitEdit() {
  if (!editor.editingId) return;
  const paras = rich.active ? rich.end() : null;
  editor.endEdit(paras ?? undefined);
}

/** カーソル（または [node, offset] の位置）の画面上の縦位置（行の判定用） */
function caretTop(at) {
  let range;
  if (at) {
    range = document.createRange();
    range.setStart(at[0], at[1]);
  } else {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    range = sel.getRangeAt(0).cloneRange();
    range.collapse(false);
  }
  const rect = range.getClientRects()[0] || range.getBoundingClientRect();
  if (rect && rect.height) return rect.top;
  // 空の段落などでは矩形が取れないので、段落要素の位置を使う
  const n = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  return n ? n.getBoundingClientRect().top : null;
}

/** 表のセルの移動（Tab / Shift+Tab / ↑ / ↓）。最後のセルで Tab を押すと行を追加 */
function moveCell(dr, dc) {
  const t = editor.findObject(editor.editingId);
  let { r, c } = editor.editingCell;
  const rows = t.cells.length, cols = t.colWidths.length;
  if (dc) {
    c += dc;
    if (c >= cols) { c = 0; r += 1; }
    if (c < 0) { c = cols - 1; r -= 1; }
  } else {
    r += dr;
  }
  if (r < 0) return false;
  const paras = rich.end();
  if (r >= rows) {
    if (!dc) { editor.moveCell(editor.editingCell.r, editor.editingCell.c, paras); rich.begin(editView(), editor.theme, app.scale); return false; }
    editor.previewEdit(paras);
    editor.tableOp('rowBelow', { r: rows - 1, c: 0 });
  }
  editor.moveCell(r, c, r >= rows ? null : paras);
  rich.begin(editView(), editor.theme, app.scale, { select: dc ? 'all' : 'end' });
  render();
  return true;
}

/** 書式の操作: 文字の編集中は選択した文字に、図形を選択中は図形内のすべての文字に適用 */
const fmt = (textFn, objFn) => (args) => {
  if (editor.editingId && rich.active) return textFn(args);
  if (!editor.selection.length) return needSelection();
  return objFn(args) || (setStatus('文字を含む図形を選択してください'), false);
};

/** ダイアログを開く前に編集中の選択範囲を保存し、閉じた後に戻す */
async function keepTextSelection(fn) {
  const saved = editor.editingId && rich.active ? rich.getSel() : null;
  const r = await fn();
  if (saved && rich.active) { focusSink(); rich.setSel(saved.anchor, saved.focus); }
  return r;
}

/** 現在の文字の書式（編集中はカーソル位置、図形選択中は先頭の文字） */
function currentFont() {
  if (editor.editingId && rich.active) return rich.currentFont();
  const o = editor.selectedObjects().find(hasTextContent);
  return o ? allParas(o)[0].runs[0].font : null;
}

// 編集を続けたまま実行できるアクション
const TEXT_KEEP = new Set([
  'bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'fontGrow', 'fontShrink', 'clearFormat',
  'alignLeft', 'alignCenter', 'alignRight', 'alignJustify', 'changeCase', 'fontDialog', 'help', 'toggleTarget', 'toggleHints',
  'input:fontSize', 'input:fontFamily', 'palette:fontColor', 'bullets', 'numbering', 'demote', 'promote',
  'lineSpacing1', 'lineSpacing15', 'lineSpacing2', 'gallery:lineSpacing', 'moveParaUp', 'moveParaDown',
  'textUndo', 'textRedo', 'copyFormat', 'pasteFormat', 'textAnchor', 'save', 'saveAs', 'palette:cellFill',
]);

// ------------------------------------------------------------------ アクション
const needSelection = () => { setStatus('図形が選択されていません（Tab で選択）'); return false; };
const sel = (fn) => (args) => (editor.selection.length ? fn(args) : needSelection());

async function confirmDiscard() {
  if (!isDirty()) return true;
  return openConfirm('確認', '保存されていない変更があります。破棄して続行しますか？');
}

function markSaved() { app.savedJson = JSON.stringify(editor.pres); renderTitle(); }

function loadPresentation(pres, filePath = null) {
  editor.load(pres);
  app.view = 'normal';
  editor.pane = 'editor';
  sorterCache = [];
  layout();
  app.filePath = filePath;
  thumbCache = [];
  markSaved();
}

const ACTIONS = {
  // ファイル
  newPresentation: async () => {
    if (!(await confirmDiscard())) return;
    loadPresentation(createPresentation());
    app.practice = newPractice('free');
    render();
  },
  open: async () => {
    if (!(await confirmDiscard())) return;
    try {
      const r = await openPresentationFile();
      if (!r) return;
      loadPresentation(normalizePresentation(JSON.parse(r.content)), r.path);
      setStatus('ファイルを開きました');
    } catch (err) {
      await openContent('エラー', h('p', { text: `ファイルを開けませんでした: ${err.message}` }));
    }
  },
  print: async () => {
    const kind = await openList('印刷', [
      { label: 'PDF として保存', value: 'pdf' },
      { label: 'プリンターで印刷', value: 'paper' },
    ]);
    if (!kind) return;
    const withHidden = editor.pres.slides.some((sl) => sl.hidden)
      ? await openList('非表示スライド', [{ label: '非表示スライドを印刷しない', value: false }, { label: '非表示スライドも印刷する', value: true }])
      : false;
    if (withHidden === null) return;
    await printSlides(kind, withHidden);
  },
  save: () => save(false),
  saveAs: () => save(true),

  // 編集
  undo: () => editor.undo() || (setStatus('元に戻す操作はありません'), false),
  redo: () => {
    if (editor.redoStack.length) return editor.redo();
    if (app.lastRepeat) return runAction(app.lastRepeat.action, app.lastRepeat.args, { repeat: true });
    setStatus('やり直す操作はありません');
    return false;
  },
  copy: async () => {
    if (!editor.copy()) return needSelection();
    setStatus('コピーしました');
    await rememberClipboard();
    return true;
  },
  cut: async () => {
    if (!editor.cut()) return needSelection();
    await rememberClipboard();
    return true;
  },
  paste: async () => {
    // スライドの貼り付けはすぐに行う（直後のキー操作と順序が入れ替わらないように）
    if (editor.slidePane && editor.clipboard?.kind === 'slides') return editor.paste();
    // アプリ内でコピーした後に他のアプリで新しくコピーしていれば、そちらを貼り付ける
    const sys = await readSystemClipboard();
    const newerOutside = !editor.clipboard || clipboardSignature(sys) !== app.clipSig;
    if (!newerOutside && editor.paste()) return true;
    if (sys.image) return insertPictureFromDataUrl(sys.image);
    if (sys.text) return pasteTextAsBox(sys.text);
    setStatus('クリップボードが空です');
    return false;
  },
  duplicate: () => editor.duplicate(),
  selectAll: () => editor.selectAll(),
  selectNext: () => editor.selectNext(1),
  selectPrev: () => editor.selectNext(-1),
  escape: () => {
    if (editor.pane === 'notes') { leaveNotes(); render(); return; }
    if (editor.pane === 'slides') { editor.pane = 'editor'; render(); return; }
    if (editor.pane === 'sorter') return;
    editor.clearSelection();
  },
  delete: () => {
    if (editor.slidePane) return editor.deleteSlide();
    return editor.deleteSelection() || needSelection();
  },

  // テキスト
  startEdit: () => {
    if (!editor.selection.length) return needSelection();
    return beginEdit() || (setStatus('この図形には文字を入力できません'), false);
  },
  endEdit: () => { commitEdit(); },
  nextPlaceholder: () => {
    commitEdit();
    const r = editor.nextPlaceholder();
    if (r === 'newSlide') setStatus('新しいスライドを追加しました');
  },
  bold: fmt(() => rich.toggleFont('bold'), () => editor.toggleFont('bold')),
  italic: fmt(() => rich.toggleFont('italic'), () => editor.toggleFont('italic')),
  underline: fmt(() => rich.toggleFont('underline'), () => editor.toggleFont('underline')),
  strike: fmt(() => rich.toggleFont('strike'), () => editor.toggleFont('strike')),
  subscript: fmt(() => rich.toggleBaseline('sub'), () => editor.toggleBaseline('sub')),
  superscript: fmt(() => rich.toggleBaseline('super'), () => editor.toggleBaseline('super')),
  fontGrow: fmt(() => rich.changeFontSize(1), () => editor.changeFontSize(1)),
  fontShrink: fmt(() => rich.changeFontSize(-1), () => editor.changeFontSize(-1)),
  clearFormat: fmt(() => rich.clearFormat(), () => editor.clearCharFormat()),
  changeCase: fmt(() => rich.changeCase(), () => editor.changeCase()),
  alignLeft: fmt(() => rich.setParaProp('align', 'left'), () => editor.setAlign('left')),
  alignCenter: fmt(() => rich.setParaProp('align', 'center'), () => editor.setAlign('center')),
  alignRight: fmt(() => rich.setParaProp('align', 'right'), () => editor.setAlign('right')),
  alignJustify: fmt(() => rich.setParaProp('align', 'justify'), () => editor.setAlign('justify')),
  bullets: fmt(() => rich.toggleBullet('bullet'), () => editor.toggleBullet('bullet')),
  numbering: fmt(() => rich.toggleBullet('number'), () => editor.toggleBullet('number')),
  demote: fmt(() => rich.changeLevel(1), () => editor.changeLevel(1)),
  promote: fmt(() => rich.changeLevel(-1), () => editor.changeLevel(-1)),
  moveParaUp: fmt(() => rich.moveParagraphs(-1), () => false),
  moveParaDown: fmt(() => rich.moveParagraphs(1), () => false),
  lineSpacing1: fmt(() => rich.setParaProp('lineSpacing', 1), () => editor.setParagraphProp('lineSpacing', 1)),
  lineSpacing15: fmt(() => rich.setParaProp('lineSpacing', 1.5), () => editor.setParagraphProp('lineSpacing', 1.5)),
  lineSpacing2: fmt(() => rich.setParaProp('lineSpacing', 2), () => editor.setParagraphProp('lineSpacing', 2)),
  'gallery:lineSpacing': fmt(
    () => keepTextSelection(async () => { const v = await chooseLineSpacing(); if (v) rich.setParaProp('lineSpacing', v); }),
    async () => { const v = await chooseLineSpacing(); if (v) editor.setParagraphProp('lineSpacing', v); return true; },
  ),
  textAnchor: (v) => (editor.editingId || editor.selection.length ? editor.setObjectProp('anchor', v, hasText) || needSelection() : needSelection()),
  textUndo: () => rich.undo() || setStatus('入力中の操作で元に戻せるものはありません'),
  textRedo: () => rich.redo() || setStatus('やり直す操作はありません'),
  copyFormat: fmt(
    () => { rich.copyFormat(); setStatus('文字の書式をコピーしました（Ctrl+Shift+V で貼り付け）'); return true; },
    () => (editor.copyFormat() ? (setStatus('書式をコピーしました（Ctrl+Shift+V で貼り付け）'), true) : false),
  ),
  pasteFormat: fmt(
    () => rich.pasteFormat() || setStatus('書式がコピーされていません（Ctrl+Shift+C）'),
    () => (editor.formatClipboard ? editor.pasteFormat() : (setStatus('書式がコピーされていません（Ctrl+Shift+C）'), true)),
  ),
  fontDialog: fmt(
    () => keepTextSelection(async () => { const r = await openFontDialog(rich.currentFont(), FONT_FAMILIES, editor.theme); if (r) rich.setFontProps(r); }),
    async () => {
      const font = currentFont();
      if (!font) return false;
      const r = await openFontDialog(font, FONT_FAMILIES, editor.theme);
      if (r) editor.setFontProps(r);
      return true;
    },
  ),

  // 図形
  moveUp: sel(() => editor.move(0, -MOVE_STEP)),
  moveDown: sel(() => editor.move(0, MOVE_STEP)),
  moveLeft: sel(() => editor.move(-MOVE_STEP, 0)),
  moveRight: sel(() => editor.move(MOVE_STEP, 0)),
  nudgeUp: sel(() => editor.move(0, -1)),
  nudgeDown: sel(() => editor.move(0, 1)),
  nudgeLeft: sel(() => editor.move(-1, 0)),
  nudgeRight: sel(() => editor.move(1, 0)),
  growW: sel(() => editor.resize(MOVE_STEP, 0)),
  shrinkW: sel(() => editor.resize(-MOVE_STEP, 0)),
  growH: sel(() => editor.resize(0, MOVE_STEP)),
  shrinkH: sel(() => editor.resize(0, -MOVE_STEP)),
  growWFine: sel(() => editor.resize(1, 0)),
  shrinkWFine: sel(() => editor.resize(-1, 0)),
  growHFine: sel(() => editor.resize(0, 1)),
  shrinkHFine: sel(() => editor.resize(0, -1)),
  rotateRight: sel(() => editor.rotate(15)),
  rotateLeft: sel(() => editor.rotate(-15)),
  rotateRightFine: sel(() => editor.rotate(1)),
  rotateLeftFine: sel(() => editor.rotate(-1)),
  rotateBy: sel((deg) => editor.rotate(deg)),
  group: () => editor.group() || (setStatus('グループ化するには 2 つ以上選択してください（Ctrl+A など）'), false),
  ungroup: () => editor.ungroup() || (setStatus('グループが選択されていません'), false),
  bringToFront: sel(() => editor.reorder('front')),
  sendToBack: sel(() => editor.reorder('back')),
  reorder: (mode) => (editor.selection.length ? editor.reorder(mode) : needSelection()),
  arrangeAlign: (mode) => (editor.selection.length ? editor.align(mode) : needSelection()),
  distribute: (axis) => (editor.selection.length ? editor.distribute(axis) : needSelection()),
  insertTextBox: () => {
    editor.pane = 'editor';
    editor.insertObject('text');
    beginEdit();
  },

  // スライド
  newSlide: () => { commitEdit(); editor.newSlide(); },
  nextSlide: () => editor.gotoSlide(editor.slideIndex + 1),
  prevSlide: () => editor.gotoSlide(editor.slideIndex - 1),
  firstSlide: () => editor.gotoSlide(0),
  lastSlide: () => editor.gotoSlide(editor.pres.slides.length - 1),
  moveSlideUp: () => editor.moveSlide(-1),
  moveSlideDown: () => editor.moveSlide(1),
  moveSlideFirst: () => editor.moveSlide(-editor.slideIndex),
  moveSlideLast: () => editor.moveSlide(editor.pres.slides.length - 1 - editor.slideIndex),
  focusEditor: () => { if (app.view === 'sorter') setView('normal'); else { editor.pane = 'editor'; render(); } },
  nextPane: () => togglePane(1),
  prevPane: () => togglePane(-1),
  sorterDown: () => editor.gotoSlide(Math.min(editor.pres.slides.length - 1, editor.slideIndex + sorterColumns())),
  sorterUp: () => editor.gotoSlide(Math.max(0, editor.slideIndex - sorterColumns())),

  // スライドショー
  showFromStart: () => startShow(0, { fromStart: true }),
  showFromCurrent: () => startShow(editor.slideIndex),

  // ギャラリー / パレット / 入力
  'gallery:shapes': async () => {
    const type = await openShapeGallery(SHAPE_TYPES);
    if (!type) return;
    editor.pane = 'editor';
    editor.insertObject(type);
    setStatus(`${SHAPE_LABELS[type]}を挿入しました`);
  },
  'gallery:layout': async () => {
    const layout = await chooseLayout('新しいスライド');
    if (layout) { commitEdit(); editor.newSlide(layout); }
  },
  'palette:fill': sel(async () => {
    const r = await openPalette('図形の塗りつぶし', { current: editor.selectedObjects()[0].fill, theme: editor.theme });
    if (r) editor.setFill(r.color);
  }),
  'palette:stroke': sel(async () => {
    const o = editor.selectedObjects()[0];
    const r = await openPalette('図形の枠線', {
      current: o.stroke, theme: editor.theme,
      extra: [{ key: 'W', label: '太さ', value: 'weight' }, { key: 'S', label: '実線/点線', value: 'dash' }, { key: 'R', label: '矢印', value: 'arrows' }],
    });
    if (!r) return;
    if (!r.action) { editor.setStroke(r.color); return; }
    if (r.action === 'weight') {
      const v = await openList('太さ', LINE_WEIGHTS.map((w) => ({ label: `${w} pt`, value: w })), { initial: Math.max(0, LINE_WEIGHTS.indexOf(o.strokeWidth)) });
      if (v) editor.setStrokeWidth(v);
    } else if (r.action === 'dash') {
      const dashes = [['solid', '実線'], ['dash', '破線'], ['dot', '点線'], ['dashDot', '一点鎖線'], ['longDash', '長破線']];
      const v = await openList('実線 / 点線', dashes.map(([value, label]) => ({ label, value })), { initial: Math.max(0, dashes.findIndex(([d]) => d === o.dash)) });
      if (v) editor.setObjectProp('dash', v);
    } else if (r.action === 'arrows') {
      if (!editor.selectedObjects().some(isLine)) { setStatus('矢印は線を選択しているときに設定できます'); return; }
      const types = [['line', '矢印なし'], ['arrow', '終点に矢印'], ['doubleArrow', '両端に矢印']];
      const v = await openList('矢印', types.map(([value, label]) => ({ label, value })));
      if (v) editor.setLineType(v);
    }
  }),
  'gallery:effects': sel(async () => {
    const v = await openList('図形の効果', [{ label: '影なし', value: 'none' }, { label: '影（外側・右下）', value: 'shadow' }]);
    if (v) editor.setObjectProp('shadow', v === 'shadow');
  }),
  'gallery:shapeStyles': sel(async () => {
    const styles = shapeStyles();
    const items = styles.map((st) => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 40;
      drawObject(c.getContext('2d'), createObject('roundRect', { x: 4, y: 4, w: 56, h: 32, fill: st.fill, stroke: st.stroke, text: 'Abc', font: { size: 13, color: st.text } }), { theme: editor.theme });
      return { label: st.label, value: st, icon: c };
    });
    const v = await openGallery('図形のスタイル', items, { columns: 7 });
    if (v) editor.applyShapeStyle(v) || setStatus('このオブジェクトにはスタイルを適用できません');
  }),
  flip: sel((axis) => editor.flip(axis)),
  formatShape: sel(async () => {
    const objs = editor.selectedObjects();
    const o = objs[0];
    const patch = await openFormatShape(o, {
      theme: editor.theme,
      isLine: isLine(o),
      hasText: hasText(o),
      pickColor: (title, current, allowNone) => openPalette(title, { current, allowNone, theme: editor.theme }),
    });
    if (!patch || !Object.keys(patch).length) return;
    // 複数選択のときは名前は変えない（すべて同じになってしまうため）
    if (objs.length > 1) delete patch.name;
    editor.applyProps(patch);
  }),
  insertTable: async () => {
    let r = await openTablePicker();
    if (r === 'dialog') {
      const cols = await openInput('表の挿入: 列数', { value: 5, validate: (x) => (/^\d+$/.test(x) && x >= 1 && x <= 75 ? null : '1〜75 の整数を入力してください') });
      if (cols === null) return;
      const rows = await openInput('表の挿入: 行数', { value: 2, validate: (x) => (/^\d+$/.test(x) && x >= 1 && x <= 75 ? null : '1〜75 の整数を入力してください') });
      if (rows === null) return;
      r = { rows: Number(rows), cols: Number(cols) };
    }
    if (!r) return;
    editor.pane = 'editor';
    editor.insertTable(r.rows, r.cols);
    beginEdit({ cell: { r: 0, c: 0 } });
    setStatus('表を挿入しました（Tab: 次のセル ／ Esc: 表を選択）');
  },
  insertPicture: async () => {
    let r;
    try { r = await openImageFile(); } catch (err) { await openContent('エラー', h('p', { text: `画像を読み込めませんでした: ${err.message}` })); return; }
    if (!r) return;
    await insertPictureFromDataUrl(r.dataUrl);
  },
  tableOp: (op) => {
    if (!editor.selectedTable()) { setStatus('表を選択してください'); return false; }
    const cell = app.actionCell && app.actionCell.id === editor.selection[0] ? app.actionCell : null;
    const ok = editor.tableOp(op, cell);
    if (!ok) setStatus('これ以上削除できません（表全体は Alt → J → L → D → T）');
    if (cell) {
      // PowerPoint と同じく、同じセル（挿入・削除でずれた位置）で編集を続ける
      const t = editor.selectedTable();
      let { r, c } = cell;
      if (ok && op === 'rowAbove') r += 1;
      if (ok && op === 'colLeft') c += 1;
      r = Math.min(r, t.cells.length - 1);
      c = Math.min(c, t.colWidths.length - 1);
      beginEdit({ cell: { r, c } });
    }
    return ok;
  },
  toggleTableProp: (prop) => {
    const t = editor.selectedTable();
    if (!t) { setStatus('表を選択してください'); return false; }
    return editor.setTableProp(prop, !t[prop]);
  },
  'palette:cellFill': async () => {
    const t = editor.selectedTable();
    if (!t) { setStatus('表を選択してください'); return false; }
    const cell = editor.editingCell ? { ...editor.editingCell } : null;
    const cur = cell ? t.cells[cell.r][cell.c].fill : null;
    const r = await keepTextSelection(() => openPalette(cell ? 'セルの塗りつぶし' : '塗りつぶし（すべてのセル）', { current: cur, theme: editor.theme }));
    if (r) editor.setCellFill(r.color, cell);
    return true;
  },
  pasteSpecial: async () => {
    const sys = await readSystemClipboard();
    const items = [];
    if (editor.clipboard) items.push({ label: 'アプリ内でコピーしたもの（元の書式を保持）', value: 'internal' });
    if (sys.image) items.push({ label: '図（クリップボードの画像）', value: 'image' });
    if (sys.text) items.push({ label: 'テキストのみ保持', value: 'text' });
    if (!items.length) { setStatus('貼り付けるものがありません'); return false; }
    const v = await openList('形式を選択して貼り付け', items);
    if (v === 'internal') editor.paste();
    else if (v === 'image') await insertPictureFromDataUrl(sys.image);
    else if (v === 'text') pasteTextAsBox(sys.text);
    return true;
  },
  // 表示
  viewNormal: () => setView('normal'),
  viewSorter: () => setView('sorter'),
  readingView: () => startShow(editor.slideIndex, { windowed: true }),
  toggleNotes: () => {
    if (app.showNotes && editor.pane === 'notes') leaveNotes();
    app.showNotes = !app.showNotes;
    layout();
    setStatus(app.showNotes ? 'ノート欄を表示しました（F6 で移動）' : 'ノート欄を非表示にしました');
  },
  zoom: async () => {
    const levels = [400, 300, 200, 150, 100, 75, 66, 50, 33];
    const v = await openList('ズーム', [{ label: 'ウィンドウに合わせる', value: 'fit' }, ...levels.map((z) => ({ label: `${z}%`, value: z }))], { initial: app.zoom ? levels.indexOf(app.zoom) + 1 : 0 });
    if (!v) return;
    app.zoom = v === 'fit' ? null : v;
    layout();
  },
  zoomFit: () => { app.zoom = null; layout(); },
  toggleGrid: () => { app.grid = !app.grid; render(); },
  toggleGuides: () => { app.guides = !app.guides; render(); },
  hideSlide: () => setStatus(editor.toggleSlideHidden() ? `スライド ${editor.slideIndex + 1} を非表示スライドにしました（スライドショーで表示されません）` : '非表示を解除しました'),

  // デザイン
  'gallery:themes': async () => {
    const items = THEMES.map((th) => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 72;
      const sample = createSlide('blank');
      sample.objects.push(
        createObject('text', { x: 40, y: 150, w: 880, h: 200, text: 'Aa', font: { size: 150, family: '+major' } }),
        ...['@accent1', '@accent2', '@accent3', '@accent4', '@accent5', '@accent6'].map((col, i) => createObject('rect', { x: 40 + i * 150, y: 420, w: 140, h: 60, fill: col, stroke: null })),
      );
      drawSlide(c.getContext('2d'), sample, 128, 72, { pres: { ...editor.pres, theme: th.id, headerFooter: {} } });
      return { label: th.name, value: th.id, icon: c };
    });
    const v = await openGallery('テーマ', items, { columns: 4 });
    if (v) { editor.setTheme(v); thumbCache = []; }
  },
  'gallery:slideSize': async () => {
    const v = await openList('スライドのサイズ', SLIDE_SIZES.map((sz) => ({ label: sz.label, value: sz })), { initial: SLIDE_SIZES.findIndex((sz) => sz.width === editor.pres.width) });
    if (v && editor.setSlideSize(v)) { thumbCache = []; sorterCache = []; setStatus(`スライドのサイズを ${v.label} にしました`); }
  },
  'palette:background': async () => {
    const r = await openPalette('背景の色（N: テーマの背景に戻す）', { current: editor.slide.background || '@bg1', theme: editor.theme });
    if (!r) return;
    const where = await openList('背景の適用先', [{ label: 'このスライド', value: 'one' }, { label: 'すべてに適用', value: 'all' }]);
    if (where) editor.setBackground(r.color, where === 'all');
  },
  'gallery:changeLayout': async () => {
    const layout = await chooseLayout('レイアウト');
    if (layout) editor.changeLayout(layout);
  },
  headerFooter: async () => {
    const r = await openHeaderFooter(editor.pres.headerFooter);
    if (r) editor.setHeaderFooter(r);
  },

  // 検索・置換
  find: () => findReplace(false),
  replace: () => findReplace(true),

  selectionPane: async () => {
    commitEdit();
    editor.pane = 'editor';
    render();
    await openSelectionPane({
      items: () => [...editor.slide.objects].reverse().map((o) => ({
        id: o.id, name: displayName(o, editor.slide), hidden: o.hidden, selected: editor.selection.includes(o.id),
      })),
      select: (id, add) => editor.toggleSelect(id, add),
      toggleHidden: (id) => editor.toggleHidden(id),
      rename: (id, name) => editor.renameObject(id, name),
      move: (id, dir) => { editor.setSelection([id]); editor.reorder(dir > 0 ? 'forward' : 'backward'); },
    });
  },
  'palette:fontColor': fmt(
    () => keepTextSelection(async () => {
      const r = await openPalette('フォントの色', { current: rich.currentFont().color, allowNone: false, theme: editor.theme });
      if (r) rich.setFontProp('color', r.color);
    }),
    async () => {
      const r = await openPalette('フォントの色', { current: currentFont()?.color, allowNone: false, theme: editor.theme });
      if (r) editor.setFont('color', r.color);
      return true;
    },
  ),
  'input:fontSize': fmt(
    () => keepTextSelection(async () => { const v = await inputFontSize(); if (v !== null) rich.setFontProp('size', v); }),
    async () => { const v = await inputFontSize(); if (v !== null) editor.setFont('size', v); return true; },
  ),
  'input:fontFamily': fmt(
    () => keepTextSelection(async () => { const v = await inputFontFamily(); if (v !== null) rich.setFontProp('family', v); }),
    async () => { const v = await inputFontFamily(); if (v !== null) editor.setFont('family', v); return true; },
  ),
  'input:width': sel(() => inputDimension('w', '幅')),
  'input:height': sel(() => inputDimension('h', '高さ')),

  // 練習
  help: () => openHelp(bindingsByCategory(), keyTipPaths()),
  score: () => score(),
  toggleTarget: () => { app.practice.targetVisible = !app.practice.targetVisible; renderPractice(); },
  toggleHints: () => { app.practice.hintsVisible = !app.practice.hintsVisible; renderPractice(); },
  challengeList: () => chooseChallenge(),
  restartChallenge: async () => {
    const p = app.practice;
    if (p.mode !== 'challenge') { setStatus('課題を選んでいません（F8）'); return; }
    if (await openConfirm('課題をやり直す', '最初からやり直しますか？（現在の作業は破棄されます）')) startChallenge(p.challenge);
  },
  loadTargetImage: () => loadTargetImage(),
};

// ノート欄にいるまま実行できる操作
const NOTES_KEEP = new Set([
  'save', 'saveAs', 'print', 'help', 'score', 'toggleTarget', 'toggleHints', 'challengeList', 'nextPane', 'prevPane', 'escape',
  'showFromStart', 'showFromCurrent', 'toggleGrid', 'toggleGuides', 'zoom', 'zoomFit',
]);

// 繰り返し（F4）の対象にする操作
const REPEATABLE = new Set([
  'duplicate', 'paste', 'bold', 'italic', 'underline', 'fontGrow', 'fontShrink', 'moveUp', 'moveDown', 'moveLeft', 'moveRight',
  'nudgeUp', 'nudgeDown', 'nudgeLeft', 'nudgeRight', 'growW', 'shrinkW', 'growH', 'shrinkH', 'rotateRight', 'rotateLeft',
  'rotateBy', 'newSlide', 'reorder', 'arrangeAlign', 'distribute', 'pasteFormat', 'alignLeft', 'alignCenter', 'alignRight', 'alignJustify',
  'flip', 'strike', 'subscript', 'superscript', 'bullets', 'numbering', 'demote', 'promote',
]);

function clipboardSignature(sys) {
  return `${sys.text || ''}\u0000${sys.image ? `${sys.image.length}:${sys.image.slice(-80)}` : ''}`;
}

/** アプリ内でコピーしたときのシステムのクリップボードの状態を記録（文字があれば書き込む） */
async function rememberClipboard() {
  const clip = editor.clipboard;
  const text = clip && clip.kind === 'objects' ? clip.items.filter(hasTextContent).map((o) => allParas(o).map((p) => p.runs.map((r) => r.text).join('')).join('\n')).filter(Boolean).join('\n') : '';
  await writeSystemClipboardText(text);
  app.clipSig = clipboardSignature(await readSystemClipboard());
  app.clipSeq = (app.clipSeq || 0) + 1;
}

async function insertPictureFromDataUrl(dataUrl) {
  try {
    const size = await imageSize(dataUrl);
    editor.pane = 'editor';
    editor.insertImage(dataUrl, size);
    setStatus('図を挿入しました（Shift+矢印で縦横比を保ったままサイズ変更）');
    return true;
  } catch (err) {
    await openContent('エラー', h('p', { text: err.message }));
    return false;
  }
}

function pasteTextAsBox(text) {
  editor.pane = 'editor';
  const t = editor.insertObject('text', { text: text.replace(/\r\n?/g, '\n'), w: Math.min(editor.pres.width - 80, 600) });
  editor.setSelection([t.id]);
  return true;
}

/** スライドを画像にして印刷用の要素に並べ、PDF 保存 / 印刷する */
async function printSlides(kind, withHidden) {
  commitEdit();
  const root = $('print-root');
  const { width: W, height: H } = editor.pres;
  root.textContent = '';
  const style = document.createElement('style');
  // 用紙サイズはスライドと同じ（1pt = 1px の座標なので、インチ = pt / 72）
  style.textContent = `@page { size: ${W / 72}in ${H / 72}in; margin: 0; }`;
  root.append(style);
  editor.pres.slides.forEach((sl, i) => {
    if (sl.hidden && !withHidden) return;
    const img = document.createElement('img');
    img.src = slideToDataUrl(editor.pres, sl, W * 2, H * 2, i);
    root.append(h('div', { class: 'print-page' }, img));
  });
  root.hidden = false;
  await Promise.all([...root.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
  try {
    const base = (app.filePath ? app.filePath.split(/[\\/]/).pop().replace(/\.pmg\.json$|\.json$|\.pptx$/i, '') : 'presentation');
    const r = await printDocument(kind, `${base}.pdf`);
    if (r?.path) setStatus(`PDF を保存しました: ${r.path}`);
    else if (r && r.ok === false && r.reason && r.reason !== 'cancelled') setStatus(`印刷できませんでした: ${r.reason}`);
  } catch (err) {
    await openContent('エラー', h('p', { text: `印刷できませんでした: ${err.message}` }));
  } finally {
    root.hidden = true;
    root.textContent = '';
  }
}

function chooseLayout(title) {
  const items = LAYOUTS.map(({ id: value, label }) => {
    const c = document.createElement('canvas');
    c.width = 80; c.height = Math.round((80 * editor.pres.height) / editor.pres.width);
    c.style.border = '1px solid #ccc';
    drawSlide(c.getContext('2d'), createSlide(value, editor.size), c.width, c.height, { pres: { ...editor.pres, headerFooter: {} }, showPlaceholder: true });
    return { label, value, icon: c };
  });
  return openGallery(title, items, { columns: 3 });
}

/** 検索 / 置換。ダイアログを閉じると、最後に見つかった文字を選択した状態で編集に移る */
async function findReplace(replace) {
  commitEdit();
  leaveNotes();
  if (app.view === 'sorter') setView('normal');
  const find = (query, opts, dir) => {
    const matches = findAll(editor.pres, query, opts);
    if (!matches.length) { app.findMatch = null; return null; }
    const st = app.findState;
    let index;
    if (!st || st.query !== query || st.matchCase !== opts.matchCase) {
      // 現在のスライド以降で最初の一致から
      index = matches.findIndex((m) => m.slide >= editor.slideIndex);
      if (index === -1) index = 0;
      if (dir < 0) index = (index - 1 + matches.length) % matches.length;
    } else {
      index = (st.index + dir + matches.length) % matches.length;
    }
    app.findState = { query, matchCase: opts.matchCase, index };
    const m = matches[index];
    app.findMatch = m;
    editor.gotoSlide(m.slide);
    editor.setSelection([m.objId]);
    return `${index + 1} / ${matches.length} 件目（スライド ${m.slide + 1}：${displayName(editor.findObject(m.objId), editor.slide)}）`;
  };
  const r = await openFindReplace({
    find,
    replace: (query, repl, opts) => {
      const m = app.findMatch;
      if (!m || !findAll(editor.pres, query, opts).some((x) => JSON.stringify(x) === JSON.stringify(m))) {
        return find(query, opts, 1) || '見つかりませんでした';
      }
      editor.replaceOne(m, repl);
      // 置換した文字の後ろから次を探す（置換後の文字に検索文字列が含まれていても繰り返さない）
      const end = { loc: m.loc, p: m.from.p, o: m.from.o + repl.length };
      const rest = findAll(editor.pres, query, opts);
      if (!rest.length) { app.findMatch = null; return '置換しました。これ以上見つかりません'; }
      const next = rest.findIndex((x) => compareMatchPos({ loc: x.loc, ...x.from }, end) >= 0);
      // 最後まで置換したら先頭に戻らない（置換後の文字の中の一致を置換し続けないため）
      if (next === -1) { app.findMatch = null; app.findState = null; return '置換しました。プレゼンテーションの最後まで検索しました'; }
      app.findState = { query, matchCase: opts.matchCase, index: next - 1 };
      return find(query, opts, 1);
    },
    replaceAll: (query, repl, opts) => {
      const n = query ? editor.replaceAll(query, repl, opts) : 0;
      app.findMatch = null;
      return n ? `${n} 個の項目を置換しました` : '見つかりませんでした';
    },
  }, { replace, query: app.findState?.query || '' });
  if (r?.switchToReplace) { findReplace(true); return; }
  // 見つかった文字を選択して編集に移る（そのまま入力すると置き換えられる）
  const m = app.findMatch;
  if (m && editor.findObject(m.objId) && editor.slideIndex === m.slide) {
    editor.setSelection([m.objId]);
    if (beginEdit({ cell: m.cell || undefined })) rich.setSel(m.from, m.to);
  }
  app.findMatch = null;
}

async function inputFontSize() {
  const v = await openInput('フォント サイズ', {
    value: currentFont()?.size ?? 18,
    suggestions: ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '40', '44', '48', '54', '60', '66', '72', '80', '88', '96'],
    validate: (x) => (Number.isFinite(Number(x)) && Number(x) >= 1 && Number(x) <= 4000 ? null : '1〜4000 の数値を入力してください'),
  });
  return v === null ? null : Math.round(Number(v) * 2) / 2;
}

async function inputFontFamily() {
  const cur = currentFont()?.family ?? '+minor';
  const v = await openInput('フォント（+major = 見出しのフォント、+minor = 本文のフォント）', { value: cur, suggestions: FONT_FAMILIES, validate: (x) => (x ? null : 'フォント名を入力してください') });
  return v;
}

async function chooseLineSpacing() {
  return openList('行間', LINE_SPACINGS.map((v) => ({ label: v.toFixed(1), value: v })));
}

async function inputDimension(prop, label) {
  const cur = Math.round(editor.selectedObjects()[0][prop]);
  const v = await openInput(label, {
    value: cur,
    label: `${label}（pt、スライドは ${editor.pres.width} × ${editor.pres.height}）`,
    validate: (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 5000 ? null : '0〜5000 の数値を入力してください'),
  });
  if (v !== null) editor.setDimension(prop, Number(v));
}

/** F6 / Shift+F6: スライド一覧 → 編集領域 → ノート → … */
function togglePane(dir = 1) {
  if (app.view === 'sorter') return;
  commitEdit();
  const order = ['slides', 'editor', ...(app.showNotes ? ['notes'] : [])];
  const i = Math.max(0, order.indexOf(editor.pane));
  const next = order[(i + dir + order.length) % order.length];
  leaveNotes();
  if (next === 'notes') { enterNotes(); return; }
  editor.pane = next;
  if (next === 'slides') editor.selection = [];
  render();
}

async function save(saveAs) {
  commitEdit();
  try {
    const r = await savePresentationFile(app.filePath, JSON.stringify(editor.pres, null, 2), saveAs);
    if (!r) return;
    app.filePath = r.path;
    markSaved();
    setStatus('保存しました');
  } catch (err) {
    await openContent('エラー', h('p', { text: `保存できませんでした: ${err.message}` }));
  }
}

/** アクションの実行。source は記録用のキー表記 */
async function runAction(action, args, { keys = '', label = '', repeat = false } = {}) {
  const fn = ACTIONS[action];
  if (!fn) { setStatus(`未対応の操作です: ${action}`); return false; }
  // ノート欄で使えない操作（図形の挿入など）は編集領域に戻ってから実行
  if (editor.pane === 'notes' && !NOTES_KEEP.has(action)) { leaveNotes(); render(); }
  // 表のセルを編集中だった場合、そのセルを行・列の操作の基準にする
  app.actionCell = editor.editingCell ? { id: editor.editingId, ...editor.editingCell } : null;
  if (editor.editingId && !TEXT_KEEP.has(action)) commitEdit();
  if (keys) {
    const p = app.practice;
    const entry = p.used.get(label) || { keys, count: 0 };
    entry.count += 1;
    p.used.set(label, entry);
    logKey(keys, label);
  }
  if (REPEATABLE.has(action) && !repeat) app.lastRepeat = { action, args };
  const result = await fn(args);
  focusSink();
  return result;
}

// ------------------------------------------------------------------ KeyTips
function startKeytips() {
  // 文字の編集中もリボンを使えるよう、編集は終了しない（編集を続けられない操作は runAction で確定する）
  app.keytips = new KeyTipSession();
  renderKeytips();
}

function endKeytips() {
  app.keytips = null;
  renderKeytips();
}

function keytipChar(e) {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^(Digit|Numpad)[0-9]$/.test(e.code)) return e.code.slice(-1);
  return e.key.length === 1 ? e.key.toUpperCase() : null;
}

function handleKeytipKey(e) {
  e.preventDefault();
  if (e.key === 'Alt' || e.key === 'F10') { endKeytips(); return; }
  if (e.key === 'Escape') {
    if (!app.keytips.back()) endKeytips();
    else renderKeytips();
    return;
  }
  if (MODIFIER_KEYS.has(e.key)) return;
  const ch = keytipChar(e);
  if (!ch) return;
  const session = app.keytips;
  const r = session.press(ch);
  if (r.type === 'invalid') {
    logKey(`Alt → ${[...session.path.flatMap((k) => k.split('')), ch].join(' → ')}`, 'KeyTips に該当なし', true);
    renderKeytips();
    return;
  }
  if (r.type === 'action') {
    endKeytips();
    const keys = `Alt → ${r.path.flatMap((k) => k.split('')).join(' → ')}`;
    runAction(r.action, r.args, { keys, label: r.label });
    return;
  }
  renderKeytips();
}

// ------------------------------------------------------------------ スライドショー
const showCanvas = $('show-canvas');

/** 非表示スライドを飛ばして、index から dir 方向で最初に表示するスライド（なければ範囲外） */
function visibleSlide(index, dir) {
  const slides = editor.pres.slides;
  let i = index;
  while (i >= 0 && i < slides.length && slides[i].hidden) i += dir;
  return i;
}

function startShow(from, { windowed = false, fromStart = false } = {}) {
  commitEdit();
  leaveNotes();
  // 最初からのときは非表示スライドを飛ばす（現在のスライドからのときは、そのスライドを表示）
  const index = fromStart ? visibleSlide(0, 1) : from;
  app.show = { index, cover: '', digits: '', windowed };
  $('slideshow').hidden = false;
  if (!windowed) setFullScreen(true);
  renderShow();
  // 全画面切り替え後のサイズで描き直す
  setTimeout(renderShow, 300);
}

function endShow() {
  const windowed = app.show?.windowed;
  app.show = null;
  $('slideshow').hidden = true;
  if (!windowed) setFullScreen(false);
  render();
  focusSink();
}

function renderShow() {
  if (!app.show) return;
  const { index, cover } = app.show;
  const vw = window.innerWidth, vh = window.innerHeight;
  const { width: SW, height: SH } = editor.size;
  const scale = Math.min(vw / SW, vh / SH);
  const w = Math.round(SW * scale), hgt = Math.round(SH * scale);
  const dpr = window.devicePixelRatio || 1;
  showCanvas.width = Math.round(w * dpr);
  showCanvas.height = Math.round(hgt * dpr);
  showCanvas.style.width = `${w}px`;
  showCanvas.style.height = `${hgt}px`;
  const ctx = showCanvas.getContext('2d');
  if (index >= editor.pres.slides.length) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, showCanvas.width, showCanvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = `${16 * dpr}px sans-serif`;
    ctx.fillText('スライド ショーの最後です。次へ進むと終了します。', 20 * dpr, 40 * dpr);
  } else {
    drawSlide(ctx, editor.pres.slides[index], showCanvas.width, showCanvas.height, { pres: editor.pres, index });
  }
  const cv = $('show-cover');
  cv.className = cover;
}

function handleShowKey(e) {
  e.preventDefault();
  const s = app.show;
  if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey) { s.digits += e.key; return; }
  if (e.key === 'Enter' && s.digits) {
    const n = Number(s.digits);
    s.digits = '';
    if (n >= 1 && n <= editor.pres.slides.length) { s.index = n - 1; s.cover = ''; renderShow(); }
    return;
  }
  s.digits = '';
  const b = findBinding(BINDINGS, keyCandidates(e), 'show');
  if (!b) return;
  logKey(eventKeyText(e), b.label);
  const last = editor.pres.slides.length - 1;
  switch (b.action) {
    case 'showNext':
      if (s.cover) { s.cover = ''; break; }
      if (s.index > last) { endShow(); return; }
      s.index = Math.min(last + 1, visibleSlide(s.index + 1, 1));
      break;
    case 'showPrev': {
      if (s.cover) { s.cover = ''; break; }
      const prev = visibleSlide(Math.min(s.index, last + 1) - 1, -1);
      if (prev >= 0) s.index = prev;
      break;
    }
    case 'showFirst': s.index = Math.max(0, visibleSlide(0, 1)); s.cover = ''; break;
    case 'showLast': { const v = visibleSlide(last, -1); s.index = v >= 0 ? v : last; s.cover = ''; break; }
    case 'showBlack': s.cover = s.cover === 'black' ? '' : 'black'; break;
    case 'showWhite': s.cover = s.cover === 'white' ? '' : 'white'; break;
    case 'showEnd': endShow(); return;
    default: return;
  }
  renderShow();
}

window.addEventListener('resize', () => { layout(); renderShow(); });

// ------------------------------------------------------------------ 練習モード
function bestKey(id) { return `pmg.best.${id}`; }
function getBest(id) {
  try { return JSON.parse(localStorage.getItem(bestKey(id)) || 'null'); } catch { return null; }
}
function setBest(id, rec) {
  try { localStorage.setItem(bestKey(id), JSON.stringify(rec)); } catch { /* 保存できなくても続行 */ }
}

async function chooseChallenge() {
  const items = CHALLENGES.map((c) => {
    const best = getBest(c.id);
    return {
      label: `${'★'.repeat(c.level)} ${c.title}`,
      sub: c.description,
      right: best ? `最高 ${best.score} 点` : '',
      value: c,
    };
  });
  const cur = app.practice.challenge ? CHALLENGES.indexOf(app.practice.challenge) : 0;
  const c = await openList('課題を選ぶ', items, { initial: cur });
  if (!c) return;
  if (!(await confirmDiscard())) return;
  startChallenge(c);
}

function startChallenge(c) {
  const target = c.target();
  loadPresentation(c.start());
  app.practice = newPractice('challenge', {
    challenge: c,
    target,
    targetImages: target.slides.map((s, i) => slideToDataUrl(target, s, 640, Math.round((640 * target.height) / target.width), i)),
  });
  app.lastRepeat = null;
  render();
  renderStats();
  setStatus(`課題「${c.title}」を開始しました。F9 で採点します`);
}

async function loadTargetImage() {
  let r;
  try {
    r = await openImageFile();
  } catch (err) {
    await openContent('エラー', h('p', { text: `画像を読み込めませんでした: ${err.message}` }));
    return;
  }
  if (!r) return;
  if (!(await confirmDiscard())) return;
  const pres = createPresentation();
  pres.slides = [createSlide('blank', pres)];
  loadPresentation(pres);
  app.practice = newPractice('image', { imageUrl: r.dataUrl, imageName: r.name });
  render();
  setStatus('お手本画像を読み込みました。F9 で一致度を採点します');
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めません'));
    img.src = url;
  });
}

function pixels(drawFn, w, hgt) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, hgt);
  drawFn(ctx);
  return ctx.getImageData(0, 0, w, hgt).data;
}

function elapsedText() {
  const sec = Math.floor((Date.now() - app.practice.startTime) / 1000);
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
}

function usedShortcutsList() {
  const list = h('div');
  const used = [...app.practice.used.entries()].sort((a, b) => b[1].count - a[1].count);
  if (used.length === 0) list.append(h('p', { text: 'まだショートカットを使っていません' }));
  for (const [label, { keys, count }] of used) {
    list.append(h('div', { class: 'help-row' }, h('span', { class: 'keys', text: keys }), h('span', { text: `${label} × ${count}` })));
  }
  return list;
}

async function score() {
  commitEdit();
  const p = app.practice;
  if (p.mode === 'free') {
    await openContent('採点', h('p', { text: '採点するには、課題を選ぶ（F8）か、お手本画像を読み込んで（Alt → Y → I）ください。' }));
    return;
  }
  const body = h('div');
  let scoreValue;
  if (p.mode === 'challenge') {
    const r = scorePresentation(editor.pres, p.target);
    scoreValue = r.score;
    body.append(h('div', { class: 'score-big', text: `${r.score} 点` }));
    body.append(h('div', { class: 'score-meta', text: `一致 ${r.passed} / ${r.total} 項目 ／ 時間 ${elapsedText()} ／ キー ${p.keys} 回 ／ マウス ${p.mouse} 回` }));
    const ng = r.checks.filter((c) => !c.ok);
    if (ng.length) {
      body.append(h('h3', { text: '直すところ' }));
      for (const c of ng) body.append(h('div', { class: 'check ng' }, `✗ ${c.message}`, c.hint ? h('span', { class: 'hint', text: `→ ${c.hint}` }) : null));
    } else {
      body.append(h('p', { text: '🎉 完璧です！お手本どおりに再現できました。' }));
    }
    const okCount = r.checks.filter((c) => c.ok).length;
    if (okCount) {
      body.append(h('h3', { text: `できているところ（${okCount}）` }));
      for (const c of r.checks.filter((x) => x.ok)) body.append(h('div', { class: 'check ok', text: `✓ ${c.message}` }));
    }
    const best = getBest(p.challenge.id);
    if (!best || r.score > best.score || (r.score === best.score && p.keys < best.keys)) {
      setBest(p.challenge.id, { score: r.score, keys: p.keys, time: Date.now() - p.startTime });
      if (best) body.prepend(h('p', { text: '🏆 自己ベスト更新！', style: { color: 'var(--ok)', fontWeight: 'bold' } }));
    }
  } else {
    const W = 192, H = 108;
    try {
      const img = await loadImage(p.imageUrl);
      const a = pixels((ctx) => ctx.drawImage(img, 0, 0, W, H), W, H);
      const b = pixels((ctx) => drawSlide(ctx, editor.slide, W, H, { pres: editor.pres, index: editor.slideIndex }), W, H);
      scoreValue = imageSimilarity(a, b);
    } catch (err) {
      await openContent('エラー', h('p', { text: err.message }));
      return;
    }
    body.append(h('div', { class: 'score-big', text: `一致度 ${scoreValue}%` }));
    body.append(h('div', { class: 'score-meta', text: `時間 ${elapsedText()} ／ キー ${p.keys} 回 ／ マウス ${p.mouse} 回` }));
    body.append(h('p', { text: '色と形の重なり具合から計算した目安です（フォントや画像の余白で 100% にならない場合があります）。' }));
  }
  body.append(h('h3', { text: '使ったショートカット' }), usedShortcutsList());
  await openContent(`採点結果 — ${scoreValue}${p.mode === 'challenge' ? ' 点' : '%'}`, body);
}

// ------------------------------------------------------------------ キー入力
function context() {
  if (editor.editingId) return 'text';
  return editor.pane;
}

function onKeyDown(e) {
  // IME の変換中は一切横取りしない
  if (e.isComposing || e.keyCode === 229) return;
  if (!MODIFIER_KEYS.has(e.key) && !e.repeat) { app.practice.keys += 1; renderStats(); }

  if (app.show) { handleShowKey(e); return; }

  const dlg = activeDialog();
  if (dlg) {
    if (dlg.handleKey(e)) e.preventDefault();
    return;
  }

  if (app.keytips) { handleKeytipKey(e); return; }

  if (e.key === 'Alt') {
    e.preventDefault();
    if (!e.repeat) app.altPending = true;
    return;
  }
  const noMods = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
  if (e.key === 'F10' && noMods) {
    e.preventDefault();
    startKeytips();
    return;
  }

  const ctx = context();
  const candidates = keyCandidates(e);
  const binding = findBinding(BINDINGS, candidates, ctx);

  // Alt+文字 は KeyTips の開始（Alt+矢印など割り当て済みのものを除く）
  if (e.altKey && !e.ctrlKey && !e.metaKey && !binding) {
    app.altPending = false;
    const ch = keytipChar(e);
    if (ch && /^[A-Z0-9]$/.test(ch)) {
      e.preventDefault();
      startKeytips();
      handleKeytipKey(e);
      return;
    }
  }
  app.altPending = false;

  if (binding) {
    e.preventDefault();
    runAction(binding.action, undefined, { keys: prettyKey(candidates.find((c) => binding.keys.includes(c)) || candidates[0]), label: binding.label });
    return;
  }

  if (ctx === 'notes') {
    // ノート欄: 文字入力はそのまま。Tab はフォーカス移動ではなくタブ文字
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (!e.shiftKey) { notesEl.setRangeText('\t', notesEl.selectionStart, notesEl.selectionEnd, 'end'); editor.previewNotes(notesEl.value); }
    }
    return;
  }

  if (ctx === 'text') {
    if (!rich.active || e.ctrlKey || e.metaKey || e.altKey) return; // その他はブラウザの編集操作（単語単位の移動など）に任せる
    // 段落の分割・結合やレベル変更はモデルで処理する（PowerPoint と同じ動作）
    if (editor.editingCell) {
      // 表: Tab / Shift+Tab でセルを移動。↑ / ↓ は先頭 / 末尾の段落にいるとき上下のセルへ
      if (e.key === 'Tab') { e.preventDefault(); moveCell(0, e.shiftKey ? -1 : 1); return; }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
        // カーソルがセルの最初（最後）の行にあるときだけ上下のセルへ移る。それ以外はセル内で行を移動
        rich.sync();
        const up = e.key === 'ArrowUp';
        const edge = up ? { p: 0, o: 0 } : { p: rich.paras.length - 1, o: rich.paras[rich.paras.length - 1].runs.reduce((n, r) => n + r.text.length, 0) };
        const cur = caretTop();
        const edgeTop = caretTop(rich.posToDom(edge));
        if (cur === null || edgeTop === null || Math.abs(cur - edgeTop) < 2) { e.preventDefault(); moveCell(up ? -1 : 1, 0); }
        return;
      }
    }
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) rich.softBreak(); else rich.enter(); return; }
    if (e.key === 'Tab') { e.preventDefault(); rich.tab(e.shiftKey); return; }
    if (e.key === 'Backspace' && !e.shiftKey && rich.backspaceAtStart()) { e.preventDefault(); return; }
    if (e.key === 'Delete' && !e.shiftKey && rich.deleteAtEnd()) { e.preventDefault(); return; }
    return;
  }

  // 図形を選択した状態で文字を入力すると、その図形の文字を置き換えて編集開始（PowerPoint と同じ）
  const printable = e.key.length === 1;
  if (ctx === 'editor' && printable && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (editor.canEdit()) {
      beginEdit({ clear: true });
      rich.insertText(e.key);
      return;
    }
    logKey(eventKeyText(e), editor.selection.length ? 'この図形には文字を入力できません' : '図形が選択されていません（Tab で選択）', true);
    return;
  }

  // 割り当てのないキー: ブラウザ既定の動作（印刷・再読み込みなど）を防ぎ、記録する
  if (!MODIFIER_KEYS.has(e.key)) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) logKey(eventKeyText(e), 'このキーは割り当てられていません', true);
  }
}

function onKeyUp(e) {
  if (e.key === 'Alt' && app.altPending) {
    app.altPending = false;
    e.preventDefault();
    if (!app.show && !activeDialog()) {
      if (app.keytips) endKeytips();
      else startKeytips();
    }
  }
}

window.addEventListener('keydown', onKeyDown, true);
window.addEventListener('keyup', onKeyUp, true);
window.addEventListener('blur', () => { app.altPending = false; });

// ------------------------------------------------------------------ マウス禁止
for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'auxclick', 'wheel', 'dragstart', 'drop', 'dragover']) {
  window.addEventListener(type, (e) => {
    // キーボード操作（Space でチェックボックス切り替えなど）で発生する click は detail が 0
    if ((type === 'click' || type === 'mouseup') && e.detail === 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (type === 'mousedown') {
      app.practice.mouse += 1;
      renderStats();
      toast('マウスは使えません — ショートカットキーで操作しましょう（F1: 一覧）');
    }
  }, { capture: true, passive: false });
}

// ------------------------------------------------------------------ 起動
editor.onChange(() => render());
setImageLoadCallback(() => { thumbCache = []; sorterCache = []; render(); });
renderRibbon();
layout();
renderStats();

openContent('PowerMangai へようこそ', h('div', {},
  h('p', { text: 'PowerPoint のショートカットキーを覚えるための練習アプリです。マウスは使えません。' }),
  h('ul', {},
    h('li', { text: 'F8 … 課題を選ぶ（お手本のスライドを再現して F9 で採点）' }),
    h('li', { text: 'Alt → Y → I … 自分で用意した画像をお手本にして練習' }),
    h('li', { text: 'Alt を押して離す … KeyTips（リボンのキー操作）を表示' }),
    h('li', { text: 'Tab … 図形を選択 ／ Enter・F2 … 文字を編集 ／ Esc … 戻る' }),
    h('li', { text: 'F1 … ショートカット一覧' }),
  ),
  h('p', { text: 'Enter キーで始めましょう。' }),
));

// テスト・デバッグ用
globalThis.__pmg = { editor, app, runAction, rich, text: objText, font: objFont };
