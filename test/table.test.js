import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable, tableLayout, insertRow, insertColumn, deleteRow, deleteColumn, fitTable } from '../src/core/table.js';
import { Editor } from '../src/core/editor.js';
import { createPresentation, createSlide, normalizePresentation, objFont, allParas } from '../src/core/model.js';
import { fromPlainText, defaultRunFont } from '../src/core/richtext.js';
import { approxMeasure } from '../src/core/textlayout.js';

function ed() {
  const pres = createPresentation();
  pres.slides = [createSlide('blank')];
  return new Editor(pres);
}

test('表の作成と行・列の追加削除（列を追加しても表の幅は変わらない）', () => {
  const t = createTable(2, 3, { w: 600 });
  assert.equal(t.cells.length, 2);
  assert.equal(t.colWidths.length, 3);
  insertColumn(t, 1);
  assert.equal(t.colWidths.length, 4);
  assert.equal(Math.round(t.colWidths.reduce((a, b) => a + b)), 600);
  insertRow(t, 0);
  assert.equal(t.cells.length, 3);
  assert.equal(t.cells[0][0].paragraphs[0].runs[0].font.bold, true, '先頭に追加した行は見出しの書式');
  assert.equal(deleteRow(t, 0), true);
  assert.equal(deleteColumn(t, 0), true);
  assert.equal(Math.round(t.colWidths.reduce((a, b) => a + b)), 600);
  const one = createTable(1, 1);
  assert.equal(deleteRow(one, 0), false);
  assert.equal(deleteColumn(one, 0), false);
});

test('行の高さは文字量に合わせて伸びる', () => {
  const t = createTable(2, 2, { w: 200 });
  const base = tableLayout(t, approxMeasure).total;
  t.cells[1][0].paragraphs = fromPlainText('a\nb\nc\nd', defaultRunFont());
  const lay = tableLayout(t, approxMeasure);
  assert.ok(lay.heights[1] > t.rowHeights[1]);
  assert.ok(lay.total > base);
  fitTable(t, approxMeasure);
  assert.equal(t.h, Math.round(lay.total * 10) / 10);
});

test('エディター: 表の挿入・セルの編集・行の挿入・Undo', () => {
  const e = ed();
  const t = e.insertTable(2, 3);
  assert.equal(e.findObject(t.id).x, (960 - 840) / 2);
  e.startEdit({ r: 1, c: 2 });
  e.previewEdit(fromPlainText('x', defaultRunFont()));
  e.moveCell(0, 0);
  e.endEdit(fromPlainText('見出し', defaultRunFont()));
  const tt = e.findObject(t.id);
  assert.equal(tt.cells[1][2].paragraphs[0].runs[0].text, 'x');
  assert.equal(tt.cells[0][0].paragraphs[0].runs[0].text, '見出し');
  e.undo();
  assert.equal(e.findObject(t.id).cells[1][2].paragraphs[0].runs[0].text, '', '編集全体が 1 回で戻る');
  e.redo();
  e.setSelection([t.id]);
  e.tableOp('rowAbove', { r: 1, c: 0 });
  assert.equal(e.findObject(t.id).cells.length, 3);
  assert.equal(e.findObject(t.id).cells[2][2].paragraphs[0].runs[0].text, 'x');
  e.tableOp('colRight');
  assert.equal(e.findObject(t.id).colWidths.length, 4);
  e.tableOp('deleteCol', { r: 0, c: 0 });
  assert.equal(e.findObject(t.id).cells[0][0].paragraphs[0].runs[0].text, '');
});

test('表を選択して Ctrl+B / 中央揃え はすべてのセルに適用', () => {
  const e = ed();
  const t = e.insertTable(2, 2);
  e.toggleFont('italic');
  e.setAlign('center');
  const paras = allParas(e.findObject(t.id));
  assert.equal(paras.length, 4);
  assert.ok(paras.every((p) => p.align === 'center' && p.runs[0].font.italic));
});

test('表のサイズ変更は列幅・行の高さを比例して変える', () => {
  const e = ed();
  const t = e.insertTable(2, 2);
  const w0 = e.findObject(t.id).w;
  e.resize(80, 0);
  const tt = e.findObject(t.id);
  assert.equal(Math.round(tt.w), w0 + 80);
  assert.equal(Math.round(tt.colWidths[0]), Math.round((w0 + 80) / 2));
});

test('セルの塗りつぶし、タイトル行・縞模様の切り替え', () => {
  const e = ed();
  const t = e.insertTable(2, 2);
  e.setCellFill('#FF0000', { r: 1, c: 1 });
  assert.equal(e.findObject(t.id).cells[1][1].fill, '#FF0000');
  e.setCellFill(null);
  assert.ok(e.findObject(t.id).cells.flat().every((c) => c.fill === null));
  e.setTableProp('headerRow', false);
  assert.equal(e.findObject(t.id).headerRow, false);
});

test('図の挿入はスライドに収まるよう縮小し、縦横比を保ってサイズ変更', () => {
  const e = ed();
  const img = e.insertImage('data:image/png;base64,AAAA', { w: 2000, h: 1000 });
  const o = e.findObject(img.id);
  assert.equal(o.w, 768);
  assert.equal(o.h, 384);
  assert.equal(o.fill, null);
  e.resize(32, 0);
  assert.equal(e.findObject(img.id).w, 800);
  assert.equal(e.findObject(img.id).h, 400);
});

test('表と図は保存・読み込みで保たれる。不正な表・画像は拒否', () => {
  const e = ed();
  e.insertTable(2, 2);
  e.insertImage('data:image/png;base64,AAAA', { w: 10, h: 10 });
  const back = normalizePresentation(JSON.parse(JSON.stringify(e.pres)));
  assert.equal(back.slides[0].objects[0].cells.length, 2);
  assert.equal(back.slides[0].objects[1].src, 'data:image/png;base64,AAAA');
  const bad = (o) => ({ slides: [{ objects: [o] }] });
  assert.throws(() => normalizePresentation(bad({ type: 'image', src: 'http://x/y.png' })), /画像/);
  assert.throws(() => normalizePresentation(bad({ type: 'table', cells: [[]], colWidths: [], rowHeights: [1] })), /表/);
  const t = JSON.parse(JSON.stringify(e.pres.slides[0].objects[0]));
  t.colWidths = [100];
  assert.throws(() => normalizePresentation(bad(t)), /列幅/);
});
