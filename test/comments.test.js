import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Editor } from '../src/core/editor.js';
import { createPresentation, normalizePresentation, commentAnchor } from '../src/core/model.js';
import { exportPptx, buildPptxFiles } from '../src/core/pptx-write.js';
import { importPptx } from '../src/core/pptx-read.js';
import { writeZip } from '../src/core/zip.js';

const hasSoffice = spawnSync('soffice', ['--version']).status === 0;
const D = '2026-01-02T03:04:05.000Z';

function sample() {
  const e = new Editor(createPresentation());
  e.setSelection([e.slide.objects[0].id]);
  const a = e.addComment('タイトル & <短く>\n2 行目', 'Taro Yamada', D);
  e.replyComment(a.id, '了解です', '花子', D);
  e.setSelection([]);
  e.addComment('全体の色', '花子', D);
  e.newSlide('blank');
  e.addComment('図を追加', 'Taro Yamada', D);
  return { e, a };
}

test('コメントの追加・返信・編集・解決・削除と元に戻す', () => {
  const { e, a } = sample();
  const s0 = e.pres.slides[0];
  assert.equal(s0.comments.length, 2);
  assert.equal(a.target, s0.objects[0].id, '選択中の図形に付く');
  // 図形を動かすとマーカーも付いていく
  const before = commentAnchor(s0, a, e.size);
  e.gotoSlide(0);
  e.setSelection([s0.objects[0].id]);
  e.move(30, 20);
  const after = commentAnchor(e.pres.slides[0], e.pres.slides[0].comments[0], e.size);
  assert.deepEqual([after.x - before.x, after.y - before.y], [30, 20]);
  assert.equal(e.editComment(a.id, '短く'), true);
  assert.equal(e.toggleCommentResolved(a.id), true);
  const replyId = e.pres.slides[0].comments[0].replies[0].id;
  e.deleteComment(a.id, replyId);
  assert.deepEqual(e.pres.slides[0].comments[0].replies, []);
  e.undo();
  assert.equal(e.pres.slides[0].comments[0].replies.length, 1);
  assert.equal(e.deleteAllComments(true), true);
  assert.deepEqual(e.pres.slides.map((s) => s.comments.length), [0, 0]);
});

test('次 / 前のコメントはスライドをまたいで循環する', () => {
  const { e } = sample();
  const ids = e.pres.slides.flatMap((s) => s.comments.map((c) => c.id));
  e.gotoSlide(1);
  assert.equal(e.adjacentComment(1).id, ids[2], '現在のスライドのコメントから');
  assert.equal(e.adjacentComment(1, ids[2]).id, ids[0], '最後の次は最初');
  assert.equal(e.adjacentComment(-1, ids[0]).id, ids[2]);
});

test('スライドの複製ではコメントも複製され、付けた図形も付け替わる', () => {
  const { e } = sample();
  e.gotoSlide(0);
  e.duplicateSlide();
  const [a, b] = [e.pres.slides[0], e.pres.slides[1]];
  assert.equal(b.comments.length, 2);
  assert.notEqual(b.comments[0].id, a.comments[0].id);
  assert.equal(b.comments[0].target, b.objects[0].id);
  assert.notEqual(b.comments[0].replies[0].id, a.comments[0].replies[0].id);
});

test('保存形式の検証（不正な値の補正、存在しない図形への参照は外す）', () => {
  const { e } = sample();
  const data = JSON.parse(JSON.stringify(e.pres));
  data.slides[0].comments.push({ text: 5, x: 'a', y: 99999, target: 'nope', date: 'x', replies: [null, { text: 'r' }] });
  const p = normalizePresentation(data);
  const c = p.slides[0].comments[2];
  assert.deepEqual([c.text, c.x, c.y, c.target, c.date, c.replies.length], ['', 0, 540, undefined, new Date(0).toISOString(), 1]);
  assert.equal(p.slides[0].comments[0].target, p.slides[0].objects[0].id);
});

test('.pptx: 従来の形式のコメント（作成者・返信・位置）の往復', async () => {
  const { e } = sample();
  const files = buildPptxFiles(e.pres);
  assert.match(files['ppt/commentAuthors.xml'], /<p:cmAuthor id="0" name="Taro Yamada" initials="TY" lastIdx="2" clrIdx="0"\/>/);
  assert.match(files['ppt/comments/comment1.xml'], /<p:text>タイトル &amp; &lt;短く&gt;\n2 行目<\/p:text>/);
  assert.match(files['ppt/comments/comment1.xml'], /<p15:parentCm authorId="0" idx="1"\/>/);
  const { pres } = await importPptx(await exportPptx(e.pres));
  const simple = pres.slides.map((s) => s.comments.map((c) => [c.author, c.text, c.date, c.replies.map((r) => `${r.author}:${r.text}`)]));
  assert.deepEqual(simple, [
    [['Taro Yamada', 'タイトル & <短く>\n2 行目', D, ['花子:了解です']], ['花子', '全体の色', D, []]],
    [['Taro Yamada', '図を追加', D, []]],
  ]);
  const src = commentAnchor(e.pres.slides[0], e.pres.slides[0].comments[0], e.size);
  assert.deepEqual([pres.slides[0].comments[0].x, pres.slides[0].comments[0].y], [src.x, src.y]);
});

test('.pptx: 新しい形式（Microsoft 365）のコメントを読み込める', async () => {
  const files = buildPptxFiles(createPresentation());
  const M = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main';
  files['ppt/authors.xml'] = `<?xml version="1.0"?><p188:authorLst xmlns:p188="${M}"><p188:author id="{A1}" name="Ken" initials="K" userId="k"/></p188:authorLst>`;
  files['ppt/comments/modernComment_1.xml'] = `<?xml version="1.0"?><p188:cmLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p188="${M}">
    <p188:cm id="{C1}" authorId="{A1}" created="2026-03-04T05:06:07.000" status="resolved"><p188:pos x="1270000" y="635000"/>
      <p188:replyLst><p188:reply id="{R1}" authorId="{A1}" created="2026-03-05T00:00:00.000"><p188:txBody><a:bodyPr/><a:p><a:r><a:t>返信</a:t></a:r></a:p></p188:txBody></p188:reply></p188:replyLst>
      <p188:txBody><a:bodyPr/><a:p><a:r><a:t>1 行目</a:t></a:r></a:p><a:p><a:r><a:t>2 行目</a:t></a:r></a:p></p188:txBody></p188:cm></p188:cmLst>`;
  files['ppt/slides/_rels/slide1.xml.rels'] = files['ppt/slides/_rels/slide1.xml.rels'].replace('</Relationships>', '<Relationship Id="rId99" Type="http://schemas.microsoft.com/office/2018/10/relationships/comments" Target="../comments/modernComment_1.xml"/></Relationships>');
  files['ppt/_rels/presentation.xml.rels'] = files['ppt/_rels/presentation.xml.rels'].replace('</Relationships>', '<Relationship Id="rId98" Type="http://schemas.microsoft.com/office/2018/10/relationships/authors" Target="authors.xml"/></Relationships>');
  const { pres } = await importPptx(await writeZip(files));
  const [c] = pres.slides[0].comments;
  assert.deepEqual([c.author, c.text, c.resolved, c.x, c.y, c.replies.map((r) => r.text)], ['Ken', '1 行目\n2 行目', true, 100, 50, ['返信']]);
});

test('LibreOffice で開いて保存し直してもコメントが残る', { skip: !hasSoffice, timeout: 180000 }, async () => {
  const { e } = sample();
  const dir = mkdtempSync(path.join(tmpdir(), 'pmgcm-'));
  const src = path.join(dir, 'src.pptx');
  writeFileSync(src, await exportPptx(e.pres));
  const r = spawnSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'pptx:Impress MS PowerPoint 2007 XML', '--outdir', path.join(dir, 'lo'), src], { timeout: 170000 });
  assert.equal(r.status, 0, r.stderr?.toString());
  const { pres } = await importPptx(readFileSync(path.join(dir, 'lo', 'src.pptx')));
  const texts = pres.slides.map((s) => s.comments.map((c) => c.text));
  assert.ok(texts[0].includes('全体の色'), JSON.stringify(texts));
  assert.ok(texts[1].includes('図を追加'), JSON.stringify(texts));
  const c = pres.slides[0].comments.find((x) => x.text === '全体の色');
  assert.equal(c.author, '花子');
  // LibreOffice は & や < をエスケープせずに書き出す（それでも読み込める）
  assert.ok(texts[0].includes('タイトル & <短く>\n2 行目'), JSON.stringify(texts));
});
