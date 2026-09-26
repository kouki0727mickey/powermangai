import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShape, buildDetail, textRect } from '../src/core/shapes.js';
import { SHAPE_TYPES, createPresentation, createSlide, displayName, shapeStyles } from '../src/core/model.js';
import { Editor } from '../src/core/editor.js';
import { isColorValue } from '../src/core/colors.js';

/** パスの記録用（canvas の代わり） */
function recorder() {
  const pts = [];
  const rec = {
    pts, calls: 0,
    moveTo(x, y) { pts.push([x, y]); rec.calls++; },
    lineTo(x, y) { pts.push([x, y]); rec.calls++; },
    quadraticCurveTo(cx, cy, x, y) { pts.push([x, y]); rec.calls++; },
    bezierCurveTo(a, b, c, d, x, y) { pts.push([x, y]); rec.calls++; },
    ellipse(cx, cy, rx, ry) { pts.push([cx - rx, cy - ry], [cx + rx, cy + ry]); rec.calls++; },
    rect(x, y, w, h) { pts.push([x, y], [x + w, y + h]); rec.calls++; },
    closePath() {},
  };
  return rec;
}

test('すべての図形のパスが作れ、座標は数値（範囲外にはみ出しすぎない）', () => {
  for (const type of SHAPE_TYPES) {
    const r = recorder();
    buildShape(r, type, 200, 100);
    assert.ok(r.calls > 0, type);
    for (const [x, y] of r.pts) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y), type);
      assert.ok(x >= -1 && x <= 201 && y >= -10 && y <= 131, `${type}: (${x}, ${y})`);
    }
  }
});

test('細部の線（直方体・円柱・スマイル）', () => {
  for (const t of ['cube', 'can', 'smileyFace']) assert.equal(buildDetail(recorder(), t, 100, 100), true);
  assert.equal(buildDetail(recorder(), 'rect', 100, 100), false);
});

test('楕円の文字領域は内側', () => {
  const r = textRect('ellipse', 200, 100);
  assert.ok(r.x > 0 && r.w < 200);
  assert.deepEqual(textRect('rect', 200, 100), { x: 0, y: 0, w: 200, h: 100 });
});

function ed() {
  const pres = createPresentation();
  pres.slides = [createSlide('blank')];
  return new Editor(pres);
}

test('反転は切り替え、Undo で戻る', () => {
  const e = ed();
  const o = e.insertObject('rightArrow');
  e.flip('h');
  assert.equal(e.findObject(o.id).flipH, true);
  e.flip('h');
  assert.equal(e.findObject(o.id).flipH, false);
  e.flip('v');
  e.undo();
  assert.equal(e.findObject(o.id).flipV, false);
});

test('線の種類（矢印）は線だけ変わる', () => {
  const e = ed();
  const l = e.insertObject('line');
  const r = e.insertObject('rect');
  e.selectAll();
  e.setLineType('arrow');
  assert.equal(e.findObject(l.id).type, 'arrow');
  assert.equal(e.findObject(r.id).type, 'rect');
});

test('クイック スタイルは塗りつぶし・枠線・文字の色を変える（線には適用しない）', () => {
  const styles = shapeStyles();
  assert.equal(styles.length, 28);
  for (const st of styles) {
    assert.ok(isColorValue(st.fill));
    assert.ok(st.stroke === null || isColorValue(st.stroke));
  }
  const e = ed();
  const r = e.insertObject('rect', { text: 'a' });
  e.applyShapeStyle(styles[8]);
  const o = e.findObject(r.id);
  assert.equal(o.fill, styles[8].fill);
  assert.equal(o.paragraphs[0].runs[0].font.color, styles[8].text);
  e.insertObject('line');
  assert.equal(e.applyShapeStyle(styles[0]), false);
});

test('図形の書式設定の適用（線の塗りつぶしは無視、回転は正規化、余白は部分更新）', () => {
  const e = ed();
  const r = e.insertObject('rect');
  e.applyProps({ x: 10, w: 0, rotation: -30, opacity: 0.5, inset: { l: 20 }, fill: '@accent2' });
  const o = e.findObject(r.id);
  assert.deepEqual([o.x, o.w, o.rotation, o.opacity, o.inset.l, o.inset.t, o.fill], [10, 1, 330, 0.5, 20, 3.6, '@accent2']);
  const l = e.insertObject('line');
  e.applyProps({ fill: '@accent2' });
  assert.equal(e.findObject(l.id).fill, null);
});

test('選択ウィンドウ: 追加選択、名前、非表示のオブジェクトは Tab と Ctrl+A で選ばれない', () => {
  const e = ed();
  const a = e.insertObject('rect');
  const b = e.insertObject('ellipse');
  const c = e.insertObject('star');
  e.toggleSelect(a.id, false);
  e.toggleSelect(c.id, true);
  assert.deepEqual(e.selection, [a.id, c.id]);
  e.toggleSelect(a.id, true);
  assert.deepEqual(e.selection, [c.id]);
  assert.equal(displayName(e.findObject(b.id), e.slide), '楕円 2');
  e.renameObject(b.id, 'ボール');
  assert.equal(displayName(e.findObject(b.id), e.slide), 'ボール');
  e.toggleHidden(b.id);
  e.clearSelection();
  e.selectNext(1); e.selectNext(1); e.selectNext(1);
  assert.notEqual(e.selection[0], b.id);
  e.selectAll();
  assert.ok(!e.selection.includes(b.id));
  e.toggleHidden(c.id);
  assert.ok(!e.selection.includes(c.id), '非表示にすると選択から外れる');
});

test('線の太さは各図形の枠線の色を保つ', () => {
  const e = ed();
  const a = e.insertObject('rect', { stroke: '#FF0000' });
  const b = e.insertObject('rect', { stroke: null });
  e.selectAll();
  e.setStrokeWidth(3);
  assert.deepEqual([e.findObject(a.id).stroke, e.findObject(b.id).stroke], ['#FF0000', '@accent1']);
  assert.ok(e.selectedObjects().every((o) => o.strokeWidth === 3));
});

test('グループの 1 つを非表示にするとグループ全体の選択が外れる', () => {
  const e = ed();
  const a = e.insertObject('rect');
  const b = e.insertObject('rect');
  e.selectAll(); e.group();
  e.toggleHidden(a.id);
  assert.deepEqual(e.selection, []);
  assert.ok(e.findObject(b.id));
});
