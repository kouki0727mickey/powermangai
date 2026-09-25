import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePresentation, matchObjects, imageSimilarity } from '../src/core/scoring.js';
import { CHALLENGES } from '../src/core/challenges.js';
import { Editor } from '../src/core/editor.js';
import { createObject, createSlide, clone, SHAPE_TYPES } from '../src/core/model.js';
import { paletteGrid, adjust, colorName, sameColor } from '../src/core/colors.js';
import { keyTipPaths } from '../src/core/keytips.js';

const pres = (...slides) => ({ version: 1, slides: slides.map((objects) => ({ id: 's', objects })) });

test('完成形そのものは 100 点', () => {
  for (const c of CHALLENGES) {
    const t = c.target();
    assert.equal(scorePresentation(clone(t), t).score, 100, c.id);
  }
});

test('開始状態は 100 点未満（どの課題も作業が必要）', () => {
  for (const c of CHALLENGES) {
    const r = scorePresentation(c.start(), c.target());
    assert.ok(r.score < 100, `${c.id}: ${r.score}`);
  }
});

test('課題の色はすべてパレットから選べる', () => {
  const colors = new Set(paletteGrid().flat().map((c) => c.hex));
  for (const c of CHALLENGES) {
    for (const s of c.target().slides) {
      for (const o of s.objects) {
        for (const col of [o.fill, o.font.color]) {
          if (col && !['#2F528F', '#595959'].includes(col)) assert.ok(colors.has(col), `${c.id}: ${col}`);
        }
      }
    }
  }
});

test('位置は許容範囲内なら OK、外なら NG', () => {
  const t = pres([createObject('rect', { x: 100, y: 100 })]);
  assert.equal(scorePresentation(pres([createObject('rect', { x: 108, y: 92 })]), t).score, 100);
  const r = scorePresentation(pres([createObject('rect', { x: 130, y: 100 })]), t);
  assert.ok(r.score < 100);
  assert.ok(r.checks.some((c) => !c.ok && c.message.includes('位置')));
});

test('足りない図形・余分な図形・余分なスライドは減点', () => {
  const t = pres([createObject('rect'), createObject('ellipse')]);
  const missing = scorePresentation(pres([createObject('rect')]), t);
  assert.ok(missing.checks.some((c) => !c.ok && c.message.includes('楕円 がありません')));
  const extra = scorePresentation(pres([createObject('rect'), createObject('ellipse'), createObject('star')]), t);
  assert.ok(extra.score < 100);
  const extraSlide = scorePresentation(pres([createObject('rect'), createObject('ellipse')], []), t);
  assert.ok(extraSlide.checks.some((c) => !c.ok && c.message.includes('不要なスライド')));
});

test('空のプレースホルダーは採点対象外', () => {
  const t = pres([createObject('rect')]);
  const u = pres([createObject('rect'), createObject('text', { placeholder: 'x' })]);
  assert.equal(scorePresentation(u, t).score, 100);
});

test('対応付けは種類と文字を優先する', () => {
  const t = [createObject('text', { text: 'A', x: 0 }), createObject('text', { text: 'B', x: 500 })];
  const u = [createObject('text', { text: 'B', x: 0 }), createObject('text', { text: 'A', x: 500 })];
  assert.deepEqual(matchObjects(t, u), [1, 0]);
  assert.deepEqual(matchObjects([createObject('rect')], [createObject('ellipse')]), [-1]);
});

test('重なり順の違いを検出', () => {
  const a = createObject('rect', { x: 0, y: 0 });
  const b = createObject('ellipse', { x: 50, y: 50 });
  assert.equal(scorePresentation(pres([clone(a), clone(b)]), pres([a, b])).score, 100);
  const r = scorePresentation(pres([clone(b), clone(a)]), pres([a, b]));
  assert.ok(r.checks.some((c) => !c.ok && c.message.includes('前面')));
});

test('グループ化の有無を検出', () => {
  const t = pres([createObject('rect', { x: 0, groupId: 'g' }), createObject('ellipse', { x: 800, groupId: 'g' })]);
  const ungrouped = pres([createObject('rect', { x: 0 }), createObject('ellipse', { x: 800 })]);
  assert.ok(scorePresentation(ungrouped, t).checks.some((c) => !c.ok && c.message.includes('グループ化')));
  const grouped = pres([createObject('rect', { x: 0, groupId: 'x' }), createObject('ellipse', { x: 800, groupId: 'x' })]);
  assert.equal(scorePresentation(grouped, t).score, 100);
  assert.ok(scorePresentation(grouped, ungrouped).checks.some((c) => !c.ok && c.message.includes('不要なグループ')));
});

test('回転は 360 度をまたいでも比較できる', () => {
  const t = pres([createObject('rect', { rotation: 359 })]);
  assert.equal(scorePresentation(pres([createObject('rect', { rotation: 1 })]), t).score, 100);
  assert.ok(scorePresentation(pres([createObject('rect', { rotation: 180 })]), t).score < 100);
});

test('課題のヒント通りの操作で 100 点になる（エディター経由）', () => {
  // c2: テキスト ボックス
  const c2 = CHALLENGES.find((c) => c.id === 'c2-textbox');
  const ed = new Editor(c2.start());
  const tb = ed.insertObject('text');
  ed.startEdit();
  ed.endEdit('重要なお知らせ');
  ed.toggleFont('bold');
  ed.setAlign('center');
  ed.setFont('size', 32);
  ed.setFont('color', '#FF0000');
  ed.align('top');
  assert.equal(ed.findObject(tb.id).y, 0);
  assert.equal(scorePresentation(ed.pres, c2.target()).score, 100);

  // c4: 複製と整列
  const c4 = CHALLENGES.find((c) => c.id === 'c4-duplicate');
  const e4 = new Editor(c4.start());
  e4.insertObject('ellipse');
  e4.setFill('#70AD47');
  e4.duplicate();
  e4.duplicate();
  e4.clearSelection();
  for (const mode of ['left', 'center', 'right']) {
    e4.selectNext(1);
    e4.align(mode);
    e4.align('middle');
  }
  assert.equal(scorePresentation(e4.pres, c4.target()).score, 100);

  // c6: 回転とグループ化
  const c6 = CHALLENGES.find((c) => c.id === 'c6-group');
  const e6 = new Editor(c6.start());
  e6.insertObject('rect'); e6.align('left');
  e6.insertObject('ellipse'); e6.align('right');
  e6.selectAll(); e6.group();
  e6.insertObject('triangle'); e6.setFill('#ED7D31'); e6.rotate(90); e6.rotate(90);
  assert.equal(scorePresentation(e6.pres, c6.target()).score, 100);

  // c7: 帯と重なり順
  const c7 = CHALLENGES.find((c) => c.id === 'c7-banner');
  const e7 = new Editor(c7.start());
  e7.insertObject('rect');
  e7.setDimension('w', 960);
  e7.setDimension('h', 120);
  e7.align('left'); e7.align('top');
  e7.setFill('#44546A');
  e7.reorder('back');
  assert.equal(scorePresentation(e7.pres, c7.target()).score, 100);
});

test('課題 5・8 のスライド構成はエディターで作れる', () => {
  const c5 = CHALLENGES.find((c) => c.id === 'c5-slides');
  const ed = new Editor(c5.start());
  const typeAll = (texts) => {
    ed.clearSelection();
    for (const t of texts) { ed.selectNext(1); ed.startEdit(); ed.endEdit(t); }
  };
  typeAll(['プロジェクト報告', '2026年度']);
  ed.newSlide(); typeAll(['目的', '売上を伸ばす']);
  ed.newSlide(); typeAll(['まとめ', '次回に続く']);
  assert.equal(scorePresentation(ed.pres, c5.target()).score, 100);

  const c8 = CHALLENGES.find((c) => c.id === 'c8-agenda');
  const e8 = new Editor(c8.start());
  const type8 = (texts) => { e8.clearSelection(); for (const t of texts) { e8.selectNext(1); e8.startEdit(); e8.endEdit(t); } };
  type8(['社内勉強会', 'ショートカット編']);
  e8.newSlide();
  e8.clearSelection(); e8.selectNext(1); e8.startEdit(); e8.endEdit('アジェンダ'); e8.toggleFont('bold');
  e8.selectNext(1); e8.deleteSelection();
  const labels = ['基本操作', '図形', 'スライド'];
  const modes = ['left', 'center', 'right'];
  for (let i = 0; i < 3; i++) {
    e8.insertObject('roundRect');
    e8.setDimension('w', 240); e8.setDimension('h', 120);
    e8.startEdit(); e8.endEdit(labels[i]);
    e8.setFont('size', 24);
    e8.align(modes[i]); e8.align('middle');
  }
  const r = scorePresentation(e8.pres, c8.target());
  assert.equal(r.score, 100, r.checks.filter((c) => !c.ok).map((c) => c.message).join('\n'));
});

test('KeyTips / ショートカットのアクションは課題に必要な操作を網羅', () => {
  const actions = new Set(keyTipPaths().map((p) => p.action));
  for (const a of ['input:width', 'input:height', 'palette:fill', 'palette:fontColor', 'gallery:shapes', 'insertTextBox', 'arrangeAlign', 'rotateBy', 'reorder', 'group']) {
    assert.ok(actions.has(a), a);
  }
});

test('図形ギャラリーの種類と表示名', () => {
  assert.ok(SHAPE_TYPES.includes('rect'));
  assert.equal(createSlide('blank').objects.length, 0);
});

test('パレット: 7 行 × 10 列、明暗の計算', () => {
  const g = paletteGrid();
  assert.equal(g.length, 7);
  assert.ok(g.every((r) => r.length === 10));
  assert.equal(adjust('#000000', 0.5), '#808080');
  assert.equal(adjust('#FF0000', -0.5), '#800000');
  assert.equal(colorName('#ff0000'), '赤');
  assert.equal(colorName(null), 'なし');
  assert.ok(sameColor(null, null));
  assert.ok(!sameColor('#FFFFFF', null));
});

test('画像の類似度', () => {
  const white = new Uint8ClampedArray(16).fill(255);
  const black = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  assert.equal(imageSimilarity(white, white), 100);
  assert.equal(imageSimilarity(black, black), 100);
  assert.equal(imageSimilarity(white, black), 0);
  const half = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  assert.equal(imageSimilarity(half, black), 50);
  assert.throws(() => imageSimilarity(white, new Uint8ClampedArray(8)));
});

test('文字のない図形では文字をチェックしない、文字を入れすぎたら NG', () => {
  const t = pres([createObject('rect')]);
  const r = scorePresentation(pres([createObject('rect')]), t);
  assert.ok(!r.checks.some((c) => c.message.includes('文字')));
  const r2 = scorePresentation(pres([createObject('rect', { text: 'x' })]), t);
  assert.ok(r2.checks.some((c) => !c.ok && c.message.includes('文字が違います')));
});
