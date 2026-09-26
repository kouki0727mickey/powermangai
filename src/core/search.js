// 検索と置換（スライドの文字・表のセル）
import { allParas, hasText } from './model.js';
import { paraText, deleteRange, insertText, rangeFonts } from './richtext.js';

/** 文字を持つ場所の一覧: { slide, obj, cell（表のセル { r, c } または null）, paragraphs } */
export function textLocations(pres) {
  const out = [];
  pres.slides.forEach((s, si) => {
    for (const o of s.objects) {
      if (o.type === 'table') {
        o.cells.forEach((row, r) => row.forEach((cell, c) => out.push({ slide: si, obj: o, cell: { r, c }, paragraphs: cell.paragraphs })));
      } else if (hasText(o)) {
        out.push({ slide: si, obj: o, cell: null, paragraphs: o.paragraphs });
      }
    }
  });
  return out;
}

/** すべての一致: { slide, objId, cell, from: { p, o }, to: { p, o } }（スライド順・オブジェクト順） */
export function findAll(pres, query, { matchCase = false } = {}) {
  if (!query) return [];
  const q = matchCase ? query : query.toLowerCase();
  const out = [];
  for (const loc of textLocations(pres)) {
    loc.paragraphs.forEach((p, pi) => {
      const t = matchCase ? paraText(p) : paraText(p).toLowerCase();
      let i = t.indexOf(q);
      while (i !== -1) {
        out.push({ slide: loc.slide, objId: loc.obj.id, cell: loc.cell, from: { p: pi, o: i }, to: { p: pi, o: i + query.length } });
        i = t.indexOf(q, i + Math.max(1, query.length));
      }
    });
  }
  return out;
}

/** 一致した範囲を置換（書式は一致した先頭の文字のもの） */
export function replaceMatch(paragraphs, match, replacement) {
  const font = { ...rangeFonts(paragraphs, match.from, match.to)[0] };
  const pos = deleteRange(paragraphs, match.from, match.to);
  if (replacement) insertText(paragraphs, pos, replacement, font);
}

/** すべて置換。置換した数を返す（pres を直接変更する） */
export function replaceAll(pres, query, replacement, opts = {}) {
  const matches = findAll(pres, query, opts);
  // 後ろから置換すると、同じ段落内の前の一致の位置がずれない
  for (const m of [...matches].reverse()) {
    const obj = pres.slides[m.slide].objects.find((o) => o.id === m.objId);
    const paras = m.cell ? obj.cells[m.cell.r][m.cell.c].paragraphs : obj.paragraphs;
    replaceMatch(paras, m, replacement);
  }
  return matches.length;
}

export { allParas };
