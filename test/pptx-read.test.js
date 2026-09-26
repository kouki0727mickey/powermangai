import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exportPptx } from '../src/core/pptx-write.js';
import { importPptx } from '../src/core/pptx-read.js';
import { objText, objFont, allParas } from '../src/core/model.js';
import { resolveColor, themeOf } from '../src/core/colors.js';
import { samplePresentation, RED_PNG } from './fixtures/sample-pres.js';

const hasPythonPptx = spawnSync('python3', ['-c', 'import pptx']).status === 0;
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

test('書き出して読み込むと主な内容が保たれる（往復）', async () => {
  const { pres: src } = samplePresentation();
  const { pres, warnings } = await importPptx(await exportPptx(src));
  assert.deepEqual(warnings, []);
  assert.deepEqual([pres.width, pres.height, pres.theme], [960, 540, 'office']);
  assert.equal(pres.slides.length, 3);
  const [s1, s2, s3] = pres.slides;
  // スライド 1: タイトル スライド・ノート
  assert.equal(s1.layout, 'title');
  assert.deepEqual(s1.objects.map((o) => [o.ph, objText(o)]), [['ctrTitle', '四半期の報告'], ['subTitle', '営業部 & <チーム>']]);
  assert.equal(objFont(s1.objects[0]).size, 54);
  assert.equal(objFont(s1.objects[0]).family, '+major');
  assert.equal(s1.notes, '最初に挨拶する\n2 行目');
  // スライド 2: 箇条書き・部分書式・図形
  assert.equal(s2.layout, 'titleContent');
  const body = s2.objects.find((o) => o.ph === 'body');
  assert.equal(objText(body), '4月は好調\n5月は横ばい');
  assert.deepEqual(body.paragraphs.map((p) => [p.bullet, p.level, p.lineSpacing]), [['bullet', 0, 1.5], ['bullet', 1, 1]]);
  assert.deepEqual(body.paragraphs[0].runs.map((r) => [r.text, r.font.bold, r.font.size, r.font.color]), [['4月', true, 32, '#FF0000'], ['は好調', false, 24, '@tx1']]);
  const srcShape = src.slides[1].objects.find((o) => o.type === 'roundRect');
  const rr = s2.objects.find((o) => o.type === 'roundRect');
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(near(rr[k], srcShape[k]), `${k}: ${rr[k]} vs ${srcShape[k]}`);
  assert.deepEqual([rr.rotation, rr.flipH, rr.shadow, rr.fill, rr.opacity], [15, true, true, '@accent2:0.4', 0.8]);
  assert.equal(objText(rr), '図形の文字');
  assert.equal(objFont(rr).color, '@bg1');
  const arrow = s2.objects.find((o) => o.type === 'arrow');
  assert.deepEqual([arrow.stroke, arrow.strokeWidth, arrow.dash], ['@accent6', 3, 'dash']);
  assert.ok(s2.objects.some((o) => o.type === 'star'));
  assert.deepEqual(s2.transition, { type: 'push', duration: 0.75, direction: 'fromLeft' });
  const byId = (id) => s2.objects.find((o) => o.id === id);
  assert.deepEqual(s2.animations.map((a) => [a.effect, a.trigger, a.duration, a.direction, byId(a.target)?.type]), [
    ['fade', 'click', 0.5, undefined, 'roundRect'], ['flyIn', 'after', 1, 'fromLeft', 'text'], ['wipe', 'click', 0.5, 'fromTop', 'text'], ['zoom', 'with', 0.5, undefined, 'star'],
  ]);
  // スライド 3: 表・画像・グループ・背景・非表示・フッター
  const table = s3.objects.find((o) => o.type === 'table');
  assert.equal(table.cells.length, 2);
  assert.equal(objText({ type: 'text', paragraphs: table.cells[0][0].paragraphs }), '項目');
  assert.equal(table.cells[1][1].fill, '#FFFF00');
  assert.equal(table.headerRow, true);
  const img = s3.objects.find((o) => o.type === 'image');
  assert.equal(img.src, RED_PNG);
  const grouped = s3.objects.filter((o) => o.groupId);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].groupId, grouped[1].groupId);
  assert.ok(near(grouped[1].x, 100));
  assert.equal(s3.background, '@accent1:0.8');
  assert.equal(s3.hidden, true);
  assert.deepEqual([pres.headerFooter.slideNumber, pres.headerFooter.footer, pres.headerFooter.showFooter], [true, '社外秘', true]);
  assert.ok(!s3.objects.some((o) => o.ph && !['title', 'ctrTitle', 'subTitle', 'body'].includes(o.ph)), 'フッターのプレースホルダーは図形にしない');
});

test('独自のテーマ・4:3 のスライドの往復', async () => {
  const { pres: src } = samplePresentation();
  src.width = 720;
  src.theme = 'custom';
  src.customTheme = { id: 'custom', name: 'マイテーマ', colors: { ...themeOf({ theme: 'blue' }).colors, accent1: '#123456' }, fonts: { major: 'Meiryo', minor: 'Arial' } };
  const { pres } = await importPptx(await exportPptx(src));
  assert.equal(pres.width, 720);
  assert.equal(pres.theme, 'custom');
  assert.equal(pres.customTheme.colors.accent1, '#123456');
  assert.deepEqual(pres.customTheme.fonts, { major: 'Meiryo', minor: 'Arial' });
  assert.equal(resolveColor('@accent1', themeOf(pres)), '#123456');
});

test('python-pptx で作ったファイルを読み込める（継承した位置・書式、図形、表、画像、グループ、ノート）', { skip: !hasPythonPptx }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pmgread-'));
  const file = path.join(dir, 'py.pptx');
  const png = path.join(dir, 'r.png');
  execFileSync('python3', ['-c', `import base64;open('${png}','wb').write(base64.b64decode('${RED_PNG.split(',')[1]}'))`]);
  execFileSync('python3', ['-c', `
from pptx import Presentation
from pptx.util import Pt, Emu, Inches
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.dml import MSO_THEME_COLOR
p = Presentation()
s = p.slides.add_slide(p.slide_layouts[0])
s.shapes.title.text = 'Hello'
s.placeholders[1].text = 'sub'
s.notes_slide.notes_text_frame.text = 'note!'
s2 = p.slides.add_slide(p.slide_layouts[1])
s2.shapes.title.text = 'Agenda'
tf = s2.placeholders[1].text_frame
tf.text = 'first'
para = tf.add_paragraph(); para.text = 'second'; para.level = 1
r = para.runs[0]; r.font.bold = True; r.font.color.rgb = RGBColor(0x11, 0x22, 0x33); r.font.size = Pt(40)
sh = s2.shapes.add_shape(MSO_SHAPE.OVAL, Inches(1), Inches(1), Inches(2), Inches(1))
sh.text = 'oval'
sh.fill.solid(); sh.fill.fore_color.theme_color = MSO_THEME_COLOR.ACCENT_2; sh.fill.fore_color.brightness = 0.4
sh.rotation = 30
tb = s2.shapes.add_textbox(Inches(5), Inches(5), Inches(3), Inches(1)); tb.text_frame.text = 'textbox'
s3 = p.slides.add_slide(p.slide_layouts[6])
t = s3.shapes.add_table(2, 2, Inches(1), Inches(1), Inches(4), Inches(1)).table
t.cell(0, 0).text = 'H'; t.cell(1, 1).text = 'v'
s3.shapes.add_picture('${png}', Inches(6), Inches(1), Inches(1), Inches(1))
g = s3.shapes.add_group_shape()
g.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(4), Inches(1), Inches(1))
g.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(2), Inches(4), Inches(1), Inches(1))
p.save('${file}')
`]);
  const { pres, warnings } = await importPptx(readFileSync(file));
  assert.deepEqual([pres.width, pres.height], [720, 540]);
  assert.equal(pres.slides.length, 3);
  const [s1, s2, s3] = pres.slides;
  const title = s1.objects.find((o) => o.ph === 'ctrTitle');
  assert.equal(objText(title), 'Hello');
  assert.ok(title.w > 400 && title.x > 0, '位置はレイアウトから継承');
  assert.equal(objFont(title).size, 44, '大きさはマスターのタイトルのスタイルから');
  assert.equal(s1.notes, 'note!');
  const body = s2.objects.find((o) => o.ph === 'body');
  assert.deepEqual(body.paragraphs.map((p) => [p.runs.map((r) => r.text).join(''), p.level, p.bullet]), [['first', 0, 'bullet'], ['second', 1, 'bullet']]);
  assert.deepEqual([body.paragraphs[1].runs[0].font.bold, body.paragraphs[1].runs[0].font.color, body.paragraphs[1].runs[0].font.size], [true, '#112233', 40]);
  assert.equal(body.paragraphs[0].runs[0].font.size, 32, '本文のレベル 1 はマスターの 32pt');
  const oval = s2.objects.find((o) => o.type === 'ellipse');
  const tb = s2.objects.find((o) => objText(o) === 'textbox');
  assert.deepEqual([objText(oval), oval.rotation, oval.fill], ['oval', 30, '@accent2:0.4']);
  assert.ok(near(oval.x, 72) && near(oval.w, 144));
  assert.equal(objFont(oval).color, '@bg1', '図形の文字の色はスタイル（fontRef）から');
  assert.equal(oval.stroke, '@accent1', '枠線の色はスタイル（lnRef）から');
  assert.equal(oval.shadow, true, 'このテンプレートのテーマの効果 2 には影がある');
  assert.equal(tb.shadow, false);
  assert.equal(tb.type, 'text');
  const table = s3.objects.find((o) => o.type === 'table');
  assert.deepEqual(table.cells.map((row) => row.map((c) => objText({ type: 'text', paragraphs: c.paragraphs }))), [['H', ''], ['', 'v']]);
  assert.ok(s3.objects.some((o) => o.type === 'image'));
  const g = s3.objects.filter((o) => o.groupId);
  assert.equal(g.length, 2);
  assert.ok(near(g[1].x, 144), `${g[1].x}`);
  assert.deepEqual(warnings, []);
  assert.ok(allParas(body).length === 2);
});

test('PowerPoint 以外のファイルはエラー', async () => {
  const { writeZip } = await import('../src/core/zip.js');
  await assert.rejects(importPptx(await writeZip({ 'a.txt': 'x' })), /PowerPoint/);
});

const hasSoffice = spawnSync('which', ['soffice']).status === 0;
test('LibreOffice が保存し直した .pptx を読み込める', { skip: !hasSoffice, timeout: 180000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pmglo-'));
  const src = path.join(dir, 'src.pptx');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(src, await exportPptx(samplePresentation().pres));
  const out = path.join(dir, 'lo');
  const r = spawnSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'pptx:Impress MS PowerPoint 2007 XML', '--outdir', out, src], { timeout: 170000 });
  assert.equal(r.status, 0, r.stderr?.toString());
  const { pres, warnings } = await importPptx(readFileSync(path.join(out, 'src.pptx')));
  assert.equal(pres.slides.length, 3);
  const texts = pres.slides.map((s) => s.objects.map((o) => (o.type === 'table' ? 'TABLE' : o.type === 'image' ? 'IMAGE' : objText(o))).filter(Boolean));
  assert.ok(texts[0].includes('四半期の報告'), JSON.stringify(texts[0]));
  assert.ok(texts[1].includes('4月は好調\n5月は横ばい'), JSON.stringify(texts[1]));
  assert.ok(texts[1].includes('図形の文字'));
  assert.ok(texts[2].includes('TABLE') && texts[2].includes('IMAGE'), JSON.stringify(texts[2]));
  assert.equal(pres.slides[0].notes, '最初に挨拶する\n2 行目');
  const body = pres.slides[1].objects.find((o) => objText(o) === '4月は好調\n5月は横ばい');
  assert.equal(body.paragraphs[0].runs[0].font.bold, true);
  assert.equal(body.paragraphs[1].level, 1);
  // LibreOffice がアニメーションを読み取って保存し直しても、効果とタイミングが残る
  assert.deepEqual(pres.slides[1].animations.map((a) => [a.effect, a.trigger]), [['fade', 'click'], ['flyIn', 'after'], ['wipe', 'click'], ['zoom', 'with']]);
  console.log('LibreOffice 版の警告:', warnings);
});
