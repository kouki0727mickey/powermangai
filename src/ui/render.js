// Canvas へのスライド描画（編集画面・サムネイル・スライドショー・お手本画像で共通）
import { SLIDE_W, SLIDE_H, bounds } from '../core/model.js';
import { wrapText } from '../core/textlayout.js';

export const TEXT_INSET = 8;
const FONT_FALLBACK = '"Yu Gothic UI", "Yu Gothic", Meiryo, "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", sans-serif';

export function fontCss(font) {
  const family = font.family ? `"${font.family.replace(/"/g, '')}", ${FONT_FALLBACK}` : FONT_FALLBACK;
  return `${font.italic ? 'italic ' : ''}${font.bold ? 'bold ' : ''}${font.size}px ${family}`;
}

function shapePath(ctx, o) {
  const { w, h } = o;
  ctx.beginPath();
  switch (o.type) {
    case 'text':
    case 'rect':
      ctx.rect(0, 0, w, h);
      break;
    case 'roundRect': {
      const r = Math.min(w, h) * 0.1667;
      ctx.moveTo(r, 0);
      ctx.arcTo(w, 0, w, h, r);
      ctx.arcTo(w, h, 0, h, r);
      ctx.arcTo(0, h, 0, 0, r);
      ctx.arcTo(0, 0, w, 0, r);
      ctx.closePath();
      break;
    }
    case 'ellipse':
      ctx.ellipse(w / 2, h / 2, Math.max(w / 2, 0), Math.max(h / 2, 0), 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      break;
    case 'rightArrow': {
      const head = Math.min(w, h * 0.5);
      const t = h * 0.25;
      ctx.moveTo(0, t);
      ctx.lineTo(w - head, t);
      ctx.lineTo(w - head, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w - head, h);
      ctx.lineTo(w - head, h - t);
      ctx.lineTo(0, h - t);
      ctx.closePath();
      break;
    }
    case 'star': {
      const cx = w / 2, cy = h / 2;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.382;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = cx + Math.cos(a) * (w / 2) * r;
        const y = cy + Math.sin(a) * (h / 2) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'line':
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      break;
    default:
      ctx.rect(0, 0, w, h);
  }
}

function drawText(ctx, o, showPlaceholder) {
  let text = o.text;
  let color = o.font.color;
  let placeholder = false;
  if (!text && showPlaceholder && o.placeholder) {
    text = o.placeholder;
    color = '#8c8c8c';
    placeholder = true;
  }
  if (!text) return;
  ctx.font = fontCss(o.font);
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const maxW = Math.max(1, o.w - TEXT_INSET * 2);
  const lines = wrapText(text, maxW, (s) => ctx.measureText(s).width);
  const lineH = o.font.size * 1.2;
  const totalH = lines.length * lineH;
  let y = o.type === 'text' ? TEXT_INSET : (o.h - totalH) / 2;
  if (placeholder) ctx.globalAlpha = 0.9;
  lines.forEach((line, i) => {
    const justify = o.align === 'justify' && i < lines.length - 1 && line.includes(' ');
    const width = ctx.measureText(line).width;
    let x = TEXT_INSET;
    if (o.align === 'center') x = (o.w - width) / 2;
    else if (o.align === 'right') x = o.w - TEXT_INSET - width;
    const baseline = y + o.font.size * 0.95;
    if (justify) {
      drawJustified(ctx, line, TEXT_INSET, baseline, maxW);
    } else {
      ctx.fillText(line, x, baseline);
    }
    if (o.font.underline && line) {
      const uw = justify ? maxW : width;
      const ux = justify ? TEXT_INSET : x;
      ctx.fillRect(ux, baseline + Math.max(1, o.font.size * 0.08), uw, Math.max(1, o.font.size / 16));
    }
    y += lineH;
  });
  ctx.globalAlpha = 1;
}

function drawJustified(ctx, line, x, y, maxW) {
  const words = line.split(' ');
  const wordsW = words.reduce((s, w) => s + ctx.measureText(w).width, 0);
  const gap = (maxW - wordsW) / (words.length - 1);
  for (const w of words) {
    ctx.fillText(w, x, y);
    x += ctx.measureText(w).width + gap;
  }
}

export function drawObject(ctx, o, { showPlaceholder = false, hideText = false } = {}) {
  ctx.save();
  ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
  ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.translate(-o.w / 2, -o.h / 2);
  shapePath(ctx, o);
  if (o.fill && o.type !== 'line') {
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  if (o.stroke && o.strokeWidth > 0) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.strokeWidth;
    ctx.stroke();
  }
  if (o.type !== 'line' && !hideText) drawText(ctx, o, showPlaceholder);
  ctx.restore();
}

/**
 * slide を ctx に描画。ctx のサイズは任意で、SLIDE_W×SLIDE_H を拡大縮小して収める。
 * opts.hideTextOf: テキスト編集中のオブジェクト ID（テキストは textarea で表示するため描かない）
 */
export function drawSlide(ctx, slide, width, height, opts = {}) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.scale(width / SLIDE_W, height / SLIDE_H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
  ctx.beginPath();
  ctx.rect(0, 0, SLIDE_W, SLIDE_H);
  ctx.clip();
  for (const o of slide.objects) {
    drawObject(ctx, o, { showPlaceholder: opts.showPlaceholder, hideText: o.id === opts.hideTextOf });
    if (opts.showPlaceholder && o.type === 'text' && !o.text && !o.stroke) {
      // 空のテキスト ボックスは枠を点線で表示（PowerPoint の編集画面と同様）
      ctx.save();
      ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
      ctx.rotate((o.rotation * Math.PI) / 180);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#bfbfbf';
      ctx.lineWidth = 1;
      ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** 選択枠とハンドルを描画（編集画面のオーバーレイ用） */
export function drawSelection(ctx, slide, selection, width, height, editingId) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const sx = width / SLIDE_W, sy = height / SLIDE_H;
  const sel = slide.objects.filter((o) => selection.includes(o.id));
  const groups = new Map();
  for (const o of sel) {
    ctx.save();
    ctx.translate((o.x + o.w / 2) * sx, (o.y + o.h / 2) * sy);
    ctx.rotate((o.rotation * Math.PI) / 180);
    const w = o.w * sx, h = o.h * sy;
    ctx.strokeStyle = o.id === editingId ? '#2b579a' : '#5b9bd5';
    ctx.lineWidth = 1;
    ctx.setLineDash(o.id === editingId ? [5, 3] : []);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    if (!o.groupId) drawHandles(ctx, -w / 2, -h / 2, w, h);
    ctx.restore();
    if (o.groupId) {
      if (!groups.has(o.groupId)) groups.set(o.groupId, []);
      groups.get(o.groupId).push(o);
    }
  }
  for (const objs of groups.values()) {
    const b = bounds(objs);
    ctx.strokeStyle = '#7f7f7f';
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(b.x * sx - 4, b.y * sy - 4, b.w * sx + 8, b.h * sy + 8);
    ctx.setLineDash([]);
    drawHandles(ctx, b.x * sx - 4, b.y * sy - 4, b.w * sx + 8, b.h * sy + 8);
  }
  ctx.restore();
}

function drawHandles(ctx, x, y, w, h) {
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#5b9bd5';
  const pts = [
    [x, y], [x + w / 2, y], [x + w, y],
    [x, y + h / 2], [x + w, y + h / 2],
    [x, y + h], [x + w / 2, y + h], [x + w, y + h],
  ];
  for (const [px, py] of pts) {
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** スライドを画像（dataURL）に変換 */
export function slideToDataUrl(slide, width = SLIDE_W, height = SLIDE_H) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawSlide(canvas.getContext('2d'), slide, width, height);
  return canvas.toDataURL('image/png');
}
