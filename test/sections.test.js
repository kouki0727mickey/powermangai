import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '../src/core/editor.js';
import { createPresentation, normalizePresentation } from '../src/core/model.js';
import { exportPptx, buildPptxFiles } from '../src/core/pptx-write.js';
import { importPptx } from '../src/core/pptx-read.js';

/** スライド 5 枚（s0〜s4）のエディター */
function five() {
  const e = new Editor(createPresentation());
  for (let i = 0; i < 4; i++) e.newSlide('blank');
  e.pres.slides.forEach((sl, i) => { sl.id = `s${i}`; });
  return e;
}
const layout = (e) => e.pres.sections.map((sec) => `${sec.name}:${sec.slideIds.join(',')}`);
const order = (e) => e.pres.slides.map((sl) => sl.id).join(',');

test('セクションの追加: 途中に追加すると前のスライドは「既定のセクション」', () => {
  const e = five();
  e.gotoSlide(2);
  e.addSection('後半');
  assert.deepEqual(layout(e), ['既定のセクション:s0,s1', '後半:s2,s3,s4']);
  e.gotoSlide(3);
  e.addSection('まとめ');
  assert.deepEqual(layout(e), ['既定のセクション:s0,s1', '後半:s2', 'まとめ:s3,s4']);
  assert.equal(e.currentSectionIndex(), 2);
  e.undo();
  assert.deepEqual(layout(e), ['既定のセクション:s0,s1', '後半:s2,s3,s4']);
});

test('新しいスライド・複製・削除はセクションに合わせて入る / 抜ける', () => {
  const e = five();
  e.gotoSlide(2);
  e.addSection('B');
  e.gotoSlide(1);
  e.newSlide('blank');
  const added = e.slide.id;
  assert.deepEqual(e.pres.sections[0].slideIds, ['s0', 's1', added]);
  e.gotoSlide(0);
  e.deleteSlide();
  assert.deepEqual(e.pres.sections[0].slideIds, ['s1', added]);
  // セクションのスライドがすべて無くなっても、空のセクションとして残る
  e.gotoSlide(0); e.deleteSlide(); e.deleteSlide();
  assert.deepEqual(layout(e), ['既定のセクション:', 'B:s2,s3,s4']);
});

test('Ctrl+↑↓ でセクションの境目を越えると、順は変えずに隣のセクションへ', () => {
  const e = five();
  e.gotoSlide(2);
  e.addSection('B');
  e.gotoSlide(2);
  e.moveSlide(-1);
  assert.equal(order(e), 's0,s1,s2,s3,s4');
  assert.deepEqual(layout(e), ['既定のセクション:s0,s1,s2', 'B:s3,s4']);
  e.moveSlide(-1); // 同じセクション内では入れ替え
  assert.equal(order(e), 's0,s2,s1,s3,s4');
  e.gotoSlide(2); // s1（前のセクションの最後）
  e.moveSlide(1);
  assert.equal(order(e), 's0,s2,s1,s3,s4');
  assert.deepEqual(layout(e), ['既定のセクション:s0,s2', 'B:s1,s3,s4']);
});

test('セクションの移動・削除・名前の変更・すべて選択', () => {
  const e = five();
  e.gotoSlide(0); e.addSection('A');
  e.gotoSlide(2); e.addSection('B');
  e.gotoSlide(4); e.addSection('C');
  assert.deepEqual(layout(e), ['A:s0,s1', 'B:s2,s3', 'C:s4']);
  e.gotoSlide(2);
  assert.equal(e.moveSection(-1), true);
  assert.equal(order(e), 's2,s3,s0,s1,s4');
  assert.equal(e.slide.id, 's2', '現在のスライドは同じ');
  assert.equal(e.moveSection(-1), false, '先頭より上へは移動できない');
  e.renameSection('はじめ');
  assert.equal(e.pres.sections[0].name, 'はじめ');
  e.selectSection();
  assert.deepEqual(e.selectedSlideIndexes(), [0, 1]);
  // セクションだけ削除: スライドは前（先頭なら次）のセクションへ
  e.gotoSlide(0);
  e.removeSection(false);
  assert.deepEqual(layout(e), ['A:s2,s3,s0,s1', 'C:s4']);
  // セクションとスライドを削除
  e.gotoSlide(4);
  e.removeSection(true);
  assert.equal(order(e), 's2,s3,s0,s1');
  assert.deepEqual(layout(e), ['A:s2,s3,s0,s1']);
  assert.equal(e.removeSection(true), false, 'すべてのスライドは削除できない');
  e.removeAllSections();
  assert.deepEqual(e.pres.sections, []);
});

test('保存形式の検証: 不明なスライドは除き、抜けたスライドを補う', () => {
  const e = five();
  const data = JSON.parse(JSON.stringify(e.pres));
  data.sections = [{ id: 'x', name: 'A', slideIds: ['s0', 'zzz'] }, { name: 5, slideIds: ['s3'] }];
  const p = normalizePresentation(data);
  assert.deepEqual(p.sections.map((s) => [s.name, s.slideIds.join(',')]), [['A', 's0,s1,s2'], ['', 's3,s4']]);
});

test('.pptx: セクションの往復（p14:sectionLst）', async () => {
  const e = five();
  e.gotoSlide(1); e.addSection('本題 & 詳細');
  e.gotoSlide(4); e.addSection('');
  const xml = buildPptxFiles(e.pres)['ppt/presentation.xml'];
  assert.match(xml, /<p14:section name="既定のセクション" id="\{[0-9A-F-]+\}"><p14:sldIdLst><p14:sldId id="256"\/><\/p14:sldIdLst><\/p14:section>/);
  assert.match(xml, /name="本題 &amp; 詳細"/);
  const { pres } = await importPptx(await exportPptx(e.pres));
  const idx = new Map(pres.slides.map((sl, i) => [sl.id, i]));
  assert.deepEqual(pres.sections.map((s) => [s.name, s.slideIds.map((id) => idx.get(id))]), [['既定のセクション', [0]], ['本題 & 詳細', [1, 2, 3]], ['', [4]]]);
});

test('セクションをまたいで複数のスライドを動かしても、動かしていないスライドのセクションは変わらない', () => {
  const e = five();
  e.gotoSlide(2); e.addSection('B');
  // s1, s2（セクションの境目をまたぐ選択）を上へ
  e.gotoSlide(1);
  e.extendSlideSelection(1);
  e.moveSlide(-1);
  assert.equal(order(e), 's1,s2,s0,s3,s4');
  assert.ok(e.pres.sections[0].slideIds.includes('s0'), 's0 は既定のセクションのまま');
  assert.deepEqual(e.pres.sections[1].slideIds, ['s3', 's4']);
});

test('同じセクションの中で上へ動かしたスライドは、そのセクションのまま', () => {
  const e = five();
  e.gotoSlide(1); e.addSection('B'); // A=[s0] B=[s1,s2,s3,s4]
  e.gotoSlide(2);
  e.moveSlide(-1);
  assert.equal(order(e), 's0,s2,s1,s3,s4');
  assert.deepEqual(layout(e), ['既定のセクション:s0', 'B:s2,s1,s3,s4']);
});
