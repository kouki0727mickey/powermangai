import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutParagraphs, layoutObjectText, numberingLabels, approxMeasure, effectiveFont, LEVEL_INDENT, BULLET_HANG } from '../src/core/textlayout.js';
import { fromPlainText, defaultRunFont, applyFont } from '../src/core/richtext.js';
import { resolveColor, adjust, paletteGrid, findTheme, isColorValue, colorName, resolveFontFamily, THEMES } from '../src/core/colors.js';
import { createObject, normalizePresentation, objText, objFont, createSlide, createPresentation, SLIDE_SIZES } from '../src/core/model.js';
import { Editor } from '../src/core/editor.js';

const mono = (font, text) => text.length * font.size * 0.5; // 等幅: 1 文字 = 0.5em
const F = defaultRunFont({ size: 20 });

test('テーマの色の解決と明るさの変更', () => {
  assert.equal(resolveColor('@accent1'), '#4472C4');
  assert.equal(resolveColor('@tx1:0.5'), '#808080');
  assert.equal(resolveColor('@bg1:-0.5'), '#808080');
  assert.equal(resolveColor('#ff0000'), '#FF0000');
  assert.equal(resolveColor(null), null);
  assert.equal(resolveColor('@accent1', findTheme('office2023')), '#156082');
  assert.equal(resolveColor('@dk1'), '#000000', 'dk1 は tx1 の別名');
  assert.ok(isColorValue('@accent6:-0.25'));
  assert.ok(!isColorValue('@nope'));
  assert.ok(!isColorValue('@accent1:2'));
  assert.ok(!isColorValue('red'));
  assert.equal(resolveFontFamily('+major', findTheme('office2023')), 'Aptos Display');
});

test('パレット: 白の列は暗く、黒の列は明るく、他は 80/60/40% 明るく・25/50% 暗く', () => {
  const g = paletteGrid();
  assert.equal(g[0][0].value, '@bg1');
  assert.equal(g[1][0].value, '@bg1:-0.05');
  assert.equal(g[1][1].value, '@tx1:0.5');
  assert.equal(g[1][4].value, '@accent1:0.8');
  assert.equal(g[5][4].value, '@accent1:-0.5');
  assert.equal(g[6][1].value, '#FF0000');
  assert.equal(colorName('@accent1:0.8'), 'アクセント 1、白 + 基本色 20%');
  assert.equal(adjust('#4472C4', 0), '#4472C4');
});

test('テーマを変えると同じ参照の色が変わる', () => {
  for (const th of THEMES) assert.match(resolveColor('@accent2', th), /^#[0-9A-F]{6}$/);
  assert.notEqual(resolveColor('@accent1', THEMES[0]), resolveColor('@accent1', THEMES[2]));
});

test('段落番号は同じレベルで連番、箇条書きでない段落でリセット', () => {
  const ps = fromPlainText('a\nb\nc\nd\ne', F);
  ps[0].bullet = 'number'; ps[1].bullet = 'number';
  ps[2].bullet = 'number'; ps[2].level = 1;
  ps[3].bullet = 'number';
  ps[4].bullet = 'bullet';
  assert.deepEqual(numberingLabels(ps), ['1.', '2.', '1.', '3.', '•']);
  ps[3].bullet = 'none';
  ps[4].bullet = 'number';
  assert.deepEqual(numberingLabels(ps).slice(3), [null, '1.']);
});

test('行頭文字とインデント', () => {
  const ps = fromPlainText('abc\ndef', F);
  ps[0].bullet = 'bullet';
  ps[1].bullet = 'bullet'; ps[1].level = 1;
  const { lines } = layoutParagraphs(ps, 500, mono);
  assert.equal(lines[0].bullet.text, '•');
  assert.equal(lines[0].bullet.x, 0);
  assert.equal(lines[0].segs[0].x, BULLET_HANG);
  assert.equal(lines[1].bullet.text, '–');
  assert.equal(lines[1].segs[0].x, LEVEL_INDENT + BULLET_HANG);
});

test('配置（中央・右・両端）', () => {
  const center = layoutParagraphs(fromPlainText('abcd', F, { align: 'center' }), 100, mono).lines[0];
  assert.equal(center.segs[0].x, (100 - 40) / 2);
  const right = layoutParagraphs(fromPlainText('abcd', F, { align: 'right' }), 100, mono).lines[0];
  assert.equal(right.segs[0].x, 60);
  // 両端揃え: 最終行以外は右端までそろう
  const just = layoutParagraphs(fromPlainText('aa bb cc dd', F, { align: 'justify' }), 70, mono).lines;
  assert.equal(just.length, 2);
  const last = just[0].segs.at(-1);
  assert.equal(Math.round(last.x + last.w), 70);
  assert.equal(just[1].segs[0].x, 0);
});

test('行間と段落内改行', () => {
  const ps = fromPlainText('a\nb', F);
  ps[0].lineSpacing = 2;
  const { lines, height } = layoutParagraphs(ps, 500, mono);
  assert.equal(lines[0].height, 20 * 1.2 * 2);
  assert.equal(lines[1].top, 48);
  assert.equal(height, 48 + 24);
  const soft = layoutParagraphs(fromPlainText('x', F).map((p) => ({ ...p, runs: [{ text: 'a\nb', font: F }] })), 500, mono);
  assert.equal(soft.lines.length, 2);
});

test('文字ごとに違うサイズの行の高さは最大のサイズ', () => {
  const ps = fromPlainText('ab', F);
  applyFont(ps, { p: 0, o: 1 }, { p: 0, o: 2 }, (f) => { f.size = 40; });
  const { lines } = layoutParagraphs(ps, 500, mono);
  assert.equal(lines[0].height, 48);
  assert.equal(lines[0].segs.length, 2);
  assert.equal(lines[0].segs[1].x, 10);
});

test('上付き・下付きは小さく、位置をずらす', () => {
  const sup = effectiveFont({ ...F, baseline: 'super' });
  assert.ok(sup.size < 20);
  assert.ok(sup.dy < 0);
  assert.ok(effectiveFont({ ...F, baseline: 'sub' }).dy > 0);
});

test('図形内の上下配置と余白', () => {
  const o = createObject('rect', { w: 200, h: 100, text: 'a', font: { size: 20 } });
  const mid = layoutObjectText(o, mono);
  assert.equal(Math.round(mid.lines[0].top), Math.round((100 - 24) / 2));
  o.anchor = 'top';
  assert.equal(layoutObjectText(o, mono).lines[0].top, o.inset.t);
  o.anchor = 'bottom';
  assert.equal(layoutObjectText(o, mono).lines[0].top, 100 - o.inset.b - 24);
  o.paragraphs[0].align = 'left';
  assert.equal(layoutObjectText(o, mono).lines[0].segs[0].x, o.inset.l);
});

test('テキスト ボックスは文字量に合わせて高さが変わる（自動調整）', () => {
  const pres = createPresentation();
  pres.slides = [createSlide('blank')];
  const ed = new Editor(pres, { measure: mono });
  const t = ed.insertObject('text');
  const h1 = ed.findObject(t.id).h;
  assert.equal(h1, 28.8);
  ed.setText(t.id, 'a\nb\nc');
  assert.equal(ed.findObject(t.id).h, Math.round((18 * 1.2 * 3 + 7.2) * 10) / 10);
  ed.setSelection([t.id]);
  ed.changeFontSize(1);
  assert.ok(ed.findObject(t.id).h > 60);
  const r = ed.insertObject('rect');
  ed.setText(r.id, 'a\nb\nc\nd\ne\nf');
  assert.equal(ed.findObject(r.id).h, 120, '図形は自動調整しない');
});

test('箇条書き・段落番号・インデントの切り替え（図形選択時）', () => {
  const ed = new Editor(createPresentation());
  const t = ed.insertObject('text', { text: 'a\nb' });
  ed.toggleBullet('bullet');
  assert.ok(ed.findObject(t.id).paragraphs.every((p) => p.bullet === 'bullet'));
  ed.toggleBullet('number');
  assert.ok(ed.findObject(t.id).paragraphs.every((p) => p.bullet === 'number'));
  ed.toggleBullet('number');
  assert.ok(ed.findObject(t.id).paragraphs.every((p) => p.bullet === 'none'));
  ed.changeLevel(1); ed.changeLevel(1);
  assert.equal(ed.findObject(t.id).paragraphs[0].level, 2);
  ed.changeLevel(-5);
  assert.equal(ed.findObject(t.id).paragraphs[0].level, 0);
  ed.toggleBaseline('super');
  assert.equal(objFont(ed.findObject(t.id)).baseline, 'super');
  ed.toggleBaseline('super');
  assert.equal(objFont(ed.findObject(t.id)).baseline, 0);
});

test('大文字小文字の切り替えは文字ごとの書式を保つ', () => {
  const ed = new Editor(createPresentation());
  const t = ed.insertObject('text', { text: 'Ab cd' });
  applyFont(ed.findObject(t.id).paragraphs, { p: 0, o: 0 }, { p: 0, o: 2 }, (f) => { f.bold = true; });
  ed.changeCase();
  const o = ed.findObject(t.id);
  assert.equal(objText(o), 'AB CD');
  assert.deepEqual(o.paragraphs[0].runs.map((r) => [r.text, r.font.bold]), [['AB', true], [' CD', false]]);
});

test('旧形式（version 1）のファイルを読み込める', () => {
  const pres = normalizePresentation({
    version: 1,
    slides: [{ objects: [{ type: 'text', x: 1, y: 2, w: 300, h: 40, text: 'こんにちは\n世界', font: { size: 30, bold: true, color: '#FF0000', family: 'Yu Gothic UI' }, align: 'center' }] }],
  });
  const o = pres.slides[0].objects[0];
  assert.equal(objText(o), 'こんにちは\n世界');
  assert.equal(o.paragraphs.length, 2);
  assert.equal(o.paragraphs[1].align, 'center');
  assert.equal(objFont(o).size, 30);
  assert.equal(objFont(o).family, '+minor');
  assert.equal(pres.theme, 'office');
  assert.equal(o.autoFit, 'none', '旧形式は保存されたサイズを保つ');
  const ph = normalizePresentation({ version: 1, slides: [{ objects: [
    { type: 'text', text: '', placeholder: 'タイトルを入力' }, { type: 'text', text: '', placeholder: 'サブタイトルを入力' }, { type: 'text', text: '', placeholder: 'テキストを入力' },
  ] }] }).slides[0].objects.map((x) => x.ph);
  assert.deepEqual(ph, ['title', 'subTitle', 'body']);
});

test('新形式の検証: 段落・ラン・スライドの属性', () => {
  const base = (o) => ({ slides: [{ objects: [{ type: 'text', ...o }] }] });
  assert.throws(() => normalizePresentation(base({ paragraphs: [] })), /段落/);
  assert.throws(() => normalizePresentation(base({ paragraphs: [{ runs: [{ text: 1, font: defaultRunFont() }] }] })), /文字/);
  assert.throws(() => normalizePresentation(base({ paragraphs: [{ runs: [{ text: 'a', font: { ...defaultRunFont(), color: '@zzz' } }] }] })), /文字の色/);
  const p = normalizePresentation({
    width: 720, height: 540, theme: 'blue',
    slides: [{ background: '@accent1:0.8', notes: 'メモ', hidden: true, objects: [{ type: 'text', paragraphs: [{ level: 99, bullet: 'x', lineSpacing: 99, runs: [{ text: 'a', font: { ...defaultRunFont(), baseline: 'super' } }] }] }] }],
  });
  assert.equal(p.width, 720);
  assert.equal(p.theme, 'blue');
  const s = p.slides[0];
  assert.equal(s.background, '@accent1:0.8');
  assert.equal(s.notes, 'メモ');
  assert.equal(s.hidden, true);
  const para = s.objects[0].paragraphs[0];
  assert.deepEqual([para.level, para.bullet, para.lineSpacing], [8, 'none', 1]);
  assert.equal(para.runs[0].font.baseline, 'super');
  assert.throws(() => normalizePresentation({ slides: [{ background: 'blue', objects: [] }] }), /背景/);
});

test('4:3 のスライドではレイアウトと配置が幅 720 基準', () => {
  const pres = createPresentation(SLIDE_SIZES[1]);
  assert.equal(pres.width, 720);
  assert.ok(pres.slides[0].objects.every((o) => o.x + o.w <= 720));
  const ed = new Editor(pres);
  const r = ed.insertObject('rect');
  assert.equal(ed.findObject(r.id).x, (720 - 160) / 2);
  ed.align('right');
  assert.equal(ed.findObject(r.id).x, 560);
});

test('approxMeasure は全角を 1em、半角を 0.55em で数える', () => {
  assert.equal(approxMeasure({ size: 10 }, 'あa'), 15.5);
});

test('Shift+F3 は絵文字を含む文字でも崩れない', () => {
  const ed = new Editor(createPresentation());
  ed.insertObject('text', { text: 'abc 😀 def' });
  ed.changeCase();
  assert.equal(objText(ed.selectedObjects()[0]), 'Abc 😀 Def');
});

test('編集中の図形の変更は、編集全体と合わせて 1 回の Undo になる', () => {
  const ed = new Editor(createPresentation());
  const t = ed.insertObject('text', { text: 'a' });
  const undoBefore = ed.undoStack.length;
  ed.startEdit();
  ed.previewEdit(fromPlainText('ab', defaultRunFont()));
  ed.setObjectProp('anchor', 'bottom');
  ed.endEdit(fromPlainText('abc', defaultRunFont()));
  assert.equal(ed.undoStack.length, undoBefore + 1);
  ed.undo();
  assert.equal(objText(ed.findObject(t.id)), 'a');
  assert.equal(ed.findObject(t.id).anchor, 'top');
});
