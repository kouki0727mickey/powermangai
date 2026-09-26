// グラフ（縦棒・横棒・折れ線・面・円・ドーナツ）のデータとレイアウト。
// レイアウトは描画に依存しない図形の一覧（display list）を返し、render.js が Canvas に描く。

export const CHART_KINDS = [
  { id: 'column', label: '集合縦棒' },
  { id: 'stackedColumn', label: '積み上げ縦棒' },
  { id: 'bar', label: '集合横棒' },
  { id: 'stackedBar', label: '積み上げ横棒' },
  { id: 'line', label: '折れ線' },
  { id: 'lineMarkers', label: 'マーカー付き折れ線' },
  { id: 'area', label: '面' },
  { id: 'pie', label: '円' },
  { id: 'doughnut', label: 'ドーナツ' },
];
const KIND_IDS = new Set(CHART_KINDS.map((k) => k.id));

export const CHART_PALETTES = [
  { id: 'colorful', label: 'カラフル' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `mono${n}`, label: `モノクロ（アクセント ${n}）` })),
];
const PALETTE_IDS = new Set(CHART_PALETTES.map((p) => p.id));

export const isPieKind = (kind) => kind === 'pie' || kind === 'doughnut';
export const isBarKind = (kind) => kind === 'bar' || kind === 'stackedBar';
export const isStacked = (kind) => kind === 'stackedColumn' || kind === 'stackedBar';

export const MAX_CATEGORIES = 1000;
export const MAX_SERIES = 255;
const DOUGHNUT_HOLE = 0.5;

/** 新しいグラフの既定のデータ（PowerPoint と同じ値） */
export function defaultChartData(kind = 'column') {
  const pie = isPieKind(kind);
  return {
    kind,
    categories: pie ? ['第 1 四半期', '第 2 四半期', '第 3 四半期', '第 4 四半期'] : ['分類 1', '分類 2', '分類 3', '分類 4'],
    series: pie
      ? [{ name: '売上高', values: [8.2, 3.2, 1.4, 1.2] }]
      : [
        { name: '系列 1', values: [4.3, 2.5, 3.5, 4.5] },
        { name: '系列 2', values: [2.4, 4.4, 1.8, 2.8] },
        { name: '系列 3', values: [2, 2, 3, 5] },
      ],
    title: pie ? '売上高' : 'グラフ タイトル',
    showTitle: true,
    showLegend: true,
    dataLabels: false,
    gridlines: true,
    palette: 'colorful',
  };
}

/** タイトルの既定の文字（系列が 1 つなら系列名。PowerPoint と同じ） */
export function defaultChartTitle(chart) {
  return chart.series.length === 1 && chart.series[0].name ? chart.series[0].name : 'グラフ タイトル';
}

/** 系列（円グラフでは項目）の i 番目の色 */
export function seriesColor(palette, i) {
  if (palette && palette.startsWith('mono')) {
    const n = Number(palette.slice(4)) || 1;
    const t = [0, -0.25, 0.4, -0.5, 0.6, 0.8][i % 6];
    return t ? `@accent${n}:${t}` : `@accent${n}`;
  }
  const round = Math.floor(i / 6);
  const t = [0, -0.4, 0.4, -0.6, 0.6][round % 5];
  return t ? `@accent${(i % 6) + 1}:${t}` : `@accent${(i % 6) + 1}`;
}

/** 数値（null は空欄）。文字列の数値も受け付ける */
export function toValue(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,，\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** 読み込んだデータを検証して整える（不正なら null） */
export function checkChart(c) {
  if (!c || typeof c !== 'object' || !KIND_IDS.has(c.kind)) return null;
  if (!Array.isArray(c.categories) || !Array.isArray(c.series) || c.series.length === 0) return null;
  const categories = c.categories.slice(0, MAX_CATEGORIES).map((s) => String(s ?? ''));
  if (categories.length === 0) return null;
  const series = c.series.slice(0, MAX_SERIES).map((s) => ({
    name: String(s?.name ?? ''),
    values: categories.map((_, i) => toValue(Array.isArray(s?.values) ? s.values[i] : null)),
  }));
  return {
    kind: c.kind,
    categories,
    series,
    title: typeof c.title === 'string' ? c.title.slice(0, 500) : '',
    showTitle: c.showTitle !== false,
    showLegend: c.showLegend !== false,
    dataLabels: c.dataLabels === true,
    gridlines: c.gridlines !== false,
    palette: PALETTE_IDS.has(c.palette) ? c.palette : 'colorful',
  };
}

// ---------------------------------------------------------------- 目盛
/** 軸の範囲と目盛の間隔（Excel と同じく 1・2・5 × 10^n の間隔で、上端に少し余裕を持たせる） */
export function niceScale(dataMin, dataMax, maxTicks = 8) {
  let min = Math.min(0, dataMin), max = Math.max(0, dataMax);
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (max === min) max = min + 1;
  // 上下に 1/20 の余裕
  const span = max - min;
  const hi = max > 0 ? max + span / 20 : max;
  const lo = min < 0 ? min - span / 20 : min;
  const raw = (hi - lo) / Math.max(2, maxTicks - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw * 0.999) || 10 * mag;
  const axisMin = lo < 0 ? Math.floor(lo / step - 1e-9) * step : 0;
  const axisMax = hi > 0 ? Math.ceil(hi / step - 1e-9) * step : 0;
  return { min: fix(axisMin), max: fix(axisMax === axisMin ? axisMin + step : axisMax), step };
}

const fix = (v) => Math.round(v * 1e9) / 1e9;

/** 目盛の数値の表示（間隔に合わせた小数の桁） */
export function formatTick(v, step) {
  const dec = Math.max(0, Math.min(10, -Math.floor(Math.log10(step) + 1e-9)));
  return fix(v).toFixed(dec);
}

/** データ ラベルの数値の表示 */
export function formatValue(v) {
  return String(Math.round(v * 1e10) / 1e10);
}

// ---------------------------------------------------------------- レイアウト
const AXIS_COLOR = '@tx1:0.35';
const GRID_COLOR = '@tx1:0.85';
const TEXT_SIZE = 12;
const TITLE_SIZE = 18.6;

/**
 * グラフを w × h の領域に配置し、描画する図形の一覧を返す。
 * measure(font, text) は文字の幅。font は { family, size }。
 * 図形: { t: 'rect', x, y, w, h, fill } / { t: 'line', pts: [[x, y], ...], color, width }
 *      { t: 'poly', pts, fill } / { t: 'wedge', cx, cy, r, r0, a0, a1, fill, stroke }
 *      { t: 'marker', x, y, size, fill } / { t: 'text', x, y, text, size, color, align: 'left'|'center'|'right', baseline: 'top'|'middle'|'bottom' }
 */
export function chartLayout(chart, w, h, measure) {
  const items = [];
  const font = (size) => ({ family: '+minor', size });
  const textW = (text, size = TEXT_SIZE) => measure(font(size), text);
  const pad = 9;
  let top = pad, bottom = h - pad;
  const left = pad, right = w - pad;

  // タイトル
  if (chart.showTitle && chart.title) {
    items.push({ t: 'text', x: w / 2, y: top, text: chart.title, size: TITLE_SIZE, color: AXIS_COLOR, align: 'center', baseline: 'top' });
    top += TITLE_SIZE * 1.3 + 6;
  }
  // 凡例（下）
  const pie = isPieKind(chart.kind);
  const legendNames = pie ? chart.categories : chart.series.map((s) => s.name);
  if (chart.showLegend && legendNames.length) {
    const sw = 7, gap = 4, itemGap = 12, lineH = TEXT_SIZE * 1.4;
    const entries = legendNames.map((name, i) => ({ name, i, w: sw + gap + textW(name) }));
    const rows = [];
    let row = [], rowW = 0;
    for (const e of entries) {
      if (row.length && rowW + itemGap + e.w > right - left) { rows.push({ row, rowW }); row = []; rowW = 0; }
      rowW += (row.length ? itemGap : 0) + e.w;
      row.push(e);
    }
    if (row.length) rows.push({ row, rowW });
    const shown = rows.slice(0, 3); // 3 行まで（それ以上は省略）
    bottom -= shown.length * lineH;
    shown.forEach(({ row: r, rowW: rw }, ri) => {
      let x = (w - rw) / 2;
      const cy = bottom + ri * lineH + lineH / 2;
      for (const e of r) {
        items.push({ t: 'rect', x, y: cy - sw / 2, w: sw, h: sw, fill: seriesColor(chart.palette, e.i) });
        items.push({ t: 'text', x: x + sw + gap, y: cy, text: e.name, size: TEXT_SIZE, color: AXIS_COLOR, align: 'left', baseline: 'middle' });
        x += e.w + itemGap;
      }
    });
    bottom -= 6;
  }
  const plot = { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
  if (pie) layoutPie(chart, plot, items);
  else layoutAxes(chart, plot, items, textW);
  return { items, plot };
}

function layoutPie(chart, plot, items) {
  const s = chart.series[0];
  const vals = s.values.map((v) => (v && v > 0 ? v : 0));
  const total = vals.reduce((a, b) => a + b, 0);
  const r = Math.max(1, Math.min(plot.w, plot.h) / 2 - 4);
  const cx = plot.x + plot.w / 2, cy = plot.y + plot.h / 2;
  const r0 = chart.kind === 'doughnut' ? r * DOUGHNUT_HOLE : 0;
  if (total <= 0) return;
  let a = -Math.PI / 2;
  vals.forEach((v, i) => {
    if (!v) return;
    const a1 = a + (v / total) * Math.PI * 2;
    items.push({ t: 'wedge', cx, cy, r, r0, a0: a, a1, fill: seriesColor(chart.palette, i), stroke: '@bg1' });
    if (chart.dataLabels) {
      const mid = (a + a1) / 2, rr = r0 ? (r + r0) / 2 : r * 0.65;
      items.push({ t: 'text', x: cx + Math.cos(mid) * rr, y: cy + Math.sin(mid) * rr, text: formatValue(s.values[i]), size: TEXT_SIZE, color: '@bg1', align: 'center', baseline: 'middle' });
    }
    a = a1;
  });
}

function layoutAxes(chart, plot, items, textW) {
  const { kind, categories, series } = chart;
  const nCat = categories.length;
  const horizontal = isBarKind(kind);
  const stacked = isStacked(kind);
  // 値の範囲
  let lo = Infinity, hi = -Infinity;
  if (stacked) {
    for (let c = 0; c < nCat; c++) {
      let pos = 0, neg = 0;
      for (const s of series) { const v = s.values[c]; if (v > 0) pos += v; else if (v < 0) neg += v; }
      lo = Math.min(lo, neg); hi = Math.max(hi, pos);
    }
  } else {
    for (const s of series) for (const v of s.values) if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  if (lo === Infinity) { lo = 0; hi = 1; }
  const scale = niceScale(lo, hi, horizontal ? Math.max(3, Math.floor(plot.w / 60)) : Math.max(3, Math.floor(plot.h / 30)));
  const ticks = [];
  for (let v = scale.min, k = 0; v <= scale.max + scale.step * 1e-6 && k < 200; v = scale.min + scale.step * ++k) ticks.push(fix(v));
  const tickLabels = ticks.map((v) => formatTick(v, scale.step));
  const lineH = TEXT_SIZE * 1.4;

  // 軸の文字の分だけ描画領域を狭める
  let px = plot.x, py = plot.y, pw = plot.w, ph = plot.h;
  if (horizontal) {
    const catW = Math.min(plot.w * 0.4, Math.max(0, ...categories.map((c) => textW(c))) + 8);
    px += catW; pw -= catW; ph -= lineH;
  } else {
    const valW = Math.max(...tickLabels.map((t) => textW(t))) + 8;
    px += valW; pw -= valW; ph -= lineH;
  }
  pw = Math.max(1, pw); ph = Math.max(1, ph);
  const span = scale.max - scale.min;
  // 値 → 座標（縦棒: y、横棒: x）
  const vpos = horizontal ? (v) => px + ((v - scale.min) / span) * pw : (v) => py + ph - ((v - scale.min) / span) * ph;
  const zero = vpos(Math.min(scale.max, Math.max(scale.min, 0)));
  const band = (horizontal ? ph : pw) / Math.max(1, nCat);
  // 分類 c の帯の開始位置（横棒は下から上）
  const bandStart = horizontal ? (c) => py + ph - (c + 1) * band : (c) => px + c * band;

  // 目盛線と値の目盛
  ticks.forEach((v, i) => {
    const p = vpos(v);
    if (chart.gridlines) items.push({ t: 'line', pts: horizontal ? [[p, py], [p, py + ph]] : [[px, p], [px + pw, p]], color: GRID_COLOR, width: 0.75 });
    items.push(horizontal
      ? { t: 'text', x: p, y: py + ph + 4, text: tickLabels[i], size: TEXT_SIZE, color: AXIS_COLOR, align: 'center', baseline: 'top' }
      : { t: 'text', x: px - 6, y: p, text: tickLabels[i], size: TEXT_SIZE, color: AXIS_COLOR, align: 'right', baseline: 'middle' });
  });
  // 分類の文字
  categories.forEach((name, c) => {
    const mid = bandStart(c) + band / 2;
    items.push(horizontal
      ? { t: 'text', x: px - 6, y: mid, text: name, size: TEXT_SIZE, color: AXIS_COLOR, align: 'right', baseline: 'middle' }
      : { t: 'text', x: mid, y: py + ph + 4, text: name, size: TEXT_SIZE, color: AXIS_COLOR, align: 'center', baseline: 'top' });
  });

  const label = (v, x, y, align, baseline, color = AXIS_COLOR) => {
    if (chart.dataLabels && v !== null) items.push({ t: 'text', x, y, text: formatValue(v), size: TEXT_SIZE, color, align, baseline });
  };

  if (kind === 'line' || kind === 'lineMarkers' || kind === 'area') {
    const at = (c) => bandStart(c) + band / 2;
    series.forEach((s, si) => {
      const color = seriesColor(chart.palette, si);
      if (kind === 'area') {
        // 空欄は 0 として面を閉じる
        const pts = s.values.map((v, c) => [at(c), vpos(Math.min(scale.max, Math.max(scale.min, v ?? 0)))]);
        if (pts.length) items.push({ t: 'poly', pts: [[pts[0][0], zero], ...pts, [pts[pts.length - 1][0], zero]], fill: color });
      } else {
        // 空欄で線を切る
        let run = [];
        const flush = () => { if (run.length > 1) items.push({ t: 'line', pts: run, color, width: 2.25 }); run = []; };
        s.values.forEach((v, c) => { if (v === null) flush(); else run.push([at(c), vpos(v)]); });
        flush();
        if (kind === 'lineMarkers') s.values.forEach((v, c) => { if (v !== null) items.push({ t: 'marker', x: at(c), y: vpos(v), size: 5, fill: color }); });
      }
      s.values.forEach((v, c) => { if (v !== null) label(v, at(c), vpos(v) - 4, 'center', 'bottom'); });
    });
  } else {
    const n = series.length;
    // PowerPoint の既定: 集合は間隔 219%・重なり -27%、積み上げは間隔 150%・重なり 100%
    const bw = stacked ? band / 2.5 : band / (2.19 + n + (n - 1) * 0.27);
    const offset = stacked ? (band - bw) / 2 : (band - (n * bw + (n - 1) * 0.27 * bw)) / 2;
    const posAcc = new Array(nCat).fill(0), negAcc = new Array(nCat).fill(0);
    series.forEach((s, si) => {
      const color = seriesColor(chart.palette, si);
      s.values.forEach((v, c) => {
        if (v === null) return;
        let from = 0, to = v;
        if (stacked) {
          if (v >= 0) { from = posAcc[c]; to = posAcc[c] += v; } else { from = negAcc[c]; to = negAcc[c] += v; }
        }
        const clamp = (x) => Math.min(scale.max, Math.max(scale.min, x));
        const a = vpos(clamp(from)), b = vpos(clamp(to));
        const s0 = bandStart(c) + offset + (stacked ? 0 : si * bw * 1.27);
        if (horizontal) {
          // 横棒: 系列 1 が下（軸に近い側）
          const y = bandStart(c) + band - offset - (stacked ? 0 : si * bw * 1.27) - bw;
          items.push({ t: 'rect', x: Math.min(a, b), y, w: Math.abs(b - a), h: bw, fill: color });
          if (stacked) label(v, (a + b) / 2, y + bw / 2, 'center', 'middle', '@bg1');
          else label(v, v >= 0 ? b + 4 : b - 4, y + bw / 2, v >= 0 ? 'left' : 'right', 'middle');
        } else {
          items.push({ t: 'rect', x: s0, y: Math.min(a, b), w: bw, h: Math.abs(b - a), fill: color });
          if (stacked) label(v, s0 + bw / 2, (a + b) / 2, 'center', 'middle', '@bg1');
          else label(v, s0 + bw / 2, v >= 0 ? b - 4 : b + 4, 'center', v >= 0 ? 'bottom' : 'top');
        }
      });
    });
  }
  // 分類の軸の線（値 0 の位置）
  items.push({ t: 'line', pts: horizontal ? [[zero, py], [zero, py + ph]] : [[px, zero], [px + pw, zero]], color: GRID_COLOR, width: 0.75 });
}
