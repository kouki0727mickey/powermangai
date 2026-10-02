import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createObject, createSlide } from '../src/core/model.js';
import {
  objectAt, objectsInRect, handleAt, resizeByHandle, moveLineEnd, rotationFromPoint, lineEnds, hitsObject,
} from '../src/core/hittest.js';

const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;
const rect = (p) => createObject('rect', { x: 100, y: 100, w: 200, h: 100, ...p });

test('当たり判定: 手前の図形、回転した図形、線、非表示は除く', () => {
  const slide = createSlide('blank');
  const a = rect({});
  const b = rect({ x: 150, y: 120, w: 50, h: 50 });
  const hidden = rect({ x: 0, y: 0, w: 960, h: 540, hidden: true });
  slide.objects = [a, b, hidden];
  assert.equal(objectAt(slide, 160, 130).id, b.id, '手前の図形');
  assert.equal(objectAt(slide, 290, 190).id, a.id);
  assert.equal(objectAt(slide, 10, 10), null, '非表示は当たらない');
  // 90° 回転した 200×100 の図形は縦長
  const r = rect({ rotation: 90 });
  assert.ok(hitsObject(r, 200, 210));
  assert.ok(!hitsObject(r, 110, 150));
  const line = createObject('line', { x: 0, y: 0, w: 100, h: 100 });
  assert.ok(hitsObject(line, 50, 51));
  assert.ok(!hitsObject(line, 50, 70));
});

test('範囲選択は完全に囲んだ図形だけ', () => {
  const slide = createSlide('blank');
  const a = rect({});
  const b = rect({ x: 500, y: 100, w: 100, h: 100 });
  slide.objects = [a, b];
  assert.deepEqual(objectsInRect(slide, { x1: 90, y1: 90, x2: 310, y2: 210 }).map((o) => o.id), [a.id]);
  assert.deepEqual(objectsInRect(slide, { x1: 610, y1: 210, x2: 90, y2: 90 }).length, 2, '逆向きのドラッグ');
});

test('ハンドル: 角・辺・回転（画面上の大きさは倍率で変わる）', () => {
  const o = rect({});
  assert.equal(handleAt(o, 300, 200, 1), 'se');
  assert.equal(handleAt(o, 200, 100, 1), 'n');
  assert.equal(handleAt(o, 200, 100 - 18, 1), 'rotate');
  assert.equal(handleAt(o, 200, 100 - 9, 2), 'rotate', '倍率 2 では 9pt 上');
  assert.equal(handleAt(o, 200, 150, 1), null);
  const line = createObject('line', { x: 0, y: 0, w: 100, h: 50, flipH: true });
  const [s] = lineEnds(line);
  assert.deepEqual([s.x, s.y], [100, 0], '左右反転した線の始点は右');
  assert.equal(handleAt(line, 100, 0, 1), 'start');
});

test('サイズ変更: 反対側は動かない、縦横比の維持、回転した図形', () => {
  const o = rect({});
  assert.deepEqual(resizeByHandle(o, 'se', 40, 30), { x: 100, y: 100, w: 240, h: 130 });
  assert.deepEqual(resizeByHandle(o, 'nw', 40, 30), { x: 140, y: 130, w: 160, h: 70 });
  assert.deepEqual(resizeByHandle(o, 'e', 40, 999), { x: 100, y: 100, w: 240, h: 100 }, '辺は一方向だけ');
  const k = resizeByHandle(o, 'se', 100, 0, { keepAspect: true });
  assert.ok(near(k.w / k.h, 2));
  assert.equal(resizeByHandle(o, 'w', 500, 0).w, 1, '最小の大きさ');
  // 90° 回転した図形の「右」ハンドル（画面では下）を下へ 40 → 幅が 40 増え、反対側（画面の上端）は動かない
  const r = rect({ rotation: 90 });
  const box = resizeByHandle(r, 'e', 0, 40);
  assert.ok(near(box.w, 240));
  const topBefore = 150 - 100, topAfter = box.y + box.h / 2 - box.w / 2;
  assert.ok(near(topBefore, topAfter), `${topBefore} ${topAfter}`);
});

test('線の端点の移動と回転角', () => {
  const line = createObject('line', { x: 0, y: 0, w: 100, h: 50 });
  assert.deepEqual(moveLineEnd(line, 'end', -20, 80), { x: -20, y: 0, w: 20, h: 80, flipH: true, flipV: false, rotation: 0 });
  const o = rect({});
  assert.equal(rotationFromPoint(o, 400, 150), 90);
  assert.equal(rotationFromPoint(o, 200, 400), 180);
  assert.equal(rotationFromPoint(o, 300, 60, true) % 15, 0, 'Shift で 15° 刻み');
});

test('縦横比の維持: 角を内側へドラッグすると縮む、辺でも比率を保つ', () => {
  const o = rect({});
  const k = resizeByHandle(o, 'se', -100, 0, { keepAspect: true });
  assert.deepEqual([k.w, k.h], [100, 50]);
  const e = resizeByHandle(o, 'e', 100, 0, { keepAspect: true });
  assert.deepEqual([e.w, e.h], [300, 150]);
  assert.ok(near(e.y + e.h / 2, 150), '辺のハンドルでは高さは中心を保って変わる');
});
