import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultRunFont, fromPlainText, plainText, applyFont, rangeFonts, insertText, splitParagraph, deleteRange,
  mergeWithPrevious, wordRangeAt, insertSoftBreak, fontAt, paraText, normalizeParagraph, applyFontAll,
} from '../src/core/richtext.js';

const F = defaultRunFont();
const P = (t) => fromPlainText(t, F);
const runs = (paras, i = 0) => paras[i].runs.map((r) => [r.text, r.font.bold]);

test('プレーンテキストとの相互変換', () => {
  const ps = P('a\nbc\n');
  assert.equal(ps.length, 3);
  assert.equal(plainText(ps), 'a\nbc\n');
});

test('範囲に太字を適用するとランが分割・結合される', () => {
  const ps = P('abcdef');
  applyFont(ps, { p: 0, o: 1 }, { p: 0, o: 3 }, (f) => { f.bold = true; });
  assert.deepEqual(runs(ps), [['a', false], ['bc', true], ['def', false]]);
  applyFont(ps, { p: 0, o: 3 }, { p: 0, o: 1 }, (f) => { f.bold = false; }); // 逆順の範囲
  assert.deepEqual(runs(ps), [['abcdef', false]]);
});

test('複数段落にまたがる書式', () => {
  const ps = P('abc\ndef');
  applyFont(ps, { p: 0, o: 2 }, { p: 1, o: 1 }, (f) => { f.italic = true; });
  assert.deepEqual(ps[0].runs.map((r) => [r.text, r.font.italic]), [['ab', false], ['c', true]]);
  assert.deepEqual(ps[1].runs.map((r) => [r.text, r.font.italic]), [['d', true], ['ef', false]]);
  const fonts = rangeFonts(ps, { p: 0, o: 2 }, { p: 1, o: 1 });
  assert.ok(fonts.every((f) => f.italic));
});

test('空段落の書式は段落のフォントとして保持', () => {
  const ps = P('a\n\nb');
  applyFont(ps, { p: 0, o: 0 }, { p: 2, o: 1 }, (f) => { f.size = 30; });
  assert.equal(ps[1].runs[0].font.size, 30);
  assert.equal(ps[1].runs.length, 1);
});

test('文字の挿入は直前の文字の書式を引き継ぐ', () => {
  const ps = P('ab');
  applyFont(ps, { p: 0, o: 0 }, { p: 0, o: 1 }, (f) => { f.bold = true; });
  let pos = insertText(ps, { p: 0, o: 1 }, 'X');
  assert.deepEqual(runs(ps), [['aX', true], ['b', false]]);
  assert.deepEqual(pos, { p: 0, o: 2 });
  pos = insertText(ps, { p: 0, o: 0 }, 'Y');
  assert.equal(paraText(ps[0]), 'YaXb');
  assert.equal(ps[0].runs[0].font.bold, true, '先頭への挿入は先頭の文字の書式');
});

test('改行を含む挿入は段落を分ける', () => {
  const ps = P('ab');
  const pos = insertText(ps, { p: 0, o: 1 }, 'X\nY\nZ');
  assert.equal(plainText(ps), 'aX\nY\nZb');
  assert.deepEqual(pos, { p: 2, o: 1 });
});

test('Enter で段落分割、段落の書式を引き継ぐ', () => {
  const ps = P('abcd');
  ps[0].align = 'center';
  ps[0].bullet = 'bullet';
  const pos = splitParagraph(ps, { p: 0, o: 2 });
  assert.deepEqual(pos, { p: 1, o: 0 });
  assert.deepEqual(ps.map(paraText), ['ab', 'cd']);
  assert.equal(ps[1].align, 'center');
  assert.equal(ps[1].bullet, 'bullet');
  splitParagraph(ps, { p: 1, o: 2 });
  assert.deepEqual(ps.map(paraText), ['ab', 'cd', '']);
  assert.equal(ps[2].runs.length, 1);
  splitParagraph(ps, { p: 0, o: 0 });
  assert.deepEqual(ps.map(paraText), ['', 'ab', 'cd', '']);
});

test('範囲削除（段落をまたぐ）と Backspace による結合', () => {
  const ps = P('abc\ndef\nghi');
  const pos = deleteRange(ps, { p: 0, o: 1 }, { p: 2, o: 1 });
  assert.deepEqual(pos, { p: 0, o: 1 });
  assert.deepEqual(ps.map(paraText), ['ahi']);
  const ps2 = P('ab\ncd');
  assert.deepEqual(mergeWithPrevious(ps2, 1), { p: 0, o: 2 });
  assert.deepEqual(ps2.map(paraText), ['abcd']);
  const ps3 = P('abc');
  deleteRange(ps3, { p: 0, o: 0 }, { p: 0, o: 3 });
  assert.equal(ps3[0].runs.length, 1);
  assert.equal(ps3[0].runs[0].text, '');
});

test('単語の範囲（単語の中だけ）', () => {
  const ps = P('hello world 日本語');
  assert.deepEqual(wordRangeAt(ps, { p: 0, o: 2 }), { from: { p: 0, o: 0 }, to: { p: 0, o: 5 } });
  assert.equal(wordRangeAt(ps, { p: 0, o: 5 }), null);
  assert.equal(wordRangeAt(ps, { p: 0, o: 0 }), null);
  assert.deepEqual(wordRangeAt(ps, { p: 0, o: 13 }), { from: { p: 0, o: 12 }, to: { p: 0, o: 15 } });
});

test('段落内改行（Shift+Enter）', () => {
  const ps = P('ab');
  const pos = insertSoftBreak(ps, { p: 0, o: 1 });
  assert.equal(paraText(ps[0]), 'a\nb');
  assert.deepEqual(pos, { p: 0, o: 2 });
  assert.equal(ps.length, 1);
});

test('fontAt は直前の文字のフォント', () => {
  const ps = P('ab');
  applyFont(ps, { p: 0, o: 1 }, { p: 0, o: 2 }, (f) => { f.bold = true; });
  assert.equal(fontAt(ps, { p: 0, o: 0 }).bold, false);
  assert.equal(fontAt(ps, { p: 0, o: 1 }).bold, false);
  assert.equal(fontAt(ps, { p: 0, o: 2 }).bold, true);
});

test('normalizeParagraph と applyFontAll', () => {
  const p = { runs: [{ text: '', font: F }, { text: 'a', font: F }, { text: 'b', font: { ...F } }] };
  normalizeParagraph(p);
  assert.equal(p.runs.length, 1);
  const ps = P('x\ny');
  applyFontAll(ps, (f) => { f.color = '#FF0000'; });
  assert.ok(ps.every((q) => q.runs[0].font.color === '#FF0000'));
});

test('蛍光ペン・文字の間隔が違う文字は別の run になり、不正な値は捨てる', async () => {
  const { normalizePresentation, createPresentation } = await import('../src/core/model.js');
  const p = createPresentation();
  const o = p.slides[0].objects[0];
  const f = o.paragraphs[0].runs[0].font;
  o.paragraphs[0].runs = [{ text: 'a', font: { ...f, highlight: '#FFFF00' } }, { text: 'b', font: { ...f } }, { text: 'c', font: { ...f, spacing: 'x', highlight: 'red;x' } }];
  const n = normalizePresentation(JSON.parse(JSON.stringify(p)));
  const runs = n.slides[0].objects[0].paragraphs[0].runs;
  assert.deepEqual(runs.map((r) => [r.text, r.font.highlight, r.font.spacing]), [['a', '#FFFF00', undefined], ['bc', undefined, undefined]]);
});

test('書式の貼り付けは蛍光ペン・文字の間隔を消して写し、リンクは写さない', async () => {
  const { pasteFont } = await import('../src/core/richtext.js');
  const target = { ...F, highlight: '#FFFF00', spacing: 3, link: 'https://a.example/' };
  pasteFont(target, { ...F, bold: true, link: 'https://b.example/' });
  assert.equal(target.highlight, undefined);
  assert.equal(target.spacing, undefined);
  assert.equal(target.bold, true);
  assert.equal(target.link, 'https://a.example/');
});
