// リッチテキスト（段落 → ラン）のモデルと操作。DOM に依存しない。
//
// paragraph = { align, level, bullet, lineSpacing, spaceBefore, spaceAfter, runs: [run] }
// run       = { text, font }   ※ text 内の '\n' は段落内改行（Shift+Enter）
// font      = { family, size, bold, italic, underline, strike, color, baseline }
//              baseline: 0 | 'super' | 'sub'
// 位置 pos  = { p: 段落番号, o: 段落内の文字位置（'\n' も 1 文字） }
//
// 不変条件: 各段落は 1 つ以上のランを持つ。空文字のランは段落に 1 つしかない場合だけ許される。

export const ALIGNS = ['left', 'center', 'right', 'justify'];
export const BULLETS = ['none', 'bullet', 'number'];
export const MAX_LEVEL = 8;

export function defaultRunFont(over = {}) {
  return {
    family: '+minor',
    size: 18,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: '@tx1',
    baseline: 0,
    ...over,
  };
}

export function makeParagraph(text = '', font = defaultRunFont(), props = {}) {
  return {
    align: 'left',
    level: 0,
    bullet: 'none',
    lineSpacing: 1,
    spaceBefore: 0,
    spaceAfter: 0,
    ...props,
    runs: [{ text, font: { ...font } }],
  };
}

/** プレーンテキスト（改行 = 段落の区切り）から段落を作る */
export function fromPlainText(text, font = defaultRunFont(), props = {}) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').map((t) => makeParagraph(t, font, props));
}

export function paraText(p) {
  return p.runs.map((r) => r.text).join('');
}

export function paraLength(p) {
  return p.runs.reduce((n, r) => n + r.text.length, 0);
}

export function plainText(paras) {
  return paras.map(paraText).join('\n');
}

export function sameFont(a, b) {
  return a.family === b.family && a.size === b.size && a.bold === b.bold && a.italic === b.italic
    && a.underline === b.underline && a.strike === b.strike && a.color === b.color && a.baseline === b.baseline
    && (a.link || '') === (b.link || '');
}

/** リンクとして使える URL か（http / https / mailto のみ） */
export function isLinkUrl(u) {
  return typeof u === 'string' && /^(https?:\/\/|mailto:)[^\s<>"]+$/i.test(u) && u.length <= 2000;
}

export function normalizeParagraph(p) {
  const runs = [];
  for (const r of p.runs) {
    if (r.text === '') continue;
    const last = runs[runs.length - 1];
    if (last && sameFont(last.font, r.font)) last.text += r.text;
    else runs.push({ text: r.text, font: { ...r.font } });
  }
  if (runs.length === 0) runs.push({ text: '', font: { ...(p.runs[0]?.font || defaultRunFont()) } });
  p.runs = runs;
  return p;
}

export function comparePos(a, b) {
  return a.p - b.p || a.o - b.o;
}

export function clampPos(paras, pos) {
  const p = Math.max(0, Math.min(paras.length - 1, pos.p));
  return { p, o: Math.max(0, Math.min(paraLength(paras[p]), pos.o)) };
}

/** 段落の offset の位置でランを分割し、offset から始まるランの番号を返す */
function splitAt(p, offset) {
  let pos = 0;
  for (let i = 0; i < p.runs.length; i++) {
    const r = p.runs[i];
    if (offset === pos) return i;
    if (offset < pos + r.text.length) {
      const k = offset - pos;
      p.runs.splice(i, 1, { text: r.text.slice(0, k), font: { ...r.font } }, { text: r.text.slice(k), font: { ...r.font } });
      return i + 1;
    }
    pos += r.text.length;
  }
  return p.runs.length;
}

/** from〜to の範囲の各段落について [段落番号, 開始, 終了] を返す */
function spans(paras, from, to) {
  const out = [];
  for (let i = from.p; i <= to.p; i++) {
    const s = i === from.p ? from.o : 0;
    const e = i === to.p ? to.o : paraLength(paras[i]);
    out.push([i, s, e]);
  }
  return out;
}

/** 範囲の文字にフォント変更 fn(font) を適用 */
export function applyFont(paras, from, to, fn) {
  if (comparePos(from, to) > 0) [from, to] = [to, from];
  for (const [i, s, e] of spans(paras, from, to)) {
    const p = paras[i];
    if (s === e) {
      // 空段落は段落のフォント（入力時の書式）を変更
      if (paraLength(p) === 0) fn(p.runs[0].font);
      continue;
    }
    const a = splitAt(p, s);
    const b = splitAt(p, e);
    for (let k = a; k < b; k++) fn(p.runs[k].font);
    normalizeParagraph(p);
  }
}

/** 範囲内の文字のフォント一覧（空範囲ならカーソル位置のフォント） */
export function rangeFonts(paras, from, to) {
  if (comparePos(from, to) > 0) [from, to] = [to, from];
  if (comparePos(from, to) === 0) return [fontAt(paras, from)];
  const fonts = [];
  for (const [i, s, e] of spans(paras, from, to)) {
    let pos = 0;
    for (const r of paras[i].runs) {
      const rs = pos, re = pos + r.text.length;
      if (re > s && rs < e) fonts.push(r.font);
      pos = re;
    }
    if (s === e && paraLength(paras[i]) === 0) fonts.push(paras[i].runs[0].font);
  }
  return fonts.length ? fonts : [fontAt(paras, from)];
}

/** カーソル位置で入力される文字のフォント（直前の文字のフォント） */
export function fontAt(paras, pos) {
  const p = paras[pos.p];
  let acc = 0;
  for (const r of p.runs) {
    if (pos.o > acc && pos.o <= acc + r.text.length) return r.font;
    acc += r.text.length;
  }
  return p.runs[0].font;
}

/** pos に文字列を挿入（'\n' は段落の区切りとして扱う）。挿入後の位置を返す */
export function insertText(paras, pos, text, font) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let cur = { ...pos };
  lines.forEach((line, idx) => {
    if (idx > 0) cur = splitParagraph(paras, cur);
    if (line === '') return;
    const p = paras[cur.p];
    const f = font || fontAt(paras, cur);
    const k = splitAt(p, cur.o);
    p.runs.splice(k, 0, { text: line, font: { ...f } });
    normalizeParagraph(p);
    cur = { p: cur.p, o: cur.o + line.length };
  });
  return cur;
}

/** 段落内改行（Shift+Enter） */
export function insertSoftBreak(paras, pos) {
  const p = paras[pos.p];
  const f = fontAt(paras, pos);
  const k = splitAt(p, pos.o);
  p.runs.splice(k, 0, { text: '\n', font: { ...f } });
  normalizeParagraph(p);
  return { p: pos.p, o: pos.o + 1 };
}

/** Enter: 段落を分割。新しい段落は元の段落の書式を引き継ぐ */
export function splitParagraph(paras, pos) {
  const p = paras[pos.p];
  const caretFont = { ...fontAt(paras, pos) };
  const k = splitAt(p, pos.o);
  const tail = p.runs.splice(k);
  const { runs, ...props } = p;
  const np = { ...props, runs: tail.length ? tail : [{ text: '', font: caretFont }] };
  if (p.runs.length === 0) p.runs.push({ text: '', font: { ...(tail[0]?.font || caretFont) } });
  normalizeParagraph(p);
  normalizeParagraph(np);
  paras.splice(pos.p + 1, 0, np);
  return { p: pos.p + 1, o: 0 };
}

/** 範囲を削除して、削除後の位置を返す */
export function deleteRange(paras, from, to) {
  if (comparePos(from, to) > 0) [from, to] = [to, from];
  if (comparePos(from, to) === 0) return from;
  const first = paras[from.p];
  const last = paras[to.p];
  const a = splitAt(first, from.o);
  const keepHead = first.runs.slice(0, a);
  const b = splitAt(last, to.o);
  const keepTail = last.runs.slice(b);
  const fallbackFont = { ...(first.runs[a]?.font || first.runs[0].font) };
  first.runs = [...keepHead, ...keepTail];
  if (first.runs.length === 0) first.runs.push({ text: '', font: fallbackFont });
  normalizeParagraph(first);
  paras.splice(from.p + 1, to.p - from.p);
  return { ...from };
}

/** 段落の結合（Backspace を段落の先頭で押したとき） */
export function mergeWithPrevious(paras, pIndex) {
  if (pIndex <= 0) return { p: 0, o: 0 };
  const prevLen = paraLength(paras[pIndex - 1]);
  deleteRange(paras, { p: pIndex - 1, o: prevLen }, { p: pIndex, o: 0 });
  return { p: pIndex - 1, o: prevLen };
}

const WORD = /[\p{L}\p{N}_]/u;
/** カーソル位置の単語の範囲（単語の中・端でなければ null） */
export function wordRangeAt(paras, pos) {
  const t = paraText(paras[pos.p]);
  const at = (i) => i >= 0 && i < t.length && WORD.test(t[i]);
  if (!at(pos.o) && !at(pos.o - 1)) return null;
  if (!at(pos.o - 1) || !at(pos.o)) return null; // 単語の端では書式を「次の入力」に適用
  let s = pos.o, e = pos.o;
  while (at(s - 1)) s--;
  while (at(e)) e++;
  return { from: { p: pos.p, o: s }, to: { p: pos.p, o: e } };
}

/** 段落の範囲（from〜to が含む段落の番号） */
export function paraIndexes(from, to) {
  const a = Math.min(from.p, to.p), b = Math.max(from.p, to.p);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export function cloneParas(paras) {
  return paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ text: r.text, font: { ...r.font } })) }));
}

/** 全ランに fn を適用（図形を選択した状態での書式変更） */
export function applyFontAll(paras, fn) {
  for (const p of paras) {
    for (const r of p.runs) fn(r.font);
    normalizeParagraph(p);
  }
}

export function allRunFonts(paras) {
  return paras.flatMap((p) => p.runs.map((r) => r.font));
}
