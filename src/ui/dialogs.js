// キーボードだけで操作するダイアログ群。すべて Promise を返し、キャンセル時は null。
import { paletteGrid, resolveColor, DEFAULT_THEME, resolveFontFamily } from '../core/colors.js';
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
  constructor(title, foot, { side = false } = {}) {
    this.side = side;
    this.el = h('div', { class: `dialog${side ? ' side' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
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
    root().classList.toggle('side', stack.every((d) => d.side));
    this.focus();
    return this.promise;
  }

  focus() { this.el.tabIndex = -1; this.el.focus(); }

  close(result = null) {
    const i = stack.indexOf(this);
    if (i !== -1) stack.splice(i, 1);
    this.el.remove();
    root().classList.toggle('side', stack.length > 0 && stack.every((d) => d.side));
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
/** extra: [{ key: 'W', label: '太さ', value: 'weight' }] — 押すと { action: value } を返す */
export function openPalette(title, { current = null, allowNone = true, theme = DEFAULT_THEME, extra = [] } = {}) {
  const grid = paletteGrid(theme);
  const extraText = extra.map((x) => ` ／ ${x.key}: ${x.label}`).join('');
  const d = new Dialog(title, `矢印キー: 移動 ／ Enter: 決定${allowNone ? ' ／ N: なし' : ''}${extraText} ／ Esc: キャンセル`);
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
  // 現在の色に印を付ける（テーマ参照が一致するもの、なければ見た目の色が同じもの）
  const curHex = current ? resolveColor(current, theme) : null;
  const mark = cells.find((x) => x.color.value === current) || cells.find((x) => x.color.hex === curHex);
  if (mark) mark.el.style.boxShadow = 'inset 0 0 0 2px #fff, inset 0 0 0 3px #000';
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
        d.close({ color: pos.r === NONE ? null : grid[pos.r][pos.c].value });
        return true;
      case 'ArrowRight': if (pos.r !== NONE) pos.c = (pos.c + 1) % 10; break;
      case 'ArrowLeft': if (pos.r !== NONE) pos.c = (pos.c + 9) % 10; break;
      case 'ArrowDown': pos.r = (pos.r + 1) % rows; break;
      case 'ArrowUp': pos.r = (pos.r - 1 + rows) % rows; break;
      case 'Home': pos.c = 0; break;
      case 'End': pos.c = 9; break;
      default:
        if (allowNone && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.altKey) { d.close({ color: null }); return true; }
        {
          const x = extra.find((it) => it.key.toLowerCase() === e.key.toLowerCase());
          if (x && !e.ctrlKey && !e.altKey) { d.close({ action: x.value }); return true; }
        }
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
export function openGallery(title, items, { columns = 4, compact = false } = {}) {
  const d = new Dialog(title, compact ? '矢印キー: 移動 ／ Enter: 決定 ／ Esc: キャンセル' : `矢印キー: 移動 ／ Enter: 決定 ／ 1〜${Math.min(9, items.length)}: 直接選択 ／ Esc: キャンセル`);
  const grid = h('div', { class: `gallery${compact ? ' compact' : ''}`, style: { gridTemplateColumns: `repeat(${columns}, ${compact ? '36px' : '96px'})` } });
  const els = items.map((it, i) => {
    const el = h('div', { class: 'item' }, it.icon || null, h('div', { text: compact ? it.label : `${i < 9 ? `${i + 1}. ` : ''}${it.label}` }));
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
        if (!compact && /^[1-9]$/.test(e.key) && Number(e.key) <= n) { d.close(items[Number(e.key) - 1].value); return true; }
        return true;
    }
    render();
    return true;
  };
  render();
  return d.show();
}

export function openShapeGallery(types) {
  return openGallery('図形の挿入', types.map((t) => ({ label: SHAPE_LABELS[t], value: t, icon: shapeIcon(t) })), { columns: 7 });
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
export function openFontDialog(font, fontFamilies, theme = DEFAULT_THEME) {
  const d = new Dialog('フォント', 'Tab / Shift+Tab: 項目の移動 ／ Space: チェック切り替え ／ ↑↓: 選択肢 ／ Alt+文字: 項目へ移動 ／ Enter: OK ／ Esc: キャンセル');
  const fam = h('select', { id: 'fd-family' });
  const families = fontFamilies.includes(font.family) ? fontFamilies : [font.family, ...fontFamilies];
  const famLabel = (f) => (f === '+major' ? `見出しのフォント（${resolveFontFamily(f, theme)}）` : f === '+minor' ? `本文のフォント（${resolveFontFamily(f, theme)}）` : f);
  for (const f of families) fam.append(h('option', { value: f, text: famLabel(f) }));
  fam.value = font.family;
  const size = h('input', { type: 'text', id: 'fd-size' });
  size.value = String(font.size);
  const cb = (id, checked) => { const c = h('input', { type: 'checkbox', id }); c.checked = checked; return c; };
  const bold = cb('fd-bold', font.bold);
  const italic = cb('fd-italic', font.italic);
  const underline = cb('fd-underline', font.underline);
  const strike = cb('fd-strike', !!font.strike);
  const sup = cb('fd-super', font.baseline === 'super');
  const sub = cb('fd-sub', font.baseline === 'sub');
  // 上付きと下付きは同時に選べない
  sup.addEventListener('change', () => { if (sup.checked) sub.checked = false; });
  sub.addEventListener('change', () => { if (sub.checked) sup.checked = false; });
  const row = (labelText, el, key) => h('div', { class: 'form-row' }, h('label', { for: el.id, text: `${labelText}${key ? ` (${key})` : ''}` }), el);
  d.body.append(
    row('フォント', fam, 'F'), row('サイズ', size, 'S'),
    row('太字', bold, 'B'), row('斜体', italic, 'I'), row('下線', underline, 'U'),
    row('取り消し線', strike, 'K'), row('上付き', sup, 'P'), row('下付き', sub, 'N'),
  );
  const err = h('div', { style: { color: 'var(--ng)', minHeight: '18px' } });
  d.body.append(err);
  const fields = [fam, size, bold, italic, underline, strike, sup, sub];
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
      const map = { f: fam, s: size, b: bold, i: italic, u: underline, k: strike, p: sup, n: sub };
      const target = map[e.code.replace(/^Key/, '').toLowerCase()];
      if (target) {
        target.focus();
        if (target.type === 'checkbox') { target.checked = !target.checked; target.dispatchEvent(new Event('change')); }
        return true;
      }
      return true;
    }
    if (e.key === 'Enter') {
      const s = Number(size.value);
      if (!Number.isFinite(s) || s < 1 || s > 4000) { err.textContent = 'サイズは 1〜4000 の数値で入力してください'; size.focus(); size.select(); return true; }
      d.close({
        family: fam.value, size: Math.round(s * 2) / 2, bold: bold.checked, italic: italic.checked, underline: underline.checked,
        strike: strike.checked, baseline: sup.checked ? 'super' : sub.checked ? 'sub' : 0,
      });
      return true;
    }
    return false; // Space でのチェック切り替えや select の矢印操作はブラウザに任せる
  };
  return d.show();
}

// ---------------------------------------------------------------- 選択ウィンドウ
/**
 * api: { items() → [{ id, name, hidden, selected }], select(id, add), toggleHidden(id), rename(id, name), move(id, dir) }
 * 画面右に表示し、スライドは暗くしない。
 */
export function openSelectionPane(api) {
  const d = new Dialog('選択', '↑↓: 移動 ／ Space: 選択 ／ Ctrl+Space: 選択に追加・解除 ／ F2: 名前の変更 ／ Ctrl+Shift+H: 表示 / 非表示 ／ Ctrl+Shift+↑↓: 前面 / 背面へ ／ Enter・Esc: 閉じる', { side: true });
  const ul = h('ul', { class: 'list' });
  d.body.append(ul);
  let sel = 0;
  let renaming = null;
  const render = () => {
    const items = api.items();
    sel = Math.max(0, Math.min(items.length - 1, sel));
    ul.textContent = '';
    if (!items.length) ul.append(h('li', { text: 'このスライドにはオブジェクトがありません' }));
    items.forEach((it, i) => {
      const li = h('li', { class: i === sel ? 'sel' : '' },
        h('span', { text: it.selected ? '●' : '　', style: { color: 'var(--focus)' } }),
        h('span', { text: it.name, style: { opacity: it.hidden ? 0.45 : 1 } }),
        h('span', { class: 'best', text: it.hidden ? '非表示' : '' }));
      ul.append(li);
    });
    ul.children[sel]?.scrollIntoView({ block: 'nearest' });
  };
  d.handleKey = (e) => {
    if (renaming) {
      if (e.isComposing) return false;
      if (e.key === 'Enter') { api.rename(renaming.id, renaming.input.value.trim()); renaming = null; render(); d.focus(); return true; }
      if (e.key === 'Escape') { renaming = null; render(); d.focus(); return true; }
      return false;
    }
    const items = api.items();
    const cur = items[sel];
    switch (e.key) {
      case 'Escape': case 'Enter': case 'F6': d.close(true); return true;
      case 'ArrowDown':
        if (e.ctrlKey && e.shiftKey && cur) { api.move(cur.id, -1); sel = Math.min(items.length - 1, sel + 1); break; }
        sel = Math.min(items.length - 1, sel + 1); break;
      case 'ArrowUp':
        if (e.ctrlKey && e.shiftKey && cur) { api.move(cur.id, 1); sel = Math.max(0, sel - 1); break; }
        sel = Math.max(0, sel - 1); break;
      case 'Home': sel = 0; break;
      case 'End': sel = items.length - 1; break;
      case ' ':
        if (cur) api.select(cur.id, e.ctrlKey || e.metaKey);
        break;
      case 'F2':
        if (cur) {
          const input = h('input', { type: 'text', 'aria-label': '名前' });
          input.value = cur.name;
          ul.children[sel].replaceChildren(input);
          renaming = { id: cur.id, input };
          input.focus();
          input.select();
        }
        return true;
      default:
        if (e.key === 'F10' && e.altKey) { d.close(true); return true; }
        if ((e.key === 'H' || e.key === 'h') && e.ctrlKey && e.shiftKey && cur) { api.toggleHidden(cur.id); break; }
        return true;
    }
    render();
    return true;
  };
  render();
  return d.show();
}

// ---------------------------------------------------------------- 図形の書式設定
/**
 * o: 選択中の先頭のオブジェクト。pickColor(title, current, allowNone) → Promise<{ color } | null>。
 * 戻り値: 変更するプロパティ（patch）か null。
 */
export function openFormatShape(o, { theme = DEFAULT_THEME, pickColor, isLine = false, hasText = true } = {}) {
  const d = new Dialog('図形の書式設定', 'Tab / Shift+Tab: 項目の移動 ／ Space: 色の選択・チェック切り替え ／ Enter: OK ／ Esc: キャンセル');
  const fields = [];
  const num = (id, label, value, step = 1) => {
    const el = h('input', { type: 'text', id, inputmode: 'decimal' });
    el.value = String(Math.round(value * 100) / 100);
    el.dataset.step = String(step);
    fields.push(el);
    return h('div', { class: 'form-row' }, h('label', { for: id, text: label }), el);
  };
  const colorBtn = (id, label, value, allowNone) => {
    const sw = h('span', { class: 'swatch-inline' });
    const txt = h('span');
    const btn = h('button', { type: 'button', id, class: 'color-btn' }, sw, ' ', txt);
    btn.dataset.value = value ?? '';
    const paint = () => {
      const v = btn.dataset.value || null;
      sw.style.background = v ? resolveColor(v, theme) : 'transparent';
      txt.textContent = v ? resolveColor(v, theme) : 'なし';
    };
    paint();
    btn.addEventListener('click', async () => {
      const r = await pickColor(label, btn.dataset.value || null, allowNone);
      if (r && !r.action) { btn.dataset.value = r.color ?? ''; paint(); }
      btn.focus();
    });
    fields.push(btn);
    return h('div', { class: 'form-row' }, h('label', { for: id, text: label }), btn);
  };
  const check = (id, label, checked) => {
    const el = h('input', { type: 'checkbox', id });
    el.checked = checked;
    fields.push(el);
    return h('div', { class: 'form-row' }, h('label', { for: id, text: label }), el);
  };
  const select = (id, label, options, value) => {
    const el = h('select', { id });
    for (const [v, t] of options) el.append(h('option', { value: v, text: t }));
    el.value = value;
    fields.push(el);
    return h('div', { class: 'form-row' }, h('label', { for: id, text: label }), el);
  };
  const section = (t) => h('h3', { text: t, style: { margin: '10px 0 4px', fontSize: '13px' } });
  d.body.append(
    section('サイズと位置'),
    num('fs-x', '横位置 (X)', o.x), num('fs-y', '縦位置 (Y)', o.y),
    num('fs-w', '幅', o.w), num('fs-h', '高さ', o.h), num('fs-rot', '回転 (°)', o.rotation),
    check('fs-lock', '縦横比を固定', false),
    section('塗りつぶしと線'),
  );
  if (!isLine) d.body.append(colorBtn('fs-fill', '塗りつぶしの色', o.fill, true), num('fs-alpha', '透明度 (%)', Math.round((1 - (o.opacity ?? 1)) * 100)));
  else d.body.append(num('fs-alpha', '透明度 (%)', Math.round((1 - (o.opacity ?? 1)) * 100)));
  d.body.append(
    colorBtn('fs-stroke', '線の色', o.stroke, true),
    num('fs-sw', '線の幅 (pt)', o.strokeWidth, 0.25),
    select('fs-dash', '実線 / 点線', [['solid', '実線'], ['dash', '破線'], ['dot', '点線'], ['dashDot', '一点鎖線'], ['longDash', '長破線']], o.dash || 'solid'),
    section('効果'),
    check('fs-shadow', '影', !!o.shadow),
  );
  if (hasText) {
    d.body.append(
      section('テキスト ボックス'),
      select('fs-anchor', '垂直方向の配置', [['top', '上'], ['middle', '上下中央'], ['bottom', '下']], o.anchor),
      select('fs-autofit', '自動調整', [['none', '自動調整なし'], ['shape', 'テキストに合わせて図形のサイズを調整']], o.autoFit),
      check('fs-wrap', '図形内でテキストを折り返す', o.wrap !== false),
      num('fs-il', '左余白', o.inset.l, 0.1), num('fs-it', '上余白', o.inset.t, 0.1),
      num('fs-ir', '右余白', o.inset.r, 0.1), num('fs-ib', '下余白', o.inset.b, 0.1),
    );
  }
  const nameEl = h('input', { type: 'text', id: 'fs-name' });
  nameEl.value = o.name || '';
  fields.push(nameEl);
  const altEl = h('input', { type: 'text', id: 'fs-alt' });
  altEl.value = o.alt || '';
  fields.push(altEl);
  d.body.append(section('その他'), h('div', { class: 'form-row' }, h('label', { for: 'fs-name', text: '名前' }), nameEl),
    h('div', { class: 'form-row' }, h('label', { for: 'fs-alt', text: '代替テキスト' }), altEl));
  const err = h('div', { style: { color: 'var(--ng)', minHeight: '18px' } });
  d.body.append(err);

  const val = (id) => d.el.querySelector(`#${id}`);
  const lockRatio = o.h ? o.w / o.h : 1;
  // 縦横比を固定しているときは、幅（高さ）の変更に合わせて高さ（幅）も変える
  val('fs-w').addEventListener('input', () => { if (val('fs-lock').checked && Number.isFinite(Number(val('fs-w').value))) val('fs-h').value = String(Math.round((Number(val('fs-w').value) / lockRatio) * 100) / 100); });
  val('fs-h').addEventListener('input', () => { if (val('fs-lock').checked && Number.isFinite(Number(val('fs-h').value))) val('fs-w').value = String(Math.round(Number(val('fs-h').value) * lockRatio * 100) / 100); });

  d.focus = () => { fields[0].focus(); fields[0].select?.(); };
  d.handleKey = (e) => {
    if (e.isComposing) return false;
    if (e.key === 'Escape') { d.close(null); return true; }
    if (e.key === 'Tab') {
      const i = fields.indexOf(document.activeElement);
      const next = (i + (e.shiftKey ? -1 : 1) + fields.length) % fields.length;
      fields[next].focus();
      fields[next].select?.();
      return true;
    }
    if (e.key === 'Enter') {
      const n = (id) => Number(val(id).value);
      const nums = ['fs-x', 'fs-y', 'fs-w', 'fs-h', 'fs-rot', 'fs-sw', 'fs-alpha', ...(hasText ? ['fs-il', 'fs-it', 'fs-ir', 'fs-ib'] : [])];
      const bad = nums.find((id) => val(id) && !Number.isFinite(n(id)));
      if (bad) { err.textContent = '数値を入力してください'; val(bad).focus(); val(bad).select(); return true; }
      if (n('fs-alpha') < 0 || n('fs-alpha') > 100) { err.textContent = '透明度は 0〜100 で入力してください'; val('fs-alpha').focus(); return true; }
      if (n('fs-w') < 0 || n('fs-h') < 0 || n('fs-sw') < 0) { err.textContent = 'サイズと線の幅は 0 以上で入力してください'; return true; }
      if (hasText && ['fs-il', 'fs-it', 'fs-ir', 'fs-ib'].some((id) => n(id) < 0)) { err.textContent = '余白は 0 以上で入力してください'; return true; }
      const patch = {
        x: n('fs-x'), y: n('fs-y'), w: n('fs-w'), h: n('fs-h'), rotation: n('fs-rot'),
        opacity: 1 - n('fs-alpha') / 100,
        stroke: val('fs-stroke').dataset.value || null,
        strokeWidth: n('fs-sw'),
        dash: val('fs-dash').value,
        shadow: val('fs-shadow').checked,
        name: nameEl.value.trim(),
        alt: altEl.value.trim(),
      };
      if (!isLine) patch.fill = val('fs-fill').dataset.value || null;
      if (hasText) {
        patch.anchor = val('fs-anchor').value;
        patch.autoFit = val('fs-autofit').value;
        patch.wrap = val('fs-wrap').checked;
        patch.inset = { l: n('fs-il'), t: n('fs-it'), r: n('fs-ir'), b: n('fs-ib') };
      }
      // 変更した項目だけを返す（複数選択のとき、触っていない項目を先頭の図形の値で上書きしないため）
      const orig = {
        x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.rotation, opacity: o.opacity ?? 1, stroke: o.stroke ?? null,
        strokeWidth: o.strokeWidth, dash: o.dash || 'solid', shadow: !!o.shadow, name: o.name || '', alt: o.alt || '', fill: o.fill ?? null,
        anchor: o.anchor, autoFit: o.autoFit, wrap: o.wrap !== false,
      };
      const round = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const changed = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'inset') {
          const ins = {};
          for (const side of ['l', 't', 'r', 'b']) if (round(v[side]) !== round(o.inset[side])) ins[side] = v[side];
          if (Object.keys(ins).length) changed.inset = ins;
        } else if (round(v) !== round(orig[k])) {
          changed[k] = v;
        }
      }
      d.close(changed);
      return true;
    }
    return false; // Space（色ボタン・チェック）や select の矢印はブラウザに任せる
  };
  return d.show();
}

// ---------------------------------------------------------------- 表の挿入
/** PowerPoint と同じく、升目を矢印キーで広げて Enter。I で行数・列数を入力 */
export function openTablePicker() {
  const COLS = 10, ROWS = 8;
  const d = new Dialog('表の挿入', '矢印キー: 行数・列数 ／ Enter: 挿入 ／ I: 数値で指定 ／ Esc: キャンセル');
  const label = h('div', { style: { marginBottom: '6px', fontWeight: 'bold' } });
  const grid = h('div', { class: 'table-picker' });
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const el = h('div'); cells.push({ r, c, el }); grid.append(el); }
  d.body.append(label, grid);
  const size = { r: 2, c: 3 };
  const render = () => {
    label.textContent = `表 (${size.c} × ${size.r})`;
    for (const x of cells) x.el.classList.toggle('on', x.r < size.r && x.c < size.c);
  };
  d.handleKey = (e) => {
    switch (e.key) {
      case 'Escape': d.close(null); return true;
      case 'Enter': d.close({ rows: size.r, cols: size.c }); return true;
      case 'ArrowRight': size.c = Math.min(COLS, size.c + 1); break;
      case 'ArrowLeft': size.c = Math.max(1, size.c - 1); break;
      case 'ArrowDown': size.r = Math.min(ROWS, size.r + 1); break;
      case 'ArrowUp': size.r = Math.max(1, size.r - 1); break;
      default:
        if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.altKey) {
          d.close('dialog');
          return true;
        }
        return true;
    }
    render();
    return true;
  };
  render();
  return d.show();
}

// ---------------------------------------------------------------- 検索と置換
/**
 * api: { find(query, opts, dir) → 件数の文字列 | null, replace(query, repl, opts) → 文字列, replaceAll(query, repl, opts) → 文字列 }
 * 右側に表示（スライドは暗くしない）。閉じると最後に見つかった箇所の編集に移る。
 */
export function openFindReplace(api, { replace = false, query = '' } = {}) {
  const d = new Dialog(replace ? '置換' : '検索',
    `Enter: 次を検索 ／ Shift+Enter: 前を検索${replace ? ' ／ Alt+R: 置換 ／ Alt+A: すべて置換' : ' ／ Ctrl+H: 置換へ'} ／ Alt+C: 大文字と小文字を区別 ／ Tab: 項目の移動 ／ Esc: 閉じる`,
    { side: true });
  const q = h('input', { type: 'text', id: 'fr-query', 'aria-label': '検索する文字列' });
  q.value = query;
  const r = h('input', { type: 'text', id: 'fr-repl', 'aria-label': '置換後の文字列' });
  const mc = h('input', { type: 'checkbox', id: 'fr-case' });
  const status = h('div', { role: 'status', style: { minHeight: '20px', marginTop: '8px', color: 'var(--muted)' } });
  d.body.append(h('div', { class: 'form-row' }, h('label', { for: 'fr-query', text: '検索する文字列' })), q);
  if (replace) d.body.append(h('div', { class: 'form-row' }, h('label', { for: 'fr-repl', text: '置換後の文字列' })), r);
  d.body.append(h('div', { class: 'form-row' }, h('label', { for: 'fr-case', text: '大文字と小文字を区別する (C)' }), mc), status);
  const fields = replace ? [q, r, mc] : [q, mc];
  d.focus = () => { q.focus(); q.select(); };
  const opts = () => ({ matchCase: mc.checked });
  d.handleKey = (e) => {
    if (e.isComposing) return false;
    if (e.key === 'Escape') { d.close({ query: q.value }); return true; }
    if (e.key === 'Tab') {
      const i = fields.indexOf(document.activeElement);
      fields[(i + (e.shiftKey ? -1 : 1) + fields.length) % fields.length].focus();
      return true;
    }
    if (e.key === 'Enter') {
      status.textContent = api.find(q.value, opts(), e.shiftKey ? -1 : 1) || '見つかりませんでした';
      return true;
    }
    if (e.altKey && !e.ctrlKey) {
      const k = e.code.replace(/^Key/, '').toLowerCase();
      if (k === 'c') { mc.checked = !mc.checked; return true; }
      if (replace && k === 'r') { status.textContent = api.replace(q.value, r.value, opts()); return true; }
      if (replace && k === 'a') { status.textContent = api.replaceAll(q.value, r.value, opts()); return true; }
      return true;
    }
    if (!replace && e.ctrlKey && e.key.toLowerCase() === 'h') { d.close({ query: q.value, switchToReplace: true }); return true; }
    return false;
  };
  return d.show();
}

// ---------------------------------------------------------------- ヘッダーとフッター
export function openHeaderFooter(hf) {
  const d = new Dialog('ヘッダーとフッター', 'Tab: 項目の移動 ／ Space: チェック切り替え ／ Alt+文字: 項目へ移動 ／ Enter: すべてに適用 ／ Esc: キャンセル');
  const cb = (id, label, checked, key) => {
    const el = h('input', { type: 'checkbox', id });
    el.checked = checked;
    return [el, h('div', { class: 'form-row' }, h('label', { for: id, text: `${label} (${key})` }), el)];
  };
  const [date, dateRow] = cb('hf-date', '日付と時刻', hf.date, 'D');
  const [num, numRow] = cb('hf-num', 'スライド番号', hf.slideNumber, 'N');
  const [foot, footRow] = cb('hf-foot', 'フッター', hf.showFooter, 'F');
  const text = h('input', { type: 'text', id: 'hf-text', 'aria-label': 'フッターの文字' });
  text.value = hf.footer || '';
  const [hide, hideRow] = cb('hf-hide', 'タイトル スライドに表示しない', hf.hideOnTitle, 'S');
  d.body.append(dateRow, numRow, footRow, text, hideRow);
  const fields = [date, num, foot, text, hide];
  d.focus = () => date.focus();
  d.handleKey = (e) => {
    if (e.isComposing) return false;
    if (e.key === 'Escape') { d.close(null); return true; }
    if (e.key === 'Tab') {
      const i = fields.indexOf(document.activeElement);
      fields[(i + (e.shiftKey ? -1 : 1) + fields.length) % fields.length].focus();
      return true;
    }
    if (e.altKey && !e.ctrlKey) {
      const map = { d: date, n: num, f: foot, s: hide };
      const t = map[e.code.replace(/^Key/, '').toLowerCase()];
      if (t) { t.focus(); t.checked = !t.checked; }
      return true;
    }
    if (e.key === 'Enter') {
      d.close({ date: date.checked, slideNumber: num.checked, showFooter: foot.checked, footer: text.value, hideOnTitle: hide.checked });
      return true;
    }
    return false;
  };
  return d.show();
}

// ---------------------------------------------------------------- アニメーション ウィンドウ
/**
 * api: { items() → [{ label, sub }], move(i, dir), remove(i), trigger(i, t), select(i) }
 */
export function openAnimationPane(api) {
  const d = new Dialog('アニメーション ウィンドウ', '↑↓: 移動 ／ Ctrl+↑↓: 順番の変更 ／ C / W / A: クリック時・同時・後 ／ Delete: 削除 ／ Space: 図形を選択 ／ Enter・Esc: 閉じる', { side: true });
  const ul = h('ul', { class: 'list' });
  d.body.append(ul);
  let sel = 0;
  const render = () => {
    const items = api.items();
    sel = Math.max(0, Math.min(items.length - 1, sel));
    ul.textContent = '';
    if (!items.length) ul.append(h('li', { text: 'このスライドにはアニメーションがありません（Alt → A → S で追加）' }));
    items.forEach((it, i) => ul.append(h('li', { class: i === sel ? 'sel' : '' }, h('span', { text: `${i + 1}.` }), h('span', { text: it.label }), h('span', { class: 'sub', text: it.sub }))));
    ul.children[sel]?.scrollIntoView({ block: 'nearest' });
  };
  d.handleKey = (e) => {
    const n = api.items().length;
    switch (e.key) {
      case 'Escape': case 'Enter': d.close(true); return true;
      case 'ArrowDown':
        if (e.ctrlKey) { if (api.move(sel, 1)) sel += 1; } else sel = Math.min(n - 1, sel + 1);
        break;
      case 'ArrowUp':
        if (e.ctrlKey) { if (api.move(sel, -1)) sel -= 1; } else sel = Math.max(0, sel - 1);
        break;
      case 'Delete': case 'Backspace': if (n) api.remove(sel); break;
      case ' ': if (n) api.select(sel); break;
      default: {
        const t = { c: 'click', w: 'with', a: 'after' }[e.key.toLowerCase()];
        if (t && n && !e.ctrlKey && !e.altKey) api.trigger(sel, t);
        else return true;
      }
    }
    render();
    return true;
  };
  render();
  return d.show();
}
