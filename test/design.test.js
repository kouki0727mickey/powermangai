import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '../src/core/editor.js';
import { createPresentation, createSlide, objText, SLIDE_SIZES } from '../src/core/model.js';
import { findAll } from '../src/core/search.js';
import { applyFont } from '../src/core/richtext.js';

function ed() {
  return new Editor(createPresentation());
}

test('ノートは入力中は即時反映、ノート欄を離れると 1 回の Undo', () => {
  const e = ed();
  e.beginNotes();
  e.previewNotes('メ');
  e.previewNotes('メモ');
  assert.equal(e.slide.notes, 'メモ');
  e.endNotes();
  assert.equal(e.undoStack.length, 1);
  e.undo();
  assert.equal(e.slide.notes, '');
  e.beginNotes();
  e.endNotes();
  assert.equal(e.undoStack.length, 0, '変更がなければ積まない');
});

test('非表示スライド・背景・テーマ・ヘッダーとフッター', () => {
  const e = ed();
  e.newSlide();
  assert.equal(e.toggleSlideHidden(), true);
  assert.equal(e.slide.hidden, true);
  e.setBackground('@accent1:0.8');
  assert.equal(e.pres.slides[0].background, null);
  e.setBackground('#000000', true);
  assert.ok(e.pres.slides.every((s) => s.background === '#000000'));
  e.setTheme('green');
  assert.equal(e.pres.theme, 'green');
  e.setHeaderFooter({ slideNumber: true, footer: '社外秘', showFooter: true });
  assert.deepEqual([e.pres.headerFooter.slideNumber, e.pres.headerFooter.footer, e.pres.headerFooter.hideOnTitle], [true, '社外秘', true]);
});

test('スライドのサイズ変更で位置と幅が比例する', () => {
  const e = ed();
  const r = e.insertObject('rect', { x: 480, w: 160 });
  e.setSlideSize(SLIDE_SIZES[1]);
  assert.equal(e.pres.width, 720);
  const o = e.findObject(r.id);
  assert.deepEqual([o.x, o.w], [360, 120]);
  assert.equal(e.setSlideSize(SLIDE_SIZES[1]), false);
});

test('レイアウトの変更は同じ種類のプレースホルダーに文字を移す', () => {
  const e = ed();
  e.setText(e.slide.objects[0].id, '表題');
  e.setText(e.slide.objects[1].id, '副題');
  const rect = e.insertObject('rect');
  e.changeLayout('titleContent');
  const objs = e.slide.objects;
  assert.equal(e.slide.layout, 'titleContent');
  assert.equal(objText(objs[0]), '表題');
  assert.equal(objs[0].ph, 'title');
  assert.equal(objs[0].y, createSlide('titleContent').objects[0].y, 'タイトルは新しいレイアウトの位置');
  assert.equal(objText(objs[1]), '副題', 'サブタイトル → 本文');
  assert.ok(objs.some((o) => o.id === rect.id), '他のオブジェクトは残す');
  e.changeLayout('blank');
  assert.equal(e.slide.objects.filter((o) => o.ph).length, 2, '文字のあるプレースホルダーは白紙にしても残る');
  e.undo(); e.undo();
  assert.equal(e.slide.layout, 'title');
});

test('検索: 大文字小文字の区別、表のセル、複数スライド', () => {
  const e = ed();
  e.setText(e.slide.objects[0].id, 'Apple apple');
  e.newSlide();
  const t = e.insertTable(1, 2);
  e.findObject(t.id).cells[0][1].paragraphs[0].runs[0].text = 'APPLE pie';
  assert.equal(findAll(e.pres, 'apple').length, 3);
  assert.equal(findAll(e.pres, 'apple', { matchCase: true }).length, 1);
  const m = findAll(e.pres, 'pie')[0];
  assert.deepEqual([m.slide, m.cell, m.from.o], [1, { r: 0, c: 1 }, 6]);
  assert.deepEqual(findAll(e.pres, ''), []);
});

test('すべて置換は書式を保ち、1 回で Undo できる', () => {
  const e = ed();
  const id = e.slide.objects[0].id;
  e.setText(id, 'aXbXc');
  applyFont(e.findObject(id).paragraphs, { p: 0, o: 1 }, { p: 0, o: 2 }, (f) => { f.bold = true; });
  assert.equal(e.replaceAll('X', 'YY'), 2);
  const o = e.findObject(id);
  assert.equal(objText(o), 'aYYbYYc');
  assert.deepEqual(o.paragraphs[0].runs.map((r) => [r.text, r.bold ?? r.font.bold]), [['a', false], ['YY', true], ['bYYc', false]]);
  e.undo();
  assert.equal(objText(e.findObject(id)), 'aXbXc');
  assert.equal(e.replaceAll('x', '', { matchCase: false }), 2);
  assert.equal(objText(e.findObject(id)), 'abc');
});
