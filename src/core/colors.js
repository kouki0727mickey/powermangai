// PowerPoint（Office テーマ）と同じ並びのカラー パレット

export const THEME_COLORS = [
  { hex: '#FFFFFF', name: '白' },
  { hex: '#000000', name: '黒' },
  { hex: '#E7E6E6', name: '灰色' },
  { hex: '#44546A', name: '青灰色' },
  { hex: '#4472C4', name: '青' },
  { hex: '#ED7D31', name: 'オレンジ' },
  { hex: '#A5A5A5', name: '灰色' },
  { hex: '#FFC000', name: 'ゴールド' },
  { hex: '#5B9BD5', name: '青' },
  { hex: '#70AD47', name: '緑' },
];

export const STANDARD_COLORS = [
  { hex: '#C00000', name: '濃い赤' },
  { hex: '#FF0000', name: '赤' },
  { hex: '#FFC000', name: 'オレンジ' },
  { hex: '#FFFF00', name: '黄' },
  { hex: '#92D050', name: '薄い緑' },
  { hex: '#00B050', name: '緑' },
  { hex: '#00B0F0', name: '薄い青' },
  { hex: '#0070C0', name: '青' },
  { hex: '#002060', name: '濃い青' },
  { hex: '#7030A0', name: '紫' },
];

function toHex(n) {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0').toUpperCase();
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** t > 0 で明るく（白に近づける）、t < 0 で暗く */
export function adjust(hex, t) {
  const c = rgb(hex).map((v) => (t >= 0 ? v + (255 - v) * t : v * (1 + t)));
  return `#${c.map(toHex).join('')}`;
}

const VARIANTS = [
  { t: 0.8, label: '白 + 基本色 80%' },
  { t: 0.6, label: '白 + 基本色 60%' },
  { t: 0.4, label: '白 + 基本色 40%' },
  { t: -0.25, label: '黒 + 基本色 25%' },
  { t: -0.5, label: '黒 + 基本色 50%' },
];

/** パレットの行列（[行][列]）。最終行は「標準の色」 */
export function paletteGrid() {
  const rows = [THEME_COLORS.map((c) => ({ ...c }))];
  for (const v of VARIANTS) {
    rows.push(THEME_COLORS.map((c) => ({ hex: adjust(c.hex, v.t), name: `${c.name}、${v.label}` })));
  }
  rows.push(STANDARD_COLORS.map((c) => ({ ...c })));
  return rows;
}

export function colorName(hex) {
  if (!hex) return 'なし';
  const up = hex.toUpperCase();
  for (const row of paletteGrid()) {
    const c = row.find((x) => x.hex === up);
    if (c) return c.name;
  }
  return up;
}

export function sameColor(a, b) {
  if (!a || !b) return !a && !b;
  return a.toUpperCase() === b.toUpperCase();
}
