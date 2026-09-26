import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, stepDuration, effectStyle, objectStyler, transitionFrame, TRANSITIONS, EFFECTS } from '../src/core/animation.js';
import { Editor } from '../src/core/editor.js';
import { createPresentation, createSlide, normalizePresentation } from '../src/core/model.js';

const A = (target, trigger = 'click', duration = 1, effect = 'fade') => ({ target, effect, trigger, duration });

test('クリック / 同時 / 後 のステップと開始時刻', () => {
  const steps = buildSteps([A('a'), A('b', 'with'), A('c', 'after', 2), A('d'), A('e', 'after')]);
  assert.equal(steps.length, 2);
  assert.deepEqual(steps[0].items.map((i) => [i.anim.target, i.start, i.end]), [['a', 0, 1], ['b', 0, 1], ['c', 1, 3]]);
  assert.equal(stepDuration(steps[0]), 3);
  assert.deepEqual(steps[1].items.map((i) => [i.anim.target, i.start]), [['d', 0], ['e', 1]]);
  assert.equal(steps[0].auto, false);
});

test('先頭が「クリック時」でなければ最初のステップは自動再生', () => {
  const steps = buildSteps([A('a', 'after'), A('b')]);
  assert.equal(steps[0].auto, true);
  assert.equal(steps[1].auto, false);
  assert.deepEqual(buildSteps([]), []);
});

test('効果の見た目', () => {
  const o = { x: 100, y: 100, w: 100, h: 50 };
  const size = { width: 960, height: 540 };
  assert.deepEqual(effectStyle({ effect: 'appear' }, o, 0, size), { hidden: true });
  assert.deepEqual(effectStyle({ effect: 'appear' }, o, 0.5, size), {});
  assert.equal(effectStyle({ effect: 'fade' }, o, 0, size).alpha, 0);
  assert.equal(effectStyle({ effect: 'fade' }, o, 1, size).alpha, 1);
  assert.equal(effectStyle({ effect: 'flyIn' }, o, 0, size).dy, 440, '下からはスライドの外から');
  assert.equal(effectStyle({ effect: 'flyIn', direction: 'fromLeft' }, o, 0, size).dx, -200);
  assert.equal(effectStyle({ effect: 'flyIn' }, o, 1, size).dy, 0);
  const w = effectStyle({ effect: 'wipe', direction: 'fromLeft' }, o, 0.5, size).clip;
  assert.ok(w.w > 0 && w.w < o.w + 8);
});

test('スライドショー中の見た目: 未再生は非表示、再生済みは通常', () => {
  const slide = { objects: [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 0, y: 0, w: 10, h: 10 }, { id: 'c', x: 0, y: 0, w: 10, h: 10 }] };
  const steps = buildSteps([A('a'), A('b')]);
  const size = { width: 960, height: 540 };
  let st = objectStyler(slide, steps, 0, null, 0, size);
  assert.deepEqual(st(slide.objects[0]), { hidden: true });
  assert.equal(st(slide.objects[2]), null, 'アニメーションのないものは常に表示');
  st = objectStyler(slide, steps, 0, 0, 0.5, size);
  assert.ok(st(slide.objects[0]).alpha > 0);
  assert.deepEqual(st(slide.objects[1]), { hidden: true });
  st = objectStyler(slide, steps, 1, null, 0, size);
  assert.equal(st(slide.objects[0]), null);
});

test('グループはメンバーのアニメーションでまとめて動く', () => {
  const slide = { objects: [{ id: 'a', groupId: 'g', x: 0, y: 0, w: 1, h: 1 }, { id: 'b', groupId: 'g', x: 0, y: 0, w: 1, h: 1 }] };
  const st = objectStyler(slide, buildSteps([A('a')]), 0, null, 0, { width: 960, height: 540 });
  assert.deepEqual(st(slide.objects[1]), { hidden: true });
});

test('画面切り替えのフレーム', () => {
  for (const t of TRANSITIONS) {
    const f0 = transitionFrame({ type: t.id }, 0, 100, 50);
    const f1 = transitionFrame({ type: t.id }, 1, 100, 50);
    assert.ok(f0.some((l) => l.slide === 'next'), t.id);
    const n1 = f1.find((l) => l.slide === 'next');
    assert.ok(!n1.dx && !n1.dy && (n1.alpha === undefined || n1.alpha === 1), `${t.id}: 終了時は次のスライドがそのまま`);
  }
  assert.equal(transitionFrame({ type: 'push', direction: 'fromRight' }, 0, 100, 50)[1].dx, 100);
  assert.equal(transitionFrame({ type: 'uncover' }, 0.5, 100, 50)[1].slide, 'prev', 'アンカバーは前のスライドが上');
});

test('エディター: 画面切り替え・アニメーションの設定、削除した図形のアニメーションは消える', () => {
  const pres = createPresentation();
  pres.slides = [createSlide('blank'), createSlide('blank')];
  const e = new Editor(pres);
  e.setTransition({ type: 'push', direction: 'fromLeft' });
  assert.deepEqual(e.slide.transition, { type: 'push', duration: 0.7, direction: 'fromLeft' });
  e.setTransition({ type: 'fade' }, true);
  assert.ok(e.pres.slides.every((s) => s.transition.type === 'fade'));
  e.setTransition({ type: 'none' });
  assert.equal(e.slide.transition, null);
  const a = e.insertObject('rect');
  const b = e.insertObject('ellipse');
  e.setSelection([a.id]); e.setAnimation('fade');
  e.setSelection([b.id]); e.setAnimation('flyIn');
  e.updateAnimation({ trigger: 'after', direction: 'fromLeft' });
  assert.deepEqual(e.slide.animations.map((x) => [x.target, x.effect, x.trigger]), [[a.id, 'fade', 'click'], [b.id, 'flyIn', 'after']]);
  e.setAnimation('zoom');
  assert.equal(e.slide.animations[1].effect, 'zoom', '同じ図形は置き換え');
  e.moveAnimation(1, -1);
  assert.equal(e.slide.animations[0].target, b.id);
  e.setSelection([a.id]); e.deleteSelection();
  assert.deepEqual(e.slide.animations.map((x) => x.target), [b.id]);
  e.duplicateSlide();
  assert.equal(e.slide.animations.length, 1);
  assert.notEqual(e.slide.animations[0].target, b.id, '複製したスライドのアニメーションは複製した図形を指す');
  assert.ok(e.slide.objects.some((o) => o.id === e.slide.animations[0].target));
});

test('保存データのアニメーションの検証', () => {
  const pres = normalizePresentation({
    slides: [{
      transition: { type: 'bogus' },
      objects: [{ id: 'x', type: 'rect' }],
      animations: [{ target: 'x', effect: 'flyIn', trigger: 'nope', direction: 'fromLeft' }, { target: 'missing', effect: 'fade' }, { target: 'x', effect: 'spin' }],
    }],
  });
  const s = pres.slides[0];
  assert.equal(s.transition, null);
  assert.deepEqual(s.animations, [{ target: 'x', effect: 'flyIn', trigger: 'click', duration: 0.5, direction: 'fromLeft' }]);
  assert.ok(EFFECTS.length >= 6);
});

test('グループの効果の範囲はグループ全体、効果を変えると既定の継続時間になる', () => {
  const slide = { objects: [{ id: 'a', groupId: 'g', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', groupId: 'g', x: 100, y: 200, w: 10, h: 10 }] };
  const steps = buildSteps([{ target: 'a', effect: 'wipe', trigger: 'click', duration: 1, direction: 'fromLeft' }]);
  const st = objectStyler(slide, steps, 0, 0, 1, { width: 960, height: 540 });
  const clip = st(slide.objects[1]).clip;
  assert.ok(clip.x + clip.w >= 110 && clip.y + clip.h >= 210, 'ワイプの範囲にグループの他のメンバーも入る');
  const pres = createPresentation();
  const e = new Editor(pres);
  e.insertObject('rect');
  e.setAnimation('appear');
  e.setAnimation('fade');
  assert.equal(e.slide.animations[0].duration, 0.5);
  e.updateAnimation({ duration: 2 });
  e.setAnimation('zoom');
  assert.equal(e.slide.animations[0].duration, 2, '自分で変えた時間は保つ');
});
