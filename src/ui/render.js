// Canvas へのスライド描画（編集画面・サムネイル・スライドショー・お手本画像で共通）
import { SLIDE_W, SLIDE_H, bounds, isLine, hasText } from '../core/model.js';
import { layoutObjectText, effectiveFont, layoutVertical } from '../core/textlayout.js';
import { buildShape, buildDetail, EVENODD } from '../core/shapes.js';
import { resolveColor, themeOf, DEFAULT_THEME } from '../core/colors.js';
import { tableLayout, cellDisplayFont } from '../core/table.js';
import { chartLayout } from '../core/chart.js';

const FONT_FALLBACK = '"Yu Gothic UI", "Yu Gothic", Meiryo, "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", sans-serif';

/** font は effectiveFont 済み（family 解決済み）を想定 */
export function fontCss(font) {
  const family = font.family && font.family[0] !== '+' ? `"${font.family.replace(/"/g, '')}", ${FONT_FALLBACK}` : FONT_FALLBACK;
  return `${font.italic ? 'italic ' : ''}${font.bold ? 'bold ' : ''}${font.size}px ${family}`;
}

// ---- 文字幅の計測（キャッシュ付き）
let measureCtx = null;
const measureCache = new Map();
export function measureText(font, text) {
  const css = fontCss(font);
  const key = `${css}\u0000${text}`;
  let w = measureCache.get(key);
  if (w === undefined) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = css;
    w = measureCtx.measureText(text).width;
    if (measureCache.size > 20000) measureCache.clear();
    measureCache.set(key, w);
  }
  // 文字の間隔は 1 文字ごとに足す（描画の letterSpacing と同じ）
  return font.spacing ? w + font.spacing * Array.from(text).length : w;
}

/** 蛍光ペンの色の帯（文字の高さ分） */
function highlightRect(ctx, f, x, y, w, h, theme) {
  if (!f.highlight) return;
  ctx.fillStyle = resolveColor(f.highlight, theme);
  ctx.fillRect(x, y, w, h);
}

// ---- 画像のキャッシュ（読み込み完了時に再描画を依頼）
const images = new Map();
let onImageLoad = () => {};
export function setImageLoadCallback(fn) { onImageLoad = fn; }
function getImage(src) {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => onImageLoad();
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

const DASH = {
  solid: [], dash: [4, 3], dot: [1, 1], dashDot: [4, 3, 1, 3], longDash: [8, 3],
};

function drawArrowHead(ctx, x1, y1, x2, y2, size, color) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.fillStyle = color;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a - 0.45), y2 - size * Math.sin(a - 0.45));
  ctx.lineTo(x2 - size * Math.cos(a + 0.45), y2 - size * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** リンクの文字はテーマのハイパーリンクの色で下線付き */
function displayColor(f, theme) {
  return resolveColor(f.link ? '@hlink' : f.color, theme);
}

/** 縦書きの文字を描画（原点はオブジェクトの左上） */
function drawVertical(ctx, o, theme) {
  const { cols } = layoutVertical(o, measureText, theme);
  for (const c of cols) {
    if (c.bullet) {
      ctx.font = fontCss(c.bullet.font);
      ctx.fillStyle = resolveColor(c.bullet.font.color, theme);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(c.bullet.text, c.x, c.bullet.y);
    }
    ctx.letterSpacing = '0px';
    for (const ch of c.chars) {
      const f = ch.font;
      highlightRect(ctx, f, c.x - c.width / 2, ch.y, c.width, ch.adv, theme);
      ctx.font = fontCss(f);
      ctx.fillStyle = displayColor(f, theme);
      ctx.save();
      if (ch.upright) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const sx = ch.shift ? f.size * 0.3 : 0, sy = ch.shift ? -f.size * 0.3 : 0;
        ctx.fillText(ch.ch, c.x + sx, ch.y + ch.adv / 2 + sy);
      } else {
        ctx.translate(c.x, ch.y);
        ctx.rotate(Math.PI / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch.ch, 0, 0);
      }
      ctx.restore();
      // 縦書きの下線は文字の右側
      if ((f.underline || f.link) && ch.ch.trim()) ctx.fillRect(c.x + c.width / 2 - Math.max(1, f.base / 16), ch.y, Math.max(1, f.base / 16), ch.adv);
    }
  }
}

/** 段落のレイアウト結果を描画（原点はオブジェクトの左上） */
export function drawTextLines(ctx, lines, theme) {
  ctx.textBaseline = 'alphabetic';
  for (const ln of lines) {
    if (ln.bullet) {
      ctx.font = fontCss(ln.bullet.font);
      ctx.fillStyle = resolveColor(ln.bullet.font.color, theme);
      ctx.fillText(ln.bullet.text, ln.bullet.x, ln.baseline);
    }
    for (const s of ln.segs) {
      const f = s.font;
      const base = f.base || f.size;
      highlightRect(ctx, f, s.x, ln.baseline - base * 0.95, s.w, base * 1.2, theme);
      ctx.font = fontCss(f);
      ctx.fillStyle = displayColor(f, theme);
      ctx.letterSpacing = `${f.spacing || 0}px`;
      const y = ln.baseline + (f.dy || 0);
      ctx.fillText(s.text, s.x, y);
      ctx.letterSpacing = '0px';
      const lw = Math.max(1, f.base / 16);
      if ((f.underline || f.link) && s.text.trim()) ctx.fillRect(s.x, y + Math.max(1, f.base * 0.1), s.w, lw);
      if (f.strike && s.text.trim()) ctx.fillRect(s.x, y - f.size * 0.3, s.w, lw);
    }
  }
}

/** グラフ（原点はオブジェクトの左上）。グラフ エリアの塗りつぶし・枠線の上に描く */
function drawChart(ctx, o, theme) {
  const fill = resolveColor(o.fill, theme);
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, o.w, o.h); ctx.shadowColor = 'transparent'; }
  const stroke = resolveColor(o.stroke, theme);
  if (stroke && o.strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = o.strokeWidth;
    ctx.setLineDash((DASH[o.dash] || []).map((d) => d * Math.max(1, o.strokeWidth)));
    ctx.strokeRect(0, 0, o.w, o.h);
    ctx.setLineDash([]);
  }
  ctx.shadowColor = 'transparent';
  const measure = (f, text) => measureText(effectiveFont(f, theme), text);
  const { items } = chartLayout(o.chart, o.w, o.h, measure);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, o.w, o.h);
  ctx.clip();
  for (const it of items) {
    switch (it.t) {
      case 'rect':
        ctx.fillStyle = resolveColor(it.fill, theme);
        ctx.fillRect(it.x, it.y, it.w, it.h);
        break;
      case 'poly':
        ctx.fillStyle = resolveColor(it.fill, theme);
        ctx.beginPath();
        it.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        break;
      case 'line':
        ctx.strokeStyle = resolveColor(it.color, theme);
        ctx.lineWidth = it.width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        it.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        break;
      case 'marker':
        ctx.fillStyle = resolveColor(it.fill, theme);
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.size / 2 + 1, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'wedge':
        ctx.fillStyle = resolveColor(it.fill, theme);
        ctx.beginPath();
        ctx.arc(it.cx, it.cy, it.r, it.a0, it.a1);
        if (it.r0) ctx.arc(it.cx, it.cy, it.r0, it.a1, it.a0, true);
        else ctx.lineTo(it.cx, it.cy);
        ctx.closePath();
        ctx.fill();
        if (it.stroke) { ctx.strokeStyle = resolveColor(it.stroke, theme); ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.stroke(); }
        break;
      case 'text':
        ctx.font = fontCss(effectiveFont({ family: '+minor', size: it.size }, theme));
        ctx.fillStyle = resolveColor(it.color, theme);
        ctx.textAlign = it.align;
        ctx.textBaseline = it.baseline;
        ctx.fillText(it.text, it.x, it.y);
        break;
      default:
    }
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function placeholderView(o) {
  // プレースホルダーのプロンプト文字（灰色）
  const p0 = o.paragraphs[0];
  return {
    ...o,
    paragraphs: [{ ...p0, runs: [{ text: o.placeholder, font: { ...p0.runs[0].font, color: '#8C8C8C' } }] }],
  };
}

function drawTable(ctx, o, theme, hideCell) {
  const lay = tableLayout(o, measureText, theme);
  const accent = resolveColor('@accent1', theme);
  o.cells.forEach((row, r) => row.forEach((cell, c) => {
    const x = lay.xs[c], y = lay.ys[r], w = o.colWidths[c], h = lay.heights[r];
    let fill = cell.fill;
    if (fill == null) {
      if (o.headerRow && r === 0) fill = '@accent1';
      else if (o.bandedRows) fill = (r - (o.headerRow ? 1 : 0)) % 2 === 0 ? '@accent1:0.8' : '@accent1:0.9';
    }
    if (fill) {
      ctx.fillStyle = resolveColor(fill, theme);
      ctx.fillRect(x, y, w, h);
    }
    if (hideCell && hideCell.r === r && hideCell.c === c) return; // 編集中のセルの文字は DOM で表示
    const paragraphs = cell.paragraphs.map((p) => ({ ...p, runs: p.runs.map((ru) => ({ ...ru, font: cellDisplayFont(o, r, ru.font) })) }));
    const cellObj = { type: 'rect', w, h, inset: o.cellInset || { l: 7.2, t: 3.6, r: 7.2, b: 3.6 }, anchor: 'top', wrap: true, paragraphs };
    const { lines } = layoutObjectText(cellObj, measureText, theme);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    drawTextLines(ctx, lines, theme);
    ctx.restore();
  }));
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  for (const x of lay.xs.slice(1, -1)) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, lay.total); ctx.stroke(); }
  for (const y of lay.ys.slice(1, -1)) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(o.w, y); ctx.stroke(); }
  if (!o.headerRow && !o.bandedRows) {
    ctx.strokeStyle = accent;
    ctx.strokeRect(0, 0, o.w, lay.total);
  }
}

/**
 * オブジェクトを描画。opts:
 *   theme, showPlaceholder, hideText（編集中は DOM で表示するため描かない）, pixelScale（影のずれの換算用）
 */
export function drawObject(ctx, o, opts = {}) {
  const theme = opts.theme || DEFAULT_THEME;
  const px = opts.pixelScale || 1;
  ctx.save();
  ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
  ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.globalAlpha *= o.opacity ?? 1;

  ctx.save();
  ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
  ctx.translate(-o.w / 2, -o.h / 2);
  if (o.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 4 * px;
    ctx.shadowOffsetX = 3 * px;
    ctx.shadowOffsetY = 3 * px;
  }
  if (o.type === 'image') {
    const img = getImage(o.src);
    if (img) ctx.drawImage(img, 0, 0, o.w, o.h);
    else { ctx.fillStyle = '#E7E6E6'; ctx.fillRect(0, 0, o.w, o.h); }
    ctx.shadowColor = 'transparent';
    if (o.stroke && o.strokeWidth > 0) {
      ctx.strokeStyle = resolveColor(o.stroke, theme);
      ctx.lineWidth = o.strokeWidth;
      ctx.strokeRect(0, 0, o.w, o.h);
    }
  } else if (o.type === 'table') {
    ctx.shadowColor = 'transparent';
    drawTable(ctx, o, theme, opts.hideCell);
  } else if (o.type === 'chart') {
    drawChart(ctx, o, theme);
  } else {
    ctx.beginPath();
    buildShape(ctx, o.type, o.w, o.h);
    const fill = resolveColor(o.fill, theme);
    if (fill && !isLine(o)) {
      ctx.fillStyle = fill;
      ctx.fill(EVENODD.has(o.type) ? 'evenodd' : 'nonzero');
      ctx.shadowColor = 'transparent';
    }
    const stroke = resolveColor(o.stroke, theme);
    if (stroke && o.strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = o.strokeWidth;
      ctx.setLineDash((DASH[o.dash] || []).map((d) => d * Math.max(1, o.strokeWidth)));
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      if (buildDetail(ctx, o.type, o.w, o.h)) ctx.stroke();
      ctx.setLineDash([]);
      const head = 3 + o.strokeWidth * 3;
      if (o.type === 'arrow' || o.type === 'doubleArrow') drawArrowHead(ctx, 0, 0, o.w, o.h, head, stroke);
      if (o.type === 'doubleArrow') drawArrowHead(ctx, o.w, o.h, 0, 0, head, stroke);
    }
  }
  ctx.restore();

  if (hasText(o) && !opts.hideText) {
    let view = o;
    if (opts.showPlaceholder && o.placeholder && o.paragraphs.every((p) => p.runs.every((r) => !r.text))) view = placeholderView(o);
    if (view.paragraphs.some((p) => p.runs.some((r) => r.text))) {
      // 上下反転した図形の文字は 180° 回転（左右反転では文字は反転しない）
      if (o.flipV) ctx.rotate(Math.PI);
      ctx.translate(-o.w / 2, -o.h / 2);
      if (o.vertical) drawVertical(ctx, view, theme);
      else {
        const { lines } = layoutObjectText(view, measureText, theme);
        drawTextLines(ctx, lines, theme);
      }
    }
  }
  ctx.restore();
}

/** ヘッダーとフッター（スライド番号・フッター・日付） */
function drawHeaderFooter(ctx, pres, slide, index, theme) {
  const hf = pres.headerFooter;
  if (!hf || (hf.hideOnTitle && slide.layout === 'title')) return;
  const W = pres.width, H = pres.height;
  const font = effectiveFont({ family: '+minor', size: 12, bold: false, italic: false, color: '@tx1:0.5', baseline: 0 }, theme);
  ctx.font = fontCss(font);
  ctx.fillStyle = resolveColor(font.color, theme);
  const y = H - 22;
  if (hf.slideNumber) { ctx.textAlign = 'right'; ctx.fillText(String(index + 1), W - 40, y); }
  if (hf.showFooter && hf.footer) { ctx.textAlign = 'center'; ctx.fillText(hf.footer, W / 2, y); }
  if (hf.date) {
    ctx.textAlign = 'left';
    const d = new Date();
    ctx.fillText(`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`, 40, y);
  }
  ctx.textAlign = 'left';
}

/**
 * slide を ctx 全体に拡大縮小して描画。opts:
 *   pres（テーマ・サイズ・ヘッダーとフッター）, index（スライド番号）, showPlaceholder, hideTextOf,
 *   objectStyle(o) → { hidden, alpha, dx, dy, scale, clip }（アニメーション用）
 */
export function drawSlide(ctx, slide, width, height, opts = {}) {
  const pres = opts.pres || { width: SLIDE_W, height: SLIDE_H, theme: 'office' };
  const theme = themeOf(pres);
  const W = pres.width, H = pres.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.scale(width / W, height / H);
  ctx.fillStyle = resolveColor(slide.background || '@bg1', theme);
  ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  const pixelScale = width / W;
  for (const o of slide.objects) {
    if (o.hidden && !opts.showHidden) continue;
    const st = opts.objectStyle ? opts.objectStyle(o) : null;
    if (st?.hidden) continue;
    ctx.save();
    if (st) {
      if (st.alpha !== undefined) ctx.globalAlpha = st.alpha;
      if (st.dx || st.dy) ctx.translate(st.dx || 0, st.dy || 0);
      if (st.scale !== undefined && st.scale !== 1) {
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        ctx.translate(cx, cy); ctx.scale(st.scale, st.scale); ctx.translate(-cx, -cy);
      }
      if (st.clip) { ctx.beginPath(); ctx.rect(st.clip.x, st.clip.y, st.clip.w, st.clip.h); ctx.clip(); }
    }
    drawObject(ctx, o, {
      theme, showPlaceholder: opts.showPlaceholder, hideText: o.id === opts.hideTextOf, pixelScale,
      hideCell: o.id === opts.hideTextOf ? opts.hideCell : null,
    });
    ctx.restore();
    if (opts.showPlaceholder && o.type === 'text' && !o.stroke && o.paragraphs.every((p) => p.runs.every((r) => !r.text))) {
      // 空のテキスト ボックスは枠を点線で表示（PowerPoint の編集画面と同様）
      ctx.save();
      ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
      ctx.rotate((o.rotation * Math.PI) / 180);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#BFBFBF';
      ctx.lineWidth = 1 / pixelScale;
      ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
      ctx.restore();
    }
  }
  if (opts.pres) drawHeaderFooter(ctx, pres, slide, opts.index ?? 0, theme);
  ctx.restore();
}

/** 選択枠とハンドル（編集画面のオーバーレイ）。opts: editingId, grid, guides, size */
export function drawSelection(ctx, slide, selection, width, height, opts = {}) {
  const size = opts.size || { width: SLIDE_W, height: SLIDE_H };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const sx = width / size.width, sy = height / size.height;
  if (opts.grid) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const step = opts.grid;
    for (let x = step; x < size.width; x += step) for (let y = step; y < size.height; y += step) ctx.fillRect(x * sx, y * sy, 1, 1);
  }
  if (opts.guides) {
    ctx.strokeStyle = 'rgba(128,128,128,0.8)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo((size.width / 2) * sx, 0); ctx.lineTo((size.width / 2) * sx, height);
    ctx.moveTo(0, (size.height / 2) * sy); ctx.lineTo(width, (size.height / 2) * sy);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const sel = slide.objects.filter((o) => selection.includes(o.id));
  const groups = new Map();
  if (opts.cellRect) {
    const c = opts.cellRect;
    ctx.strokeStyle = '#2B579A';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x * sx, c.y * sy, c.w * sx, c.h * sy);
  }
  for (const o of sel) {
    ctx.save();
    ctx.translate((o.x + o.w / 2) * sx, (o.y + o.h / 2) * sy);
    ctx.rotate((o.rotation * Math.PI) / 180);
    const w = o.w * sx, h = o.h * sy;
    ctx.strokeStyle = o.id === opts.editingId ? '#2B579A' : '#5B9BD5';
    ctx.lineWidth = 1;
    ctx.setLineDash(o.id === opts.editingId ? [5, 3] : []);
    if (isLine(o)) {
      const fy = o.flipV ? -1 : 1, fx = o.flipH ? -1 : 1;
      if (!o.groupId) drawHandlePoints(ctx, [[(-w / 2) * fx, (-h / 2) * fy], [(w / 2) * fx, (h / 2) * fy]]);
    } else {
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      if (!o.groupId) drawHandles(ctx, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
    if (o.groupId) {
      if (!groups.has(o.groupId)) groups.set(o.groupId, []);
      groups.get(o.groupId).push(o);
    }
  }
  for (const objs of groups.values()) {
    const b = bounds(objs);
    ctx.strokeStyle = '#7F7F7F';
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(b.x * sx - 4, b.y * sy - 4, b.w * sx + 8, b.h * sy + 8);
    ctx.setLineDash([]);
    drawHandles(ctx, b.x * sx - 4, b.y * sy - 4, b.w * sx + 8, b.h * sy + 8);
  }
  ctx.restore();
}

function drawHandlePoints(ctx, pts) {
  ctx.setLineDash([]);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#5B9BD5';
  for (const [px, py] of pts) {
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawHandles(ctx, x, y, w, h) {
  drawHandlePoints(ctx, [
    [x, y], [x + w / 2, y], [x + w, y],
    [x, y + h / 2], [x + w, y + h / 2],
    [x, y + h], [x + w / 2, y + h], [x + w, y + h],
  ]);
  // 回転ハンドル
  ctx.beginPath();
  ctx.arc(x + w / 2, y - 18, 5, 0, Math.PI * 2);
  ctx.stroke();
}

/** スライドを画像（dataURL）に変換 */
export function slideToDataUrl(pres, slide, width, height, index = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawSlide(canvas.getContext('2d'), slide, width, height, { pres, index });
  return canvas.toDataURL('image/png');
}
