import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '../src/core/editor.js';
import { createPresentation } from '../src/core/model.js';
import { plainText } from '../src/core/richtext.js';
import {
  outlineLines, setLineText, splitLine, demoteLine, promoteLine, joinWithPrevious, moveLine, titleOf, bodyOf, SOFT_BREAK,
} from '../src/core/outline.js';

/** 「タイトル」+ 箇条書きのスライドを作る */
function deck() {
  const e = new Editor(createPresentation());
  const p = e.pres;
  const [t0] = p.slides[0].objects;
  e.setText(t0.id, '年間計画');
  e.newSlide('titleContent');
  const [t1, b1] = e.slide.objects;
  e.setText(t1.id, '目標');
  e.setText(b1.id, '売上\n利益\n新規顧客');
  e.slide.objects[1].paragraphs[1].level = 1;
  return e;
}
const view = (pres) => outlineLines(pres).map((l) => `${l.slideIndex}:${l.kind === 'title' ? 'T' : `B${l.level}`}:${l.text}`);
const ref = (pres, i) => { const l = outlineLines(pres)[i]; return { slideId: l.slideId, kind: l.kind, para: l.para }; };

test('行の一覧（タイトルと本文、空の本文は出さない）', () => {
  const e = deck();
  assert.deepEqual(view(e.pres), ['0:T:年間計画', '1:T:目標', '1:B0:売上', '1:B1:利益', '1:B0:新規顧客']);
});

test('文字の変更は変えていない部分の書式を保つ', () => {
  const e = deck();
  const b = bodyOf(e.pres.slides[1]);
  b.paragraphs[0].runs = [{ text: '売', font: { ...b.paragraphs[0].runs[0].font, bold: true } }, { text: '上', font: { ...b.paragraphs[0].runs[0].font } }];
  e.outlineEdit((p) => (setLineText(p, ref(p, 2), '売上高') ? ref(p, 2) : null));
  assert.deepEqual(b.paragraphs[0].runs.map((r) => [r.text, r.font.bold]), [['売', true], ['上高', false]]);
  // 段落内の改行は ↵ で表示・入力
  setLineText(e.pres, ref(e.pres, 1), `目${SOFT_BREAK}標`);
  assert.equal(plainText(titleOf(e.pres.slides[1]).paragraphs), '目\n標');
  assert.equal(outlineLines(e.pres)[1].text, `目${SOFT_BREAK}標`);
  // タイトルの無いスライドに入力するとタイトルのプレースホルダーを作る
  e.newSlide('blank');
  setLineText(e.pres, ref(e.pres, 5), '新しい');
  assert.equal(plainText(titleOf(e.pres.slides[2]).paragraphs), '新しい');
});

test('Enter: タイトルなら新しいスライド（カーソルより後ろが新しいタイトル）、本文なら段落を分ける', () => {
  const e = deck();
  const r = e.outlineEdit((p) => splitLine(p, ref(p, 0), 2)); // 年間|計画
  assert.deepEqual(view(e.pres).slice(0, 3), ['0:T:年間', '1:T:計画', '2:T:目標']);
  assert.equal(e.slideIndex, 1);
  assert.equal(r.kind, 'title');
  e.outlineEdit((p) => splitLine(p, ref(p, 3), 1)); // 売|上
  assert.deepEqual(view(e.pres).slice(3, 5), ['2:B0:売', '2:B0:上']);
  e.undo();
  assert.deepEqual(view(e.pres).slice(3, 5), ['2:B0:売上', '2:B1:利益']);
});

test('Tab / Shift+Tab: 本文のレベル、タイトル ↔ 本文でスライドの結合・分割', () => {
  const e = deck();
  // 本文レベル 0 の「新規顧客」を Shift+Tab → 新しいスライドのタイトル
  e.outlineEdit((p) => promoteLine(p, ref(p, 4)));
  assert.deepEqual(view(e.pres), ['0:T:年間計画', '1:T:目標', '1:B0:売上', '1:B1:利益', '2:T:新規顧客']);
  // 「売上」を Shift+Tab: 下の「利益」（レベル 1）はレベル 0 で新しいスライドへ
  e.outlineEdit((p) => promoteLine(p, ref(p, 2)));
  assert.deepEqual(view(e.pres), ['0:T:年間計画', '1:T:目標', '2:T:売上', '2:B0:利益', '3:T:新規顧客']);
  // 「売上」のタイトルを Tab → 前のスライドの本文に戻る（本文はレベル +1）
  const r = e.outlineEdit((p) => demoteLine(p, ref(p, 2)));
  assert.deepEqual(view(e.pres), ['0:T:年間計画', '1:T:目標', '1:B0:売上', '1:B1:利益', '2:T:新規顧客']);
  assert.equal(r.kind, 'body');
  // 本文に戻ったタイトルは本文の文字の大きさになる
  const b = bodyOf(e.pres.slides[1]);
  assert.equal(b.paragraphs[0].runs[0].font.size, b.paragraphs[1].runs[0].font.size);
  // 最初のスライドのタイトルは下げられない
  assert.ok(demoteLine(e.pres, ref(e.pres, 0)).error);
});

test('図形などがあるスライドは結合しない', () => {
  const e = deck();
  e.gotoSlide(1);
  e.insertObject('rect');
  const before = view(e.pres);
  const r = e.outlineEdit((p) => demoteLine(p, ref(p, 1)));
  assert.ok(r.error);
  assert.deepEqual(view(e.pres), before);
});

test('Backspace（行の先頭）: 段落の結合、本文の最初の段落はタイトルへ、空のスライドは削除', () => {
  const e = deck();
  e.outlineEdit((p) => joinWithPrevious(p, ref(p, 3)).ref); // 利益 → 売上利益
  assert.deepEqual(view(e.pres).slice(1), ['1:T:目標', '1:B0:売上利益', '1:B0:新規顧客']);
  const r = joinWithPrevious(e.pres, ref(e.pres, 2)); // 本文の最初 → タイトルの後ろ
  assert.deepEqual(view(e.pres).slice(1), ['1:T:目標売上利益', '1:B0:新規顧客']);
  assert.equal(r.caret, 2);
  // 空のスライドは削除され、前のスライドの最後の行へ
  e.outlineEdit((p) => splitLine(p, ref(p, 1), '目標売上利益'.length)); // タイトルの末尾で Enter → 空のスライド
  const lines = outlineLines(e.pres);
  const empty = lines.findIndex((l) => l.kind === 'title' && l.text === '');
  const j = joinWithPrevious(e.pres, ref(e.pres, empty));
  assert.equal(e.pres.slides.length, 2);
  assert.deepEqual(j.ref, { slideId: e.pres.slides[1].id, kind: 'body', para: 0 });
});

test('Alt+Shift+↑↓: 本文の段落の入れ替え、タイトルはスライドの移動', () => {
  const e = deck();
  const r = moveLine(e.pres, ref(e.pres, 4), -1);
  assert.deepEqual(view(e.pres).slice(2), ['1:B0:売上', '1:B0:新規顧客', '1:B1:利益']);
  assert.equal(r.para, 1);
  assert.equal(moveLine(e.pres, ref(e.pres, 2), -1), null, '本文の先頭より上へは動かない');
  moveLine(e.pres, ref(e.pres, 1), -1);
  assert.deepEqual(view(e.pres).map((x) => x.split(':').slice(0, 1).join() + x.split(':').slice(2).join()), ['0目標', '0売上', '0新規顧客', '0利益', '1年間計画']);
});

test('複数の段落のタイトルに本文をつなぐと、カーソルはつないだ位置', () => {
  const e = deck();
  const t = titleOf(e.pres.slides[1]);
  t.paragraphs = [t.paragraphs[0], { ...t.paragraphs[0], runs: [{ text: 'B', font: { ...t.paragraphs[0].runs[0].font } }] }];
  const r = joinWithPrevious(e.pres, ref(e.pres, 2));
  assert.equal(outlineLines(e.pres)[1].text, `目標${SOFT_BREAK}B売上`);
  assert.equal(r.caret, `目標${SOFT_BREAK}B`.length);
});

test('ノートの変更をはさんだ入力は、アウトラインの入力とまとめない', () => {
  const e = deck();
  const r = ref(e.pres, 1);
  e.outlineEdit((p) => (setLineText(p, r, '目標1') ? r : null), 'k');
  e.beginNotes(); e.previewNotes('メモ'); e.endNotes();
  e.outlineEdit((p) => (setLineText(p, r, '目標12') ? r : null), 'k');
  e.undo();
  assert.equal(e.pres.slides[1].notes, 'メモ', 'ノートは残る');
  assert.equal(outlineLines(e.pres)[1].text, '目標1');
});

test('タイトルの先頭で Enter: 前に空のスライド（本文はこのスライドのまま）', () => {
  const e = deck();
  const r = e.outlineEdit((p) => splitLine(p, ref(p, 1), 0));
  assert.deepEqual(view(e.pres), ['0:T:年間計画', '1:T:', '2:T:目標', '2:B0:売上', '2:B1:利益', '2:B0:新規顧客']);
  assert.equal(r.slideId, e.pres.slides[2].id);
  assert.equal(e.slideIndex, 2);
});

test('アウトラインのスライドの移動もセクションを守る', () => {
  const e = deck();
  e.newSlide('titleContent'); e.newSlide('titleContent');
  const ids = e.pres.slides.map((s) => s.id);
  e.gotoSlide(2); e.addSection('B'); // A=[0,1] B=[2,3]
  moveLine(e.pres, { slideId: ids[2], kind: 'title', para: 0 }, -1);
  assert.deepEqual(e.pres.slides.map((s) => s.id), ids, '境目では並びを変えずに前のセクションへ');
  assert.deepEqual(e.pres.sections.map((s) => s.slideIds.length), [3, 1]);
});

test('履歴が上限でもアウトラインの続けての入力は 1 回にまとまる', () => {
  const e = deck();
  for (let i = 0; i < 210; i++) e.move(0, 0) || e.newSlide('blank');
  const r = ref(e.pres, 1);
  const before = e.undoStack.length;
  e.outlineEdit((p) => (setLineText(p, r, '目標A') ? r : null), 'k');
  e.outlineEdit((p) => (setLineText(p, r, '目標AB') ? r : null), 'k');
  e.outlineEdit((p) => (setLineText(p, r, '目標ABC') ? r : null), 'k');
  assert.equal(e.undoStack.length, Math.min(200, before + 1));
  e.undo();
  assert.equal(outlineLines(e.pres)[1].text, '目標');
});
