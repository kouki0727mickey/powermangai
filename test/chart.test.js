import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceScale, formatTick, chartLayout, defaultChartData, checkChart, seriesColor, CHART_KINDS } from '../src/core/chart.js';
import { approxMeasure } from '../src/core/textlayout.js';
import { Editor } from '../src/core/editor.js';
import { createPresentation, normalizePresentation } from '../src/core/model.js';
import { exportPptx, buildPptxFiles, colLetter } from '../src/core/pptx-write.js';
import { importPptx } from '../src/core/pptx-read.js';
import { readZip } from '../src/core/zip.js';

test('軸の目盛（Excel と同じく上端に余裕を持たせる）', () => {
  assert.deepEqual(niceScale(0, 5), { min: 0, max: 6, step: 1 });
  assert.deepEqual(niceScale(2, 4.5), { min: 0, max: 5, step: 1 });
  assert.deepEqual(niceScale(2, 4.5, 11), { min: 0, max: 5, step: 0.5 });
  assert.deepEqual(niceScale(-3, 8), { min: -4, max: 10, step: 2 });
  assert.deepEqual(niceScale(0, 0), { min: 0, max: 1.2, step: 0.2 });
  assert.equal(formatTick(0.5, 0.5), '0.5');
  assert.equal(formatTick(4, 2), '4');
});

test('グラフのレイアウト: 縦棒の高さは値に比例、横棒は下から分類 1', () => {
  const c = defaultChartData('column');
  const rects = chartLayout(c, 600, 400, approxMeasure).items.filter((i) => i.t === 'rect' && i.w < 100 && i.h > 7);
  assert.equal(rects.length, 12);
  const [a, b] = [rects[0], rects[4]]; // 系列 1 の分類 1（4.3）と系列 2 の分類 1（2.4）
  assert.ok(Math.abs(a.h / b.h - 4.3 / 2.4) < 0.01);
  assert.equal(Math.round(a.y + a.h), Math.round(b.y + b.h), '同じ基準線から伸びる');
  const bar = chartLayout({ ...c, kind: 'bar', showLegend: false }, 600, 400, approxMeasure).items.filter((i) => i.t === 'rect');
  assert.ok(bar[0].y > bar[3].y, '分類 1 が一番下');
  // 積み上げは同じ位置に重なる
  const st = chartLayout({ ...c, kind: 'stackedColumn', showLegend: false }, 600, 400, approxMeasure).items.filter((i) => i.t === 'rect');
  assert.equal(st[0].x, st[4].x);
  assert.ok(Math.abs(st[4].y + st[4].h - st[0].y) < 0.01);
});

test('円グラフは 1 つ目の系列を 12 時から時計回り、空欄の折れ線は途切れる', () => {
  const c = defaultChartData('pie');
  const w = chartLayout(c, 400, 400, approxMeasure).items.filter((i) => i.t === 'wedge');
  assert.equal(w.length, 4);
  assert.ok(Math.abs(w[0].a0 + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(w[3].a1 - Math.PI * 1.5) < 1e-9);
  const line = { ...defaultChartData('line'), series: [{ name: 's', values: [1, null, 3, 4] }] };
  const lines = chartLayout(line, 400, 300, approxMeasure).items.filter((i) => i.t === 'line' && i.width > 1);
  assert.deepEqual(lines.map((l) => l.pts.length), [2]);
});

test('検証: 不正なデータは null、値は分類の数にそろえる', () => {
  assert.equal(checkChart({ kind: 'radar', categories: ['a'], series: [{ values: [1] }] }), null);
  const c = checkChart({ kind: 'line', categories: ['a', 'b'], series: [{ name: 1, values: ['3', 'x', 9] }], palette: 'zzz' });
  assert.deepEqual(c.series, [{ name: '1', values: [3, null] }]);
  assert.equal(c.palette, 'colorful');
  assert.equal(seriesColor('colorful', 7), '@accent2:-0.4');
  assert.equal(colLetter(0), 'A');
  assert.equal(colLetter(26), 'AA');
});

test('エディター: グラフの挿入・設定の変更・元に戻す・保存形式の往復', () => {
  const e = new Editor(createPresentation());
  const o = e.insertChart('pie');
  assert.equal(e.selectedChart(), o);
  assert.equal(e.setChart({ kind: 'doughnut', dataLabels: true }), true);
  assert.equal(e.selectedChart().chart.kind, 'doughnut');
  e.undo();
  assert.equal(e.selectedChart().chart.kind, 'pie');
  assert.equal(e.setChart({ kind: 'nope' }), false);
  const again = normalizePresentation(JSON.parse(JSON.stringify(e.pres)));
  assert.deepEqual(again.slides[0].objects.at(-1).chart, e.selectedChart().chart);
  assert.equal(e.changeShape('rect'), false, 'グラフは図形の変更の対象外');
});

test('.pptx: すべての種類のグラフの往復と、埋め込みワークシート', async () => {
  const e = new Editor(createPresentation());
  for (const k of CHART_KINDS) {
    if (e.pres.slides.length > 1 || e.slide.objects.some((o) => o.type === 'chart')) e.newSlide('blank');
    e.insertChart(k.id);
    if (k.id === 'column') e.setChart({ dataLabels: true, showLegend: false, gridlines: false, series: [{ name: 'A&B', values: [1, null, -2, 3.5] }] });
    if (k.id === 'line') e.setChart({ showTitle: false });
  }
  const bytes = await exportPptx(e.pres);
  const files = await readZip(bytes);
  const xlsx = await readZip(files['ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx']);
  const sheet = new TextDecoder().decode(xlsx['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /<c r="B1" t="inlineStr"><is><t>A&amp;B<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="B5"><v>3.5<\/v><\/c>/);
  assert.doesNotMatch(sheet, /r="B3"/, '空欄は書き出さない');
  const ct = new TextDecoder().decode(files['[Content_Types].xml']);
  assert.match(ct, /Extension="xlsx"/);
  assert.match(ct, /\/ppt\/charts\/chart9\.xml/);
  const { pres, warnings } = await importPptx(bytes);
  assert.deepEqual(warnings, []);
  const charts = pres.slides.flatMap((s) => s.objects.filter((o) => o.type === 'chart'));
  const src = e.pres.slides.flatMap((s) => s.objects.filter((o) => o.type === 'chart'));
  assert.equal(charts.length, CHART_KINDS.length);
  charts.forEach((c, i) => {
    const want = { ...src[i].chart };
    if (want.kind === 'pie' || want.kind === 'doughnut') want.series = want.series.slice(0, 1);
    assert.deepEqual(c.chart, want, want.kind);
    assert.deepEqual([c.x, c.y, c.w, c.h], [src[i].x, src[i].y, src[i].w, src[i].h]);
  });
  // buildPptxFiles は入れ子の ZIP を { zip } で返す
  assert.ok(buildPptxFiles(e.pres)['ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx'].zip['xl/workbook.xml']);
});
