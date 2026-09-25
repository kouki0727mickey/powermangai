import { resolveFontFamily, DEFAULT_THEME } from './colors.js';
import { textRect } from './shapes.js';

// テキストの折り返し（日本語は文字単位、英語は単語単位）

const WORD_CHAR = /[A-Za-z0-9À-ɏ'’\-_.,:;!?()"@#$%&*+/=<>[\]{}|~^`]/;

/** 段落を折り返しの単位（英単語＋後続空白 / 1 文字）に分割 */
export function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (WORD_CHAR.test(ch)) {
      let j = i;
      while (j < text.length && WORD_CHAR.test(text[j])) j++;
      while (j < text.length && text[j] === ' ') j++;
      tokens.push(text.slice(i, j));
      i = j;
    } else {
      // サロゲートペア（絵文字など）を壊さない
      const cp = text.codePointAt(i);
      const len = cp > 0xffff ? 2 : 1;
      tokens.push(text.slice(i, i + len));
      i += len;
    }
  }
  return tokens;
}

/**
 * text を maxWidth に収まる行の配列にする。
 * measure(str) は文字列の幅を返す関数（canvas の measureText を想定）。
 */
export function wrapText(text, maxWidth, measure) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    const fits = (str) => measure(str.trimEnd()) <= maxWidth;
    for (const token of tokenize(para)) {
      if (line === '' || fits(line + token)) {
        if (line !== '' || fits(token) || token.length === 1) {
          line += token;
          continue;
        }
      } else {
        lines.push(line.trimEnd());
        line = '';
        if (fits(token) || token.length === 1) { line = token.trimStart(); continue; }
      }
      // 1 単語が行幅を超える場合は文字単位で分割（line は空の状態でここに来る）
      for (const ch of Array.from(token)) {
        if (line !== '' && !fits(line + ch)) {
          lines.push(line.trimEnd());
          line = ch.trimStart();
        } else {
          line += ch;
        }
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// ---------------------------------------------------------------- リッチテキストのレイアウト

export const LEVEL_INDENT = 36; // 0.5 インチ
export const BULLET_HANG = 20; // 行頭文字と本文の間隔
export const LINE_FACTOR = 1.2;
const BULLET_CHARS = ['•', '–', '•', '–', '»'];

export function bulletChar(level) { return BULLET_CHARS[level % BULLET_CHARS.length]; }

/** 上付き / 下付きを反映した描画用フォント */
export function effectiveFont(font, theme = DEFAULT_THEME) {
  const small = font.baseline === 'super' || font.baseline === 'sub';
  return {
    ...font,
    family: resolveFontFamily(font.family, theme),
    size: small ? font.size * 0.66 : font.size,
    dy: font.baseline === 'super' ? -font.size * 0.33 : font.baseline === 'sub' ? font.size * 0.12 : 0,
  };
}

/** 段落番号（1. 2. 3.）を段落ごとに計算。同じレベルで番号付きが続く間は連番 */
export function numberingLabels(paras) {
  const counters = [];
  return paras.map((p) => {
    counters.length = p.level + 1;
    if (p.bullet === 'number') {
      counters[p.level] = (counters[p.level] || 0) + 1;
      return `${counters[p.level]}.`;
    }
    counters[p.level] = 0;
    return p.bullet === 'bullet' ? bulletChar(p.level) : null;
  });
}

/**
 * 段落のレイアウト。measure(font, text) は幅を返す（font は effectiveFont 済み）。
 * 戻り値: { lines: [{ top, height, baseline, width, paraIndex, segs: [{ text, font, x, w }], bullet }], height }
 */
export function layoutParagraphs(paras, width, measure, { theme = DEFAULT_THEME, wrap = true } = {}) {
  const lines = [];
  const labels = numberingLabels(paras);
  let y = 0;
  paras.forEach((p, pi) => {
    if (pi > 0) y += p.spaceBefore || 0;
    const bulletX = p.level * LEVEL_INDENT;
    const indent = bulletX + (labels[pi] ? BULLET_HANG : 0);
    const avail = wrap ? Math.max(1, width - indent) : Infinity;
    const paraLines = [];
    let cur = { segs: [], width: 0, soft: false };
    const pushLine = (soft) => {
      // 行末の空白は幅に含めない
      const last = cur.segs[cur.segs.length - 1];
      if (last) {
        const trimmed = last.text.replace(/\s+$/, '');
        if (trimmed !== last.text) {
          const w = measure(last.font, trimmed);
          cur.width -= last.w - w;
          last.trailing = last.w - w;
        }
      }
      cur.soft = soft;
      paraLines.push(cur);
      cur = { segs: [], width: 0, soft: false };
    };
    const place = (text, font) => {
      const w = measure(font, text);
      const wTrim = measure(font, text.replace(/\s+$/, ''));
      if (cur.segs.length === 0 || cur.width + wTrim <= avail) {
        if (cur.segs.length === 0 && wTrim > avail && Array.from(text).length > 1) {
          // 1 単語が行幅を超える: 文字単位で分割
          for (const ch of Array.from(text)) {
            const cw = measure(font, ch);
            if (cur.segs.length && cur.width + cw > avail && ch.trim()) pushLine(false);
            cur.segs.push({ text: ch, font, w: cw });
            cur.width += cw;
          }
          return;
        }
        cur.segs.push({ text, font, w });
        cur.width += w;
        return;
      }
      pushLine(false);
      const rest = text.replace(/^\s+/, '');
      if (rest) place(rest, font);
    };
    let maxSizeEmpty = p.runs[0].font.size;
    for (const r of p.runs) {
      const ef = effectiveFont(r.font, theme);
      const parts = r.text.split('\n');
      parts.forEach((part, k) => {
        if (k > 0) { if (cur.segs.length === 0) cur.emptySize = r.font.size; pushLine(true); }
        for (const tok of tokenize(part)) place(tok, { ...ef, base: r.font.size });
      });
      maxSizeEmpty = r.font.size;
    }
    if (cur.segs.length === 0) cur.emptySize = maxSizeEmpty;
    pushLine(false);

    paraLines.forEach((ln, li) => {
      const maxSize = ln.segs.length ? Math.max(...ln.segs.map((s) => s.font.base)) : (ln.emptySize || p.runs[0].font.size);
      const height = maxSize * LINE_FACTOR * p.lineSpacing;
      const baseline = y + height - maxSize * LINE_FACTOR + maxSize * 0.95;
      const isLast = li === paraLines.length - 1 || ln.soft;
      const extra = wrap ? avail - ln.width : 0;
      let x = indent;
      let gap = 0;
      if (p.align === 'center') x += extra / 2;
      else if (p.align === 'right') x += extra;
      else if (p.align === 'justify' && !isLast) {
        const spaces = ln.segs.slice(0, -1).filter((s) => /\s$/.test(s.text)).length;
        if (spaces) gap = extra / spaces;
      }
      const segs = [];
      ln.segs.forEach((s, si) => {
        segs.push({ text: s.text, font: s.font, x, w: s.w - (s.trailing || 0) });
        x += s.w + (gap && si < ln.segs.length - 1 && /\s$/.test(s.text) ? gap : 0);
      });
      const bulletFont = effectiveFont({ ...p.runs[0].font, baseline: 0 }, theme);
      lines.push({
        top: y, height, baseline, width: ln.width, paraIndex: pi, segs,
        bullet: li === 0 && labels[pi] ? { text: labels[pi], x: bulletX, font: bulletFont } : null,
      });
      y += height;
    });
    y += p.spaceAfter || 0;
  });
  return { lines, height: y };
}

/**
 * オブジェクト内のテキストのレイアウト（余白と上下の配置を反映したオブジェクト座標）。
 * 戻り値: { lines, contentHeight（余白込みの必要な高さ）, offsetY }
 */
export function layoutObjectText(o, measure, theme = DEFAULT_THEME) {
  const ins = o.inset;
  const tr = textRect(o.type, o.w, o.h);
  const width = Math.max(1, tr.w - ins.l - ins.r);
  const lay = layoutParagraphs(o.paragraphs, width, measure, { theme, wrap: o.wrap !== false });
  const inner = tr.h - ins.t - ins.b;
  let offsetY = tr.y + ins.t;
  if (o.anchor === 'middle') offsetY += (inner - lay.height) / 2;
  else if (o.anchor === 'bottom') offsetY += inner - lay.height;
  for (const ln of lay.lines) {
    ln.top += offsetY;
    ln.baseline += offsetY;
    for (const s of ln.segs) s.x += tr.x + ins.l;
    if (ln.bullet) ln.bullet.x += tr.x + ins.l;
  }
  return { lines: lay.lines, contentHeight: lay.height + ins.t + ins.b + (o.h - tr.h), offsetY, width };
}

/** Node（テスト）用の概算の文字幅: 全角 = 1em、半角 = 0.55em */
export function approxMeasure(font, text) {
  let w = 0;
  for (const ch of text) w += /[\u0000-ÿ]/.test(ch) ? 0.55 : 1;
  return w * font.size;
}
