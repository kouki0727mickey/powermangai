// アウトライン表示: スライドのタイトルと本文（プレースホルダー）を行の並びとして扱う。
// 行: { slideId, kind: 'title' | 'body', para, level, text }。文字の書式は、変えていない部分を保つ。
import { createSlide, hasText } from './model.js';
import {
  paraText, paraLength, insertText, deleteRange, splitParagraph, mergeWithPrevious, insertSoftBreak, MAX_LEVEL,
} from './richtext.js';

/** 行の中の改行（段落内の改行）の表示 */
export const SOFT_BREAK = '↵';

const TITLE_PH = new Set(['title', 'ctrTitle']);
const BODY_PH = new Set(['body', 'subTitle']);

export const titleOf = (slide) => slide.objects.find((o) => TITLE_PH.has(o.ph) && hasText(o)) || null;
export const bodyOf = (slide) => slide.objects.find((o) => BODY_PH.has(o.ph) && hasText(o)) || null;

const shown = (t) => t.replace(/\n/g, SOFT_BREAK);

/** アウトラインの行の一覧。keep: 空の本文でも表示する行（カーソルがある行） */
export function outlineLines(pres, keep = null) {
  const lines = [];
  pres.slides.forEach((slide, slideIndex) => {
    const t = titleOf(slide);
    lines.push({ slideId: slide.id, slideIndex, kind: 'title', para: 0, level: 0, text: t ? t.paragraphs.map((p) => shown(paraText(p))).join(SOFT_BREAK) : '' });
    const b = bodyOf(slide);
    if (!b) return;
    // 本文が空（段落が 1 つで文字が無い）なら行を出さない
    const keepIt = keep && keep.slideId === slide.id && keep.kind === 'body';
    if (b.paragraphs.length === 1 && paraLength(b.paragraphs[0]) === 0 && !keepIt) return;
    b.paragraphs.forEach((p, para) => lines.push({ slideId: slide.id, slideIndex, kind: 'body', para, level: p.level, text: shown(paraText(p)) }));
  });
  return lines;
}

/** 行の参照 → 行の番号（見つからなければ -1） */
export function lineIndex(lines, ref) {
  return lines.findIndex((l) => l.slideId === ref.slideId && l.kind === ref.kind && l.para === ref.para);
}

const slideOf = (pres, ref) => pres.slides.find((s) => s.id === ref.slideId);

/** タイトルのプレースホルダー（無ければレイアウトの形で作る） */
function ensureTitle(pres, slide) {
  let t = titleOf(slide);
  if (!t) {
    t = createSlide('titleOnly', { width: pres.width, height: pres.height }).objects[0];
    slide.objects.unshift(t);
  }
  return t;
}

/** 本文のプレースホルダー（無ければ作る） */
function ensureBody(pres, slide) {
  let b = bodyOf(slide);
  if (!b) {
    b = createSlide('titleContent', { width: pres.width, height: pres.height }).objects[1];
    slide.objects.push(b);
  }
  return b;
}

/** 段落の文字を text に変える（前後の同じ部分の書式は保つ）。変わったら true */
function setParaText(paras, pi, text) {
  const cur = paraText(paras[pi]);
  const next = text.replace(new RegExp(SOFT_BREAK, 'g'), '\n');
  if (cur === next) return false;
  let a = 0;
  while (a < cur.length && a < next.length && cur[a] === next[a]) a++;
  let b = 0;
  while (b < cur.length - a && b < next.length - a && cur[cur.length - 1 - b] === next[next.length - 1 - b]) b++;
  const end = deleteRange(paras, { p: pi, o: a }, { p: pi, o: cur.length - b });
  const mid = next.slice(a, next.length - b);
  // 改行は段落内の改行として入れる
  let pos = end;
  mid.split('\n').forEach((part, i) => {
    if (i > 0) pos = insertSoftBreak(paras, pos);
    if (part) pos = insertText(paras, pos, part);
  });
  return true;
}

/** 行の文字を変える */
export function setLineText(pres, ref, text) {
  const slide = slideOf(pres, ref);
  if (!slide) return false;
  if (ref.kind === 'title') {
    const t = titleOf(slide);
    if (!t && !text) return false;
    const obj = ensureTitle(pres, slide);
    // 複数の段落のタイトルは 1 つの段落（段落内の改行）にまとめてから変える
    if (obj.paragraphs.length > 1 && plainTitle(obj) !== text) {
      while (obj.paragraphs.length > 1) {
        const pos = mergeWithPrevious(obj.paragraphs, 1);
        insertSoftBreak(obj.paragraphs, pos);
      }
    }
    return setParaText(obj.paragraphs, 0, text) || !t;
  }
  const b = bodyOf(slide);
  if (!b || !b.paragraphs[ref.para]) return false;
  return setParaText(b.paragraphs, ref.para, text);
}

const plainTitle = (t) => t.paragraphs.map((p) => shown(paraText(p))).join(SOFT_BREAK);

/** 新しいスライド（アウトラインから作るスライドは「タイトルとコンテンツ」） */
function newSlideAfter(pres, index) {
  const s = createSlide('titleContent', { width: pres.width, height: pres.height });
  pres.slides.splice(index + 1, 0, s);
  return s;
}

/** Enter: 行を caret の位置で分ける。タイトルなら新しいスライド。戻り値: 新しい行の参照 */
export function splitLine(pres, ref, caret) {
  const slide = slideOf(pres, ref);
  if (!slide) return null;
  const si = pres.slides.indexOf(slide);
  if (ref.kind === 'title') {
    const t = titleOf(slide);
    const ns = newSlideAfter(pres, si);
    if (t) {
      const full = paraLength(t.paragraphs[0]);
      if (t.paragraphs.length === 1 && caret < full) {
        // カーソルより後ろの文字を新しいスライドのタイトルへ（書式ごと）
        const tail = JSON.parse(JSON.stringify(t.paragraphs[0]));
        deleteRange([tail], { p: 0, o: 0 }, { p: 0, o: caret });
        deleteRange(t.paragraphs, { p: 0, o: caret }, { p: 0, o: full });
        titleOf(ns).paragraphs = [{ ...tail, level: 0 }];
      }
    }
    return { slideId: ns.id, kind: 'title', para: 0 };
  }
  const b = bodyOf(slide);
  if (!b) return null;
  const pos = splitParagraph(b.paragraphs, { p: ref.para, o: caret });
  return { slideId: slide.id, kind: 'body', para: pos.p };
}

/** 本文の段落を取り出す（本文が空になれば段落を 1 つ残す） */
function takeParas(body, from, to = body.paragraphs.length) {
  const out = body.paragraphs.splice(from, to - from);
  if (!body.paragraphs.length) body.paragraphs.push({ ...out[0], level: 0, runs: [{ text: '', font: { ...out[0].runs[0].font } }] });
  return out;
}

/** 本文の末尾に段落を足す（本文が空の 1 段落だけなら置き換える） */
function appendParas(body, paras) {
  if (body.paragraphs.length === 1 && paraLength(body.paragraphs[0]) === 0) body.paragraphs = [];
  const first = body.paragraphs.length;
  body.paragraphs.push(...paras);
  return first;
}

/** タイトルと本文のプレースホルダー以外に内容があるスライドか（結合すると失われる） */
function hasOtherContent(slide) {
  const t = titleOf(slide), b = bodyOf(slide);
  return slide.objects.some((o) => o !== t && o !== b && !(o.ph && hasText(o) && o.paragraphs.every((p) => paraLength(p) === 0)))
    || !!slide.notes?.trim() || !!slide.comments?.length;
}

/**
 * Tab: レベルを下げる。タイトルなら前のスライドの本文に入る（スライドは無くなる）。
 * 戻り値: 移動後の行の参照か、{ error } か null（何もしない）
 */
export function demoteLine(pres, ref) {
  const slide = slideOf(pres, ref);
  if (!slide) return null;
  const si = pres.slides.indexOf(slide);
  if (ref.kind === 'body') {
    const p = bodyOf(slide)?.paragraphs[ref.para];
    if (!p || p.level >= MAX_LEVEL) return null;
    p.level += 1;
    return ref;
  }
  if (si === 0) return { error: '最初のスライドのタイトルはレベルを下げられません' };
  if (hasOtherContent(slide)) return { error: 'タイトルと本文以外の内容（図形・ノート・コメントなど）があるスライドは前のスライドに結合できません' };
  const prev = pres.slides[si - 1];
  const t = titleOf(slide), b = bodyOf(slide);
  const body = ensureBody(pres, prev);
  // タイトルから来た文字は本文の書式（サイズ・色）にする。太字・斜体・下線は保つ
  const base = body.paragraphs[0].runs[0].font;
  const bodyPara = body.paragraphs[0];
  const asBody = (p) => ({
    ...bodyPara, level: 0,
    runs: p.runs.map((r) => ({ text: r.text, font: { ...base, bold: r.font.bold, italic: r.font.italic, underline: r.font.underline } })),
  });
  const moved = t ? t.paragraphs.map(asBody) : [{ ...bodyPara, level: 0, runs: [{ text: '', font: { ...base } }] }];
  if (b && !(b.paragraphs.length === 1 && paraLength(b.paragraphs[0]) === 0)) {
    moved.push(...b.paragraphs.map((p) => ({ ...p, level: Math.min(MAX_LEVEL, p.level + 1) })));
  }
  const at = appendParas(body, moved);
  pres.slides.splice(si, 1);
  return { slideId: prev.id, kind: 'body', para: at };
}

/**
 * Shift+Tab: レベルを上げる。レベル 0 の本文なら新しいスライドのタイトルになり、後ろの段落も新しいスライドへ移る。
 */
export function promoteLine(pres, ref) {
  const slide = slideOf(pres, ref);
  if (!slide || ref.kind === 'title') return null;
  const b = bodyOf(slide);
  const p = b?.paragraphs[ref.para];
  if (!p) return null;
  if (p.level > 0) { p.level -= 1; return ref; }
  const si = pres.slides.indexOf(slide);
  const [head, ...rest] = takeParas(b, ref.para);
  // この段落の下の段落（レベル 1 以上が続く間）はレベルを 1 つ上げる
  let k = 0;
  while (k < rest.length && rest[k].level > 0) { rest[k].level -= 1; k++; }
  const ns = newSlideAfter(pres, si);
  const nt = titleOf(ns);
  const tf = nt.paragraphs[0].runs[0].font;
  nt.paragraphs = [{ ...nt.paragraphs[0], runs: head.runs.map((r) => ({ text: r.text, font: { ...tf, bold: r.font.bold, italic: r.font.italic, underline: r.font.underline } })) }];
  if (rest.length) bodyOf(ns).paragraphs = rest;
  return { slideId: ns.id, kind: 'title', para: 0 };
}

/**
 * Backspace（行の先頭）: 前の行とつなぐ。戻り値: { ref, caret } か { error } か null
 */
export function joinWithPrevious(pres, ref) {
  const slide = slideOf(pres, ref);
  if (!slide) return null;
  const si = pres.slides.indexOf(slide);
  if (ref.kind === 'body') {
    const b = bodyOf(slide);
    if (ref.para > 0) {
      const pos = mergeWithPrevious(b.paragraphs, ref.para);
      return { ref: { slideId: slide.id, kind: 'body', para: pos.p }, caret: pos.o };
    }
    // 本文の最初の段落はタイトルの後ろにつなぐ
    const t = ensureTitle(pres, slide);
    const tp = t.paragraphs[t.paragraphs.length - 1];
    // カーソルはつないだ位置（タイトル全体の表示の長さ。複数の段落は ↵ で 1 行に表示している）
    const caret = plainTitle(t).length;
    const [p] = takeParas(b, 0, 1);
    setParaText([tp], 0, shown(paraText(tp)) + shown(paraText(p)));
    return { ref: { slideId: slide.id, kind: 'title', para: 0 }, caret };
  }
  if (si === 0) return null;
  const t = titleOf(slide), b = bodyOf(slide);
  const empty = (!t || t.paragraphs.every((p) => paraLength(p) === 0)) && (!b || b.paragraphs.every((p) => paraLength(p) === 0));
  if (!empty) {
    // タイトルに文字があれば、前のスライドの本文の最後の段落として結合する（Tab と同じ）
    const r = demoteLine(pres, ref);
    if (!r || r.error) return r;
    return { ref: r, caret: 0 };
  }
  if (hasOtherContent(slide)) return { error: '図形などがあるスライドは削除できません' };
  pres.slides.splice(si, 1);
  const lines = outlineLines(pres);
  const last = lines.filter((l) => l.slideIndex === si - 1).at(-1);
  return { ref: { slideId: last.slideId, kind: last.kind, para: last.para }, caret: last.text.length };
}

/** Alt+Shift+↑↓: 本文の段落を同じ本文の中で入れ替える。タイトルならスライドを移動 */
export function moveLine(pres, ref, dir) {
  const slide = slideOf(pres, ref);
  if (!slide) return null;
  if (ref.kind === 'title') {
    const si = pres.slides.indexOf(slide);
    const to = si + dir;
    if (to < 0 || to >= pres.slides.length) return null;
    pres.slides.splice(si, 1);
    pres.slides.splice(to, 0, slide);
    return ref;
  }
  const paras = bodyOf(slide).paragraphs;
  const to = ref.para + dir;
  if (to < 0 || to >= paras.length) return null;
  [paras[ref.para], paras[to]] = [paras[to], paras[ref.para]];
  return { ...ref, para: to };
}
