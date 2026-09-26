// 色とテーマ。色は '#RRGGBB'（固定色）か '@キー' / '@キー:明るさ'（テーマの色）で表す。
//   例: '@accent1'、'@accent1:0.8'（80% 明るく）、'@tx1:-0.25'（25% 暗く）
// 明るさの計算は PowerPoint と同じ HSL の輝度変調（lumMod / lumOff）。

export const THEME_KEYS = ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
const KEY_ALIAS = { lt1: 'bg1', dk1: 'tx1', lt2: 'bg2', dk2: 'tx2' };
export const THEME_KEY_NAMES = {
  bg1: '白、背景 1', tx1: '黒、テキスト 1', bg2: '背景 2', tx2: 'テキスト 2',
  accent1: 'アクセント 1', accent2: 'アクセント 2', accent3: 'アクセント 3',
  accent4: 'アクセント 4', accent5: 'アクセント 5', accent6: 'アクセント 6', hlink: 'ハイパーリンク', folHlink: '表示済みのハイパーリンク',
};

const theme = (id, name, c, major, minor) => ({
  id, name,
  colors: {
    tx1: c[0], bg1: c[1], tx2: c[2], bg2: c[3],
    accent1: c[4], accent2: c[5], accent3: c[6], accent4: c[7], accent5: c[8], accent6: c[9], hlink: c[10], folHlink: c[11],
  },
  fonts: { major, minor },
});

export const THEMES = [
  theme('office', 'Office テーマ', ['#000000', '#FFFFFF', '#44546A', '#E7E6E6', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#0563C1', '#954F72'], 'Yu Gothic Light', 'Yu Gothic'),
  theme('office2023', 'Office 2023', ['#000000', '#FFFFFF', '#0E2841', '#E8E8E8', '#156082', '#E97132', '#196B24', '#0F9ED5', '#A02B93', '#4EA72E', '#467886', '#96607D'], 'Aptos Display', 'Aptos'),
  theme('blue', 'ブルー', ['#000000', '#FFFFFF', '#17406D', '#DBEFF9', '#0F6FC6', '#009DD9', '#0BD0D9', '#10CF9B', '#7CCA62', '#A5C249', '#F49100', '#85DFD0'], 'Meiryo', 'Meiryo'),
  theme('green', 'グリーン', ['#000000', '#FFFFFF', '#455F51', '#E3DED1', '#549E39', '#8AB833', '#C0CF3A', '#029676', '#4AB5C4', '#0989B1', '#6B9F25', '#BA6906'], 'BIZ UDPGothic', 'BIZ UDPGothic'),
  theme('orange', 'オレンジ', ['#000000', '#FFFFFF', '#637052', '#CCDDEA', '#E48312', '#BD582C', '#865640', '#9B8357', '#C2BC80', '#94A088', '#2998E3', '#8C8C8C'], 'Yu Mincho', 'Yu Gothic'),
  theme('violet', 'バイオレット', ['#000000', '#FFFFFF', '#373545', '#DCD8DC', '#AD84C6', '#8784C7', '#5D739A', '#6997AF', '#84ACB6', '#6F8183', '#69A020', '#8C8C8C'], 'Yu Gothic UI', 'Yu Gothic UI'),
  theme('gray', 'グレースケール', ['#000000', '#FFFFFF', '#000000', '#F8F8F8', '#DDDDDD', '#B2B2B2', '#969696', '#808080', '#5F5F5F', '#4D4D4D', '#5F5F5F', '#919191'], 'Yu Gothic', 'Yu Gothic'),
];

export const DEFAULT_THEME = THEMES[0];

export function findTheme(id) {
  return THEMES.find((t) => t.id === id) || DEFAULT_THEME;
}

/** プレゼンテーションのテーマ（.pptx から読み込んだ独自のテーマにも対応） */
export function themeOf(pres) {
  if (pres && pres.theme === 'custom' && pres.customTheme) return pres.customTheme;
  return findTheme(pres && pres.theme);
}

/** 独自のテーマの検証（不正なら null） */
export function checkCustomTheme(t) {
  if (!t || typeof t !== 'object' || !t.colors || !t.fonts) return null;
  const colors = {};
  for (const k of [...Object.keys(DEFAULT_THEME.colors)]) {
    const c = t.colors[k];
    colors[k] = typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : DEFAULT_THEME.colors[k];
  }
  const font = (f, d) => (typeof f === 'string' && f ? f.slice(0, 100) : d);
  return {
    id: 'custom',
    name: typeof t.name === 'string' ? t.name.slice(0, 100) : '読み込んだテーマ',
    colors,
    fonts: { major: font(t.fonts.major, DEFAULT_THEME.fonts.major), minor: font(t.fonts.minor, DEFAULT_THEME.fonts.minor) },
  };
}

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

// ---- RGB / HSL
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** 明るさの変更。t > 0: lumMod=1-t, lumOff=t（明るく）／ t < 0: lumMod=1+t（暗く） */
export function adjust(hex, t) {
  if (!t) return hex.toUpperCase();
  const [h, s, l] = rgbToHsl(rgb(hex));
  const nl = t > 0 ? l * (1 - t) + t : l * (1 + t);
  return toHex(hslToRgb([h, s, Math.max(0, Math.min(1, nl))]));
}

export function luminance(hex) {
  return rgbToHsl(rgb(hex))[2];
}

export function isColorValue(c) {
  if (typeof c !== 'string') return false;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return true;
  const m = /^@([a-zA-Z0-9]+)(?::(-?\d*\.?\d+))?$/.exec(c);
  if (!m) return false;
  const key = KEY_ALIAS[m[1]] || m[1];
  if (!(key in DEFAULT_THEME.colors)) return false;
  return m[2] === undefined || Math.abs(Number(m[2])) <= 1;
}

/** 色の値を '#RRGGBB' に解決。null はそのまま（なし） */
export function resolveColor(c, th = DEFAULT_THEME) {
  if (c == null) return null;
  if (c[0] === '#') return c.toUpperCase();
  const m = /^@([a-zA-Z0-9]+)(?::(-?\d*\.?\d+))?$/.exec(c);
  if (!m) return '#000000';
  const key = KEY_ALIAS[m[1]] || m[1];
  const base = th.colors[key] || DEFAULT_THEME.colors[key] || '#000000';
  return adjust(base, m[2] ? Number(m[2]) : 0);
}

/** テーマのフォント参照（+major / +minor）を解決 */
export function resolveFontFamily(family, th = DEFAULT_THEME) {
  if (family === '+major') return th.fonts.major;
  if (family === '+minor') return th.fonts.minor;
  return family;
}

/** パレットの各列の明るさの段階（PowerPoint と同じく、色の明暗によって変わる） */
function variantSteps(hex) {
  const l = luminance(hex);
  if (l > 0.95) return [-0.05, -0.15, -0.25, -0.35, -0.5];
  if (l < 0.05) return [0.5, 0.35, 0.25, 0.15, 0.05];
  if (l < 0.2) return [0.9, 0.75, 0.5, -0.25, -0.5];
  if (l > 0.8) return [-0.1, -0.25, -0.5, -0.75, -0.9];
  return [0.8, 0.6, 0.4, -0.25, -0.5];
}

function stepLabel(t) {
  return t > 0 ? `白 + 基本色 ${Math.round((1 - t) * 100)}%` : `黒 + 基本色 ${Math.round((1 + t) * 100)}%`;
}

/**
 * パレットの行列（[行][列]）。各要素 { value, hex, name }。
 * 1 行目: テーマの色、2〜6 行目: 明るさの段階、7 行目: 標準の色
 */
export function paletteGrid(th = DEFAULT_THEME) {
  const rows = [THEME_KEYS.map((k) => ({ value: `@${k}`, hex: resolveColor(`@${k}`, th), name: THEME_KEY_NAMES[k] }))];
  for (let i = 0; i < 5; i++) {
    rows.push(THEME_KEYS.map((k) => {
      const t = variantSteps(th.colors[k])[i];
      const value = `@${k}:${t}`;
      return { value, hex: resolveColor(value, th), name: `${THEME_KEY_NAMES[k]}、${stepLabel(t)}` };
    }));
  }
  rows.push(STANDARD_COLORS.map((c) => ({ value: c.hex, hex: c.hex, name: c.name })));
  return rows;
}

export function colorName(c, th = DEFAULT_THEME) {
  if (!c) return 'なし';
  for (const row of paletteGrid(th)) {
    const e = row.find((x) => x.value === c);
    if (e) return e.name;
  }
  const hex = resolveColor(c, th);
  for (const row of paletteGrid(th)) {
    const e = row.find((x) => x.hex === hex);
    if (e) return e.name;
  }
  return hex;
}

/** 見た目の色が同じか（テーマ参照は解決して比較） */
export function sameColor(a, b, th = DEFAULT_THEME) {
  if (!a || !b) return !a && !b;
  return resolveColor(a, th) === resolveColor(b, th);
}
