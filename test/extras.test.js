import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '../src/core/editor.js';
import { createPresentation, createSlide, normalizePresentation } from '../src/core/model.js';
import { isLinkUrl, fromPlainText, defaultRunFont, applyFont, normalizeParagraph } from '../src/core/richtext.js';

function ed(n = 4) {
  const pres = createPresentation();
  pres.slides = Array.from({ length: n }, () => createSlide('blank'));
  return new Editor(pres);
}

test('Ctrl+D は複製を動かした間隔を覚える', () => {
  const e = ed(1);
  const a = e.insertObject('rect', { x: 0, y: 0 });
  e.duplicate();
  let dup = e.selectedObjects()[0];
  assert.deepEqual([dup.x, dup.y], [16, 16]);
  e.move(100 - 16, -16); // 複製を (100, 0) へ
  e.duplicate();
  dup = e.selectedObjects()[0];
  assert.deepEqual([dup.x, dup.y], [200, 0], '同じ間隔（+100, 0）で複製');
  e.duplicate();
  assert.deepEqual([e.selectedObjects()[0].x, e.selectedObjects()[0].y], [300, 0]);
  e.setSelection([a.id]);
  e.duplicate();
  assert.deepEqual([e.selectedObjects()[0].x, e.selectedObjects()[0].y], [16, 16], '別のものを複製すると既定の間隔');
});

test('スライドの複数選択: Shift+↓ で範囲、まとめて削除・複製・移動・非表示・コピー', () => {
  const e = ed(5);
  const ids = e.pres.slides.map((s) => s.id);
  e.pane = 'slides';
  e.gotoSlide(1);
  e.extendSlideSelection(1);
  e.extendSlideSelection(1);
  assert.deepEqual(e.selectedSlideIndexes(), [1, 2, 3]);
  e.extendSlideSelection(-1);
  assert.deepEqual(e.selectedSlideIndexes(), [1, 2]);
  e.toggleSlideHidden();
  assert.deepEqual(e.pres.slides.map((s) => s.hidden), [false, true, true, false, false]);
  e.moveSlide(1);
  assert.deepEqual(e.pres.slides.map((s) => s.id), [ids[0], ids[3], ids[1], ids[2], ids[4]]);
  assert.deepEqual(e.selectedSlideIndexes(), [2, 3], '移動しても選択は保つ');
  e.copy();
  assert.equal(e.clipboard.items.length, 2);
  e.duplicateSlide();
  assert.equal(e.pres.slides.length, 7);
  assert.deepEqual(e.selectedSlideIndexes(), [4, 5], '複製したスライドが選択される');
  e.deleteSlide();
  assert.equal(e.pres.slides.length, 5);
  e.selectAllSlides();
  assert.equal(e.selectedSlideIndexes().length, 5);
  e.pane = 'editor';
  assert.deepEqual(e.selectedSlideIndexes(), [e.slideIndex], '編集領域に移ると複数選択は解除');
});

test('図形の変更とハイパーリンク、自動切り替え', () => {
  const e = ed(2);
  const r = e.insertObject('rect', { text: 'x', fill: '#FF0000' });
  e.changeShape('ellipse');
  assert.deepEqual([e.findObject(r.id).type, e.findObject(r.id).fill], ['ellipse', '#FF0000']);
  e.setShapeLink('https://example.com/');
  assert.equal(e.findObject(r.id).link, 'https://example.com/');
  e.setShapeLink('');
  assert.equal('link' in e.findObject(r.id), false);
  e.setAdvanceAfter(3);
  assert.deepEqual(e.pres.slides.map((s) => s.advanceAfter), [3, null]);
  e.setAdvanceAfter(5, true);
  assert.deepEqual(e.pres.slides.map((s) => s.advanceAfter), [5, 5]);
});

test('文字のリンク: 同じリンクのランは結合、違うリンクは分かれる。URL の検証', () => {
  const ps = fromPlainText('abcd', defaultRunFont());
  applyFont(ps, { p: 0, o: 1 }, { p: 0, o: 3 }, (f) => { f.link = 'https://a.example/'; });
  assert.deepEqual(ps[0].runs.map((r) => [r.text, r.font.link || '']), [['a', ''], ['bc', 'https://a.example/'], ['d', '']]);
  applyFont(ps, { p: 0, o: 0 }, { p: 0, o: 4 }, (f) => { delete f.link; });
  normalizeParagraph(ps[0]);
  assert.equal(ps[0].runs.length, 1);
  assert.ok(isLinkUrl('https://x.jp/a?b=1'));
  assert.ok(isLinkUrl('mailto:a@b.jp'));
  assert.ok(!isLinkUrl('javascript:alert(1)'));
  assert.ok(!isLinkUrl('file:///etc/passwd'));
});

test('保存データ: リンク・縦書き・代替テキスト・自動切り替えの検証', () => {
  const p = normalizePresentation({
    slides: [{
      advanceAfter: 2,
      objects: [
        { type: 'text', vertical: true, alt: '説明', link: 'javascript:x', paragraphs: [{ runs: [{ text: 'a', font: { ...defaultRunFont(), link: 'https://ok.example/' } }, { text: 'b', font: { ...defaultRunFont(), link: 'javascript:bad' } }] }] },
      ],
    }, { advanceAfter: -1, objects: [] }],
  });
  const o = p.slides[0].objects[0];
  assert.equal(o.vertical, true);
  assert.equal(o.alt, '説明');
  assert.equal(o.link, undefined, '危険なリンクは捨てる');
  assert.deepEqual(o.paragraphs[0].runs.map((r) => r.font.link), ['https://ok.example/', undefined]);
  assert.deepEqual(p.slides.map((s) => s.advanceAfter), [2, null]);
});
