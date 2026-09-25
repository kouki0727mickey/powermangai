import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Editor, stepFontSize, nextCase } from '../src/core/editor.js';
import { createPresentation, createSlide, normalizePresentation, SLIDE_W, SLIDE_H } from '../src/core/model.js';

function blankEditor() {
  const pres = createPresentation();
  pres.slides = [createSlide('blank')];
  return new Editor(pres);
}

test('図形の挿入は中央に配置され選択される', () => {
  const ed = blankEditor();
  const o = ed.insertObject('rect');
  assert.equal(o.x, (SLIDE_W - o.w) / 2);
  assert.equal(o.y, (SLIDE_H - o.h) / 2);
  assert.deepEqual(ed.selection, [o.id]);
});

test('Undo/Redo で挿入を取り消し・やり直しできる', () => {
  const ed = blankEditor();
  ed.insertObject('rect');
  ed.move(10, 0);
  assert.equal(ed.slide.objects[0].x, 410);
  ed.undo();
  assert.equal(ed.slide.objects[0].x, 400);
  ed.undo();
  assert.equal(ed.slide.objects.length, 0);
  assert.equal(ed.undo(), false);
  ed.redo();
  ed.redo();
  assert.equal(ed.slide.objects[0].x, 410);
  assert.equal(ed.redo(), false);
});

test('変更のない操作は履歴に積まれない', () => {
  const ed = blankEditor();
  ed.selectNext(1);
  ed.move(0, 0);
  assert.equal(ed.undoStack.length, 0);
});

test('新しい操作で Redo 履歴は消える', () => {
  const ed = blankEditor();
  ed.insertObject('rect');
  ed.undo();
  ed.insertObject('ellipse');
  assert.equal(ed.redo(), false);
});

test('Tab でオブジェクトを順に選択し、端で循環する', () => {
  const ed = blankEditor();
  const a = ed.insertObject('rect');
  const b = ed.insertObject('ellipse');
  ed.clearSelection();
  ed.selectNext(1);
  assert.deepEqual(ed.selection, [a.id]);
  ed.selectNext(1);
  assert.deepEqual(ed.selection, [b.id]);
  ed.selectNext(1);
  assert.deepEqual(ed.selection, [a.id]);
  ed.selectNext(-1);
  assert.deepEqual(ed.selection, [b.id]);
});

test('グループ化したオブジェクトは 1 単位として選択される', () => {
  const ed = blankEditor();
  const a = ed.insertObject('rect');
  const b = ed.insertObject('ellipse');
  const c = ed.insertObject('triangle');
  ed.setSelection([a.id, b.id]);
  assert.equal(ed.group(), true);
  ed.clearSelection();
  ed.selectNext(1);
  assert.deepEqual(ed.selection.sort(), [a.id, b.id].sort());
  ed.selectNext(1);
  assert.deepEqual(ed.selection, [c.id]);
  ed.setSelection([a.id]);
  assert.equal(ed.selection.length, 2);
  ed.ungroup();
  ed.setSelection([a.id]);
  assert.deepEqual(ed.selection, [a.id]);
});

test('グループ化は 2 単位以上必要', () => {
  const ed = blankEditor();
  ed.insertObject('rect');
  assert.equal(ed.group(), false);
});

test('太字の切り替えは全選択が太字なら解除、それ以外は設定', () => {
  const ed = blankEditor();
  const a = ed.insertObject('text');
  const b = ed.insertObject('text');
  ed.setSelection([a.id]);
  ed.toggleFont('bold');
  ed.setSelection([a.id, b.id]);
  ed.toggleFont('bold');
  assert.equal(ed.findObject(a.id).font.bold, true);
  assert.equal(ed.findObject(b.id).font.bold, true);
  ed.toggleFont('bold');
  assert.equal(ed.findObject(a.id).font.bold, false);
});

test('フォントサイズは PowerPoint と同じ段階で増減する', () => {
  assert.equal(stepFontSize(18, 1), 20);
  assert.equal(stepFontSize(18, -1), 16);
  assert.equal(stepFontSize(10, 1), 10.5);
  assert.equal(stepFontSize(13, 1), 14);
  assert.equal(stepFontSize(13, -1), 12);
  assert.equal(stepFontSize(96, 1), 106);
  assert.equal(stepFontSize(8, -1), 7);
  assert.equal(stepFontSize(1, -1), 1);
});

test('Shift+F3 の大文字小文字切り替え', () => {
  assert.equal(nextCase('Hello world'), 'HELLO WORLD');
  assert.equal(nextCase('HELLO WORLD'), 'hello world');
  assert.equal(nextCase('hello world'), 'Hello World');
  assert.equal(nextCase('Hello World'), 'HELLO WORLD');
  assert.equal(nextCase('日本語'), '日本語');
});

test('コピーと貼り付けはずらして配置し、切り取りは同じ位置', () => {
  const ed = blankEditor();
  const a = ed.insertObject('rect');
  ed.copy();
  ed.paste();
  ed.paste();
  const objs = ed.slide.objects;
  assert.equal(objs.length, 3);
  assert.equal(objs[1].x, a.x + 16);
  assert.equal(objs[2].x, a.x + 32);
  assert.notEqual(objs[1].id, a.id);
  ed.setSelection([a.id]);
  ed.cut();
  ed.paste();
  assert.equal(ed.slide.objects.at(-1).x, a.x);
});

test('グループを貼り付けると新しいグループ ID になる', () => {
  const ed = blankEditor();
  const a = ed.insertObject('rect');
  const b = ed.insertObject('rect');
  ed.setSelection([a.id, b.id]);
  ed.group();
  ed.copy();
  ed.paste();
  const pasted = ed.selectedObjects();
  assert.equal(pasted.length, 2);
  assert.equal(pasted[0].groupId, pasted[1].groupId);
  assert.notEqual(pasted[0].groupId, ed.findObject(a.id).groupId);
});

test('Ctrl+D はオブジェクト選択時は複製、未選択時はスライド複製', () => {
  const ed = blankEditor();
  ed.insertObject('rect');
  ed.duplicate();
  assert.equal(ed.slide.objects.length, 2);
  ed.clearSelection();
  ed.duplicate();
  assert.equal(ed.pres.slides.length, 2);
  assert.equal(ed.slideIndex, 1);
  assert.equal(ed.slide.objects.length, 2);
  assert.notEqual(ed.pres.slides[0].objects[0].id, ed.pres.slides[1].objects[0].id);
});

test('重なり順の変更', () => {
  const ed = blankEditor();
  const a = ed.insertObject('rect');
  const b = ed.insertObject('rect');
  const c = ed.insertObject('rect');
  const order = () => ed.slide.objects.map((o) => o.id);
  ed.setSelection([a.id]);
  ed.reorder('front');
  assert.deepEqual(order(), [b.id, c.id, a.id]);
  ed.reorder('back');
  assert.deepEqual(order(), [a.id, b.id, c.id]);
  ed.reorder('forward');
  assert.deepEqual(order(), [b.id, a.id, c.id]);
  ed.reorder('backward');
  assert.deepEqual(order(), [a.id, b.id, c.id]);
  ed.reorder('backward');
  assert.deepEqual(order(), [a.id, b.id, c.id]);
});

test('単一選択の配置はスライド基準', () => {
  const ed = blankEditor();
  const a = ed.insertObject('rect', { x: 100, y: 100 });
  ed.align('left');
  assert.equal(ed.findObject(a.id).x, 0);
  ed.align('right');
  assert.equal(ed.findObject(a.id).x, SLIDE_W - 160);
  ed.align('bottom');
  assert.equal(ed.findObject(a.id).y, SLIDE_H - 120);
  ed.align('middle');
  assert.equal(ed.findObject(a.id).y, (SLIDE_H - 120) / 2);
});

test('複数選択の配置は選択範囲基準、グループは一体で動く', () => {
  const ed = blankEditor();
  const a = ed.insertObject('rect', { x: 100, y: 0 });
  const b = ed.insertObject('rect', { x: 300, y: 0 });
  const c = ed.insertObject('rect', { x: 500, y: 0 });
  ed.setSelection([b.id, c.id]);
  ed.group();
  ed.setSelection([a.id, b.id]);
  ed.align('left');
  assert.equal(ed.findObject(a.id).x, 100);
  assert.equal(ed.findObject(b.id).x, 100);
  assert.equal(ed.findObject(c.id).x, 300);
});

test('左右に整列（3 つ以上は両端基準）', () => {
  const ed = blankEditor();
  const a = ed.insertObject('rect', { x: 0, y: 0, w: 100 });
  const b = ed.insertObject('rect', { x: 150, y: 0, w: 100 });
  const c = ed.insertObject('rect', { x: 800, y: 0, w: 100 });
  ed.selectAll();
  ed.distribute('h');
  assert.equal(ed.findObject(a.id).x, 0);
  assert.equal(ed.findObject(b.id).x, 400);
  assert.equal(ed.findObject(c.id).x, 800);
});

test('書式のコピーと貼り付け', () => {
  const ed = blankEditor();
  const a = ed.insertObject('rect', { fill: '#FF0000', font: { bold: true, size: 30 } });
  const b = ed.insertObject('rect');
  ed.setSelection([a.id]);
  ed.copyFormat();
  ed.setSelection([b.id]);
  ed.pasteFormat();
  const ob = ed.findObject(b.id);
  assert.equal(ob.fill, '#FF0000');
  assert.equal(ob.font.bold, true);
  assert.equal(ob.font.size, 30);
  ob.font.size = 12;
  assert.equal(ed.formatClipboard.font.size, 30, '書式クリップボードが共有参照になっていない');
});

test('スライドの追加・移動・削除', () => {
  const ed = blankEditor();
  ed.newSlide();
  ed.newSlide();
  assert.equal(ed.pres.slides.length, 3);
  assert.equal(ed.slideIndex, 2);
  const id = ed.slide.id;
  ed.moveSlide(-1);
  assert.equal(ed.slideIndex, 1);
  assert.equal(ed.pres.slides[1].id, id);
  assert.equal(ed.moveSlide(-5), false);
  ed.gotoSlide(0);
  assert.equal(ed.moveSlide(-1), false);
  ed.deleteSlide();
  ed.deleteSlide();
  ed.deleteSlide();
  assert.equal(ed.pres.slides.length, 1, '最後の 1 枚は空白スライドとして残る');
});

test('スライドのコピーと貼り付け（スライド一覧ペイン）', () => {
  const ed = blankEditor();
  ed.insertObject('rect');
  ed.pane = 'slides';
  ed.copy();
  ed.paste();
  assert.equal(ed.pres.slides.length, 2);
  assert.equal(ed.slideIndex, 1);
  assert.equal(ed.slide.objects.length, 1);
});

test('テキストの編集と Undo', () => {
  const ed = blankEditor();
  const t = ed.insertObject('text');
  assert.equal(ed.startEdit(), true);
  assert.equal(ed.editingId, t.id);
  ed.endEdit('こんにちは');
  assert.equal(ed.editingId, null);
  assert.equal(ed.findObject(t.id).text, 'こんにちは');
  ed.undo();
  assert.equal(ed.findObject(t.id).text, '');
});

test('直線はテキスト編集できない', () => {
  const ed = blankEditor();
  ed.insertObject('line');
  assert.equal(ed.startEdit(), false);
});

test('Ctrl+Enter で次のプレースホルダー、最後なら新規スライド', () => {
  const pres = createPresentation();
  const ed = new Editor(pres);
  assert.equal(ed.nextPlaceholder(), 'select');
  assert.equal(ed.nextPlaceholder(), 'select');
  assert.equal(ed.nextPlaceholder(), 'newSlide');
  assert.equal(ed.pres.slides.length, 2);
});

test('回転は 0〜359 に正規化', () => {
  const ed = blankEditor();
  ed.insertObject('rect');
  ed.rotate(-15);
  assert.equal(ed.selectedObjects()[0].rotation, 345);
  ed.rotate(30);
  assert.equal(ed.selectedObjects()[0].rotation, 15);
});

test('サイズ変更は 1px 未満にならない（直線の高さは 0 可）', () => {
  const ed = blankEditor();
  ed.insertObject('rect', { w: 5, h: 5 });
  ed.resize(-50, -50);
  assert.equal(ed.selectedObjects()[0].w, 1);
  ed.insertObject('line');
  ed.resize(0, -8);
  assert.equal(ed.selectedObjects()[0].h, 0);
});

test('Undo でスライドが減ったとき slideIndex が範囲内に収まる', () => {
  const ed = blankEditor();
  ed.newSlide();
  ed.undo();
  assert.equal(ed.pres.slides.length, 1);
  assert.equal(ed.slideIndex, 0);
});

test('保存データの正規化と検証', () => {
  const pres = normalizePresentation({ slides: [{ objects: [{ type: 'rect', x: 1, y: 2, w: 3, h: 4 }] }] });
  assert.equal(pres.slides[0].objects[0].fill, '#4472C4');
  assert.ok(pres.slides[0].id);
  assert.throws(() => normalizePresentation(null));
  assert.throws(() => normalizePresentation({ slides: [{ objects: [{ type: 'bogus' }] }] }));
  assert.throws(() => normalizePresentation({ slides: [{ objects: [{ type: 'rect', x: 'a' }] }] }));
  assert.equal(normalizePresentation({ slides: [] }).slides.length, 1);
});
