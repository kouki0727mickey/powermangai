// スライド／図形のデータモデル（DOM に依存しない純粋なロジック）
import {
  defaultRunFont, fromPlainText, plainText, normalizeParagraph, ALIGNS, BULLETS, MAX_LEVEL, isLinkUrl,
} from './richtext.js';
import { isColorValue, THEMES, checkCustomTheme } from './colors.js';
import { TRANSITIONS, EFFECTS } from './animation.js';
import { checkChart } from './chart.js';

const TRANSITION_IDS = new Set(TRANSITIONS.map((t) => t.id));
const EFFECT_IDS = new Set(EFFECTS.map((e) => e.id));

export const SLIDE_W = 960; // 16:9（13.333 × 7.5 インチ）を 1pt = 1px で表す
export const SLIDE_H = 540;
export const SLIDE_SIZES = [
  { id: 'wide', label: 'ワイド画面 (16:9)', width: 960, height: 540 },
  { id: 'standard', label: '標準 (4:3)', width: 720, height: 540 },
];

export const SHAPE_TYPES = [
  'rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'parallelogram', 'trapezoid',
  'pentagon', 'hexagon', 'octagon', 'plus', 'donut', 'heart', 'star', 'star4', 'star6',
  'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'chevron', 'homePlate',
  'wedgeRectCallout', 'wedgeEllipseCallout', 'cloud', 'can', 'cube', 'frame', 'smileyFace', 'lightningBolt',
  'line', 'arrow', 'doubleArrow',
];

export const LINE_TYPES = new Set(['line', 'arrow', 'doubleArrow']);

export const SHAPE_LABELS = {
  text: 'テキスト ボックス',
  rect: '正方形/長方形', roundRect: '四角形: 角を丸くする', ellipse: '楕円', triangle: '二等辺三角形',
  rtTriangle: '直角三角形', diamond: 'ひし形', parallelogram: '平行四辺形', trapezoid: '台形',
  pentagon: '五角形', hexagon: '六角形', octagon: '八角形', plus: '十字形', donut: '円: 塗りつぶしなし',
  heart: 'ハート', star: '星: 5 pt', star4: '星: 4 pt', star6: '星: 6 pt',
  rightArrow: '矢印: 右', leftArrow: '矢印: 左', upArrow: '矢印: 上', downArrow: '矢印: 下',
  leftRightArrow: '矢印: 左右', chevron: '矢印: 山形', homePlate: '矢印: 五方向',
  wedgeRectCallout: '吹き出し: 四角形', wedgeEllipseCallout: '吹き出し: 円形', cloud: '雲',
  can: '円柱', cube: '直方体', frame: 'フレーム', smileyFace: 'スマイル', lightningBolt: '稲妻',
  line: '直線', arrow: '線矢印', doubleArrow: '線矢印: 双方向',
  table: '表', image: '図', chart: 'グラフ',
};

export const DASHES = ['solid', 'dash', 'dot', 'dashDot', 'longDash'];
export const ANCHORS = ['top', 'middle', 'bottom'];
export const DEFAULT_INSET = { l: 7.2, t: 3.6, r: 7.2, b: 3.6 };

let idCounter = 0;
export function newId(prefix = 'o') {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function isLine(o) { return LINE_TYPES.has(o.type); }

/** 文字を持てるオブジェクトか（直線・画像・表は図形としての文字を持たない） */
export function hasText(o) {
  return !isLine(o) && o.type !== 'image' && o.type !== 'table' && o.type !== 'chart';
}

/** 図形としての外形を持たないオブジェクト（図・表・グラフ）。図形の変更などの対象外 */
export function isFrame(o) { return o.type === 'image' || o.type === 'table' || o.type === 'chart'; }

function defaultTextFont(type) {
  return defaultRunFont({ color: type === 'text' ? '@tx1' : '@bg1' });
}

/**
 * オブジェクトを作る。props には互換用に text / font / align も指定できる
 * （paragraphs が無ければ、それらから段落を作る）。
 */
export function createObject(type, props = {}) {
  const { text, font, align, bullet, paragraphs, ...rest } = props;
  const isText = type === 'text';
  const line = LINE_TYPES.has(type);
  const base = {
    id: newId('o'),
    type,
    name: '',
    x: 0,
    y: 0,
    w: isText ? 320 : line ? 200 : 160,
    h: isText ? 48 : line ? 0 : 120,
    rotation: 0,
    flipH: false,
    flipV: false,
    fill: isText || line ? null : '@accent1',
    stroke: isText ? null : line ? '@accent1' : '@accent1:-0.25',
    strokeWidth: line ? 1.5 : 1,
    dash: 'solid',
    opacity: 1,
    shadow: false,
    anchor: isText ? 'top' : 'middle',
    autoFit: isText ? 'shape' : 'none',
    wrap: true,
    inset: { ...DEFAULT_INSET },
    groupId: null,
    hidden: false,
  };
  const obj = { ...base, ...rest };
  obj.inset = { ...DEFAULT_INSET, ...(rest.inset || {}) };
  if (paragraphs) {
    obj.paragraphs = clone(paragraphs);
  } else {
    obj.paragraphs = fromPlainText(text ?? '', { ...defaultTextFont(type), ...(font || {}) }, {
      align: align ?? (isText ? 'left' : 'center'),
      bullet: bullet ?? 'none',
    });
  }
  return obj;
}

/** オブジェクト内のすべての段落（表はすべてのセルの段落） */
export function allParas(o) {
  if (o.type === 'table') return o.cells.flatMap((row) => row.flatMap((c) => c.paragraphs));
  return hasText(o) ? o.paragraphs : [];
}

/** 文字の書式を適用できるか（表も含む） */
export function hasTextContent(o) { return hasText(o) || o.type === 'table'; }

// ---- 文字へのアクセス（採点・検索などで使う）
export function objText(o) { return o.paragraphs ? plainText(o.paragraphs) : ''; }
export function objFont(o) { return o.paragraphs[0].runs[0].font; }
export function objAlign(o) { return o.paragraphs[0].align; }

/** プレースホルダー（タイトル・本文など） */
function placeholder(ph, x, y, w, h, prompt, font, paraProps = {}) {
  return createObject('text', {
    x, y, w, h, ph, placeholder: prompt, autoFit: 'none',
    anchor: ph === 'title' || ph === 'ctrTitle' ? 'middle' : 'top',
    name: { title: 'タイトル', ctrTitle: 'タイトル', subTitle: 'サブタイトル', body: 'コンテンツ プレースホルダー' }[ph],
    paragraphs: [{ align: 'left', level: 0, bullet: 'none', lineSpacing: 1, spaceBefore: 0, spaceAfter: 0, ...paraProps, runs: [{ text: '', font: defaultRunFont(font) }] }],
  });
}

export const LAYOUTS = [
  { id: 'title', label: 'タイトル スライド' },
  { id: 'titleContent', label: 'タイトルとコンテンツ' },
  { id: 'sectionHeader', label: 'セクション見出し' },
  { id: 'twoContent', label: '2 つのコンテンツ' },
  { id: 'titleOnly', label: 'タイトルのみ' },
  { id: 'blank', label: '白紙' },
];

export function createSlide(layout = 'blank', size = { width: SLIDE_W, height: SLIDE_H }) {
  const W = size.width, H = size.height;
  const sx = (v) => Math.round((v * W) / SLIDE_W);
  const sy = (v) => Math.round((v * H) / SLIDE_H);
  const slide = { id: newId('s'), layout, objects: [], background: null, notes: '', hidden: false, transition: null, animations: [], advanceAfter: null, comments: [] };
  const title = (y, h) => placeholder('title', sx(60), sy(y), sx(840), sy(h), 'タイトルを入力', { family: '+major', size: 36 });
  const body = (x, w) => placeholder('body', sx(x), sy(130), sx(w), sy(370), 'テキストを入力', { size: 24 }, { bullet: 'bullet' });
  switch (layout) {
    case 'title':
      slide.objects.push(
        placeholder('ctrTitle', sx(120), sy(90), sx(720), sy(190), 'タイトルを入力', { family: '+major', size: 54 }, { align: 'center' }),
        placeholder('subTitle', sx(120), sy(290), sx(720), sy(130), 'サブタイトルを入力', { size: 24 }, { align: 'center' }),
      );
      slide.objects[0].anchor = 'bottom';
      break;
    case 'titleContent':
      slide.objects.push(title(30, 80), body(60, 840));
      break;
    case 'sectionHeader':
      slide.objects.push(
        placeholder('title', sx(66), sy(135), sx(828), sy(225), 'タイトルを入力', { family: '+major', size: 54 }),
        placeholder('body', sx(66), sy(362), sx(828), sy(118), 'テキストを入力', { size: 24, color: '@tx1:0.25' }),
      );
      slide.objects[0].anchor = 'bottom';
      break;
    case 'twoContent':
      slide.objects.push(title(30, 80), body(60, 408), body(492, 408));
      break;
    case 'titleOnly':
      slide.objects.push(title(30, 80));
      break;
    default:
      break;
  }
  return slide;
}

export function createPresentation(size = SLIDE_SIZES[0]) {
  return {
    version: 2,
    width: size.width,
    height: size.height,
    theme: 'office',
    headerFooter: { slideNumber: false, footer: '', showFooter: false, date: false, hideOnTitle: true },
    slides: [createSlide('title', size)],
    sections: [],
  };
}

// ---- セクション: [{ id, name, slideIds }]。slideIds を順につなぐとスライドの順になる（セクションが無ければ空の配列）
export const DEFAULT_SECTION_NAME = '既定のセクション';

/**
 * スライドの追加・削除・並べ替えの後に、セクションの slideIds をスライドの順に合わせる。
 * 新しいスライドは直前のスライドのセクションに入る。セクションの順は変えない（前のセクションに戻るスライドは今のセクションに入る）。
 */
export function syncSections(pres) {
  const secs = pres.sections;
  if (!secs || secs.length === 0) { pres.sections = []; return; }
  const owner = new Map();
  secs.forEach((sec, i) => { for (const id of sec.slideIds) if (!owner.has(id)) owner.set(id, i); });
  for (const sec of secs) sec.slideIds = [];
  let cur = 0;
  let first = true;
  for (const sl of pres.slides) {
    const s = owner.get(sl.id);
    // 最初のスライドは記録どおりのセクション（前に空のセクションがあってもよい）
    if (s !== undefined && (s > cur || first)) cur = s;
    first = false;
    secs[cur].slideIds.push(sl.id);
  }
}

/**
 * スライド（連続した範囲 idx）を dir（-1 / 1）だけ動かす。セクションがあるときは PowerPoint と同じく、
 * セクションの境目では並びを変えずに隣のセクションへ移し、それ以外では動かしたスライドを移動先のセクションに入れる
 * （動かしていないスライドのセクションは変わらない）。戻り値: 動かした後の先頭の番号（動かせなければ -1）
 */
export function moveSlides(pres, idx, dir) {
  const first = idx[0], count = idx.length;
  const ids = idx.map((i) => pres.slides[i].id);
  const secs = pres.sections || [];
  if (secs.length) {
    const edge = dir < 0 ? first : idx[idx.length - 1];
    const si = sectionIndexOf(pres, edge);
    const sec = secs[si];
    const atEdge = dir < 0 ? sec.slideIds[0] === pres.slides[edge].id : sec.slideIds.at(-1) === pres.slides[edge].id;
    const sameSection = idx.every((i) => sectionIndexOf(pres, i) === si);
    if (atEdge && sameSection && secs[si + dir]) {
      sec.slideIds = sec.slideIds.filter((id) => !ids.includes(id));
      const next = secs[si + dir];
      next.slideIds = dir < 0 ? [...next.slideIds, ...ids] : [...ids, ...next.slideIds];
      return first;
    }
  }
  const to = Math.max(0, Math.min(pres.slides.length - count, first + dir));
  if (to === first) return -1;
  const block = pres.slides.splice(first, count);
  pres.slides.splice(to, 0, ...block);
  if (secs.length) {
    // 動かしたスライドは、移動先の隣（前、先頭なら後ろ）のスライドのセクションへ
    const neighbor = pres.slides[to - 1] || pres.slides[to + count];
    const target = secs.find((sec) => sec.slideIds.includes(neighbor.id));
    for (const sec of secs) sec.slideIds = sec.slideIds.filter((id) => !ids.includes(id));
    target.slideIds.push(...ids);
  }
  return to;
}

/** スライド番号 → セクションの番号（セクションが無ければ -1） */
export function sectionIndexOf(pres, slideIndex) {
  const id = pres.slides[slideIndex]?.id;
  return (pres.sections || []).findIndex((sec) => sec.slideIds.includes(id));
}

function checkSections(list, slides) {
  if (!Array.isArray(list)) return [];
  const ids = new Set(slides.map((s) => s.id));
  const seen = new Set();
  const out = list.filter((sec) => sec && typeof sec === 'object').slice(0, 1000).map((sec) => ({
    id: typeof sec.id === 'string' ? sec.id : newId('sec'),
    name: typeof sec.name === 'string' ? sec.name.slice(0, 200) : '',
    slideIds: Array.isArray(sec.slideIds) ? sec.slideIds.filter((id) => ids.has(id) && !seen.has(id) && seen.add(id)) : [],
  }));
  const pres = { slides, sections: out };
  syncSections(pres);
  return pres.sections;
}

// ---- 読み込み時の検証
const fail = (msg) => { throw new Error(msg); };

function checkFont(f) {
  if (!f || typeof f !== 'object') fail('フォントの形式が正しくありません');
  if (!Number.isFinite(f.size) || f.size <= 0 || f.size > 4000) fail('フォントサイズが不正です');
  if (typeof f.family !== 'string' || !f.family) fail('フォント名が不正です');
  if (!isColorValue(f.color)) fail('文字の色が不正です');
  const out = defaultRunFont({ family: f.family, size: f.size, color: f.color });
  for (const k of ['bold', 'italic', 'underline', 'strike']) out[k] = f[k] === true;
  out.baseline = f.baseline === 'super' || f.baseline === 'sub' ? f.baseline : 0;
  if (isLinkUrl(f.link)) out.link = f.link;
  if (isColorValue(f.highlight)) out.highlight = f.highlight;
  if (Number.isFinite(f.spacing) && f.spacing !== 0) out.spacing = Math.max(-20, Math.min(100, f.spacing));
  return out;
}

function checkParagraphs(paras) {
  if (!Array.isArray(paras) || paras.length === 0) fail('段落の形式が正しくありません');
  return paras.map((p) => {
    if (!p || !Array.isArray(p.runs)) fail('段落の形式が正しくありません');
    if (!ALIGNS.includes(p.align ?? 'left')) fail('文字の配置が不正です');
    const out = {
      align: p.align ?? 'left',
      level: Number.isInteger(p.level) ? Math.max(0, Math.min(MAX_LEVEL, p.level)) : 0,
      bullet: BULLETS.includes(p.bullet) ? p.bullet : 'none',
      lineSpacing: Number.isFinite(p.lineSpacing) && p.lineSpacing >= 0.5 && p.lineSpacing <= 5 ? p.lineSpacing : 1,
      spaceBefore: Number.isFinite(p.spaceBefore) ? Math.max(0, p.spaceBefore) : 0,
      spaceAfter: Number.isFinite(p.spaceAfter) ? Math.max(0, p.spaceAfter) : 0,
      runs: p.runs.map((r) => {
        if (!r || typeof r.text !== 'string') fail('文字の形式が正しくありません');
        return { text: r.text, font: checkFont(r.font) };
      }),
    };
    if (out.runs.length === 0) out.runs.push({ text: '', font: defaultRunFont() });
    return normalizeParagraph(out);
  });
}

function checkObject(o) {
  const validTypes = new Set(['text', 'table', 'image', 'chart', ...SHAPE_TYPES]);
  if (!o || !validTypes.has(o.type)) fail(`不明な図形の種類です: ${o && o.type}`);
  let obj;
  if (Array.isArray(o.paragraphs)) {
    obj = createObject(o.type, { ...o, paragraphs: checkParagraphs(o.paragraphs) });
  } else {
    // 旧形式（version 1）: text / font / align
    const legacyFont = o.font ? checkFont({ ...defaultTextFont(o.type), ...o.font, family: o.font.family === undefined || o.font.family === 'Yu Gothic UI' ? '+minor' : o.font.family }) : undefined;
    if (o.align !== undefined && !ALIGNS.includes(o.align)) fail('文字の配置が不正です');
    obj = createObject(o.type, { ...o, text: String(o.text ?? ''), font: legacyFont });
    for (const k of ['fill', 'stroke']) if (typeof obj[k] === 'string' && obj[k] === '#4472C4') obj[k] = '@accent1';
    // 旧形式には自動調整がなかったので、保存されたサイズを保つ
    obj.autoFit = 'none';
    // 旧形式のプレースホルダーには種類がないので、プロンプト文字から判断する
    if (typeof o.placeholder === 'string' && !o.ph) {
      obj.ph = o.placeholder.includes('サブタイトル') ? 'subTitle' : o.placeholder.includes('タイトル') ? 'title' : 'body';
    }
  }
  for (const key of ['x', 'y', 'w', 'h', 'rotation', 'strokeWidth', 'opacity']) {
    if (!Number.isFinite(obj[key])) fail(`数値が不正です: ${key}`);
  }
  obj.opacity = Math.max(0, Math.min(1, obj.opacity));
  obj.strokeWidth = Math.max(0, obj.strokeWidth);
  for (const key of ['fill', 'stroke']) {
    if (obj[key] !== null && !isColorValue(obj[key])) fail(`色が不正です: ${key}`);
  }
  if (!DASHES.includes(obj.dash)) obj.dash = 'solid';
  if (!ANCHORS.includes(obj.anchor)) obj.anchor = 'top';
  if (!['shape', 'none'].includes(obj.autoFit)) obj.autoFit = 'none';
  for (const k of ['l', 't', 'r', 'b']) if (!Number.isFinite(obj.inset[k]) || obj.inset[k] < 0) obj.inset[k] = DEFAULT_INSET[k];
  for (const k of ['flipH', 'flipV', 'shadow', 'hidden', 'wrap', 'vertical']) obj[k] = k === 'wrap' ? obj[k] !== false : obj[k] === true;
  if (!obj.vertical) delete obj.vertical;
  obj.link = isLinkUrl(obj.link) ? obj.link : undefined;
  if (!obj.link) delete obj.link;
  obj.alt = typeof obj.alt === 'string' ? obj.alt.slice(0, 2000) : '';
  if (!obj.alt) delete obj.alt;
  if (typeof obj.id !== 'string') obj.id = newId('o');
  if (obj.groupId !== null && typeof obj.groupId !== 'string') obj.groupId = null;
  obj.name = typeof obj.name === 'string' ? obj.name : '';
  if (obj.placeholder !== undefined) obj.placeholder = String(obj.placeholder);
  if (o.type === 'image') {
    if (typeof o.src !== 'string' || !/^data:image\/(png|jpeg|gif|bmp|webp|svg\+xml);base64,/.test(o.src)) fail('画像のデータが不正です');
  }
  if (o.type === 'table') checkTable(obj);
  if (o.type === 'chart') obj.chart = checkChart(o.chart) || fail('グラフのデータが不正です');
  return obj;
}

function checkTable(t) {
  if (!Array.isArray(t.cells) || t.cells.length === 0) fail('表の形式が正しくありません');
  const cols = t.cells[0].length;
  if (!cols || t.cells.some((row) => !Array.isArray(row) || row.length !== cols)) fail('表の行と列が正しくありません');
  if (!Array.isArray(t.colWidths) || t.colWidths.length !== cols || t.colWidths.some((w) => !Number.isFinite(w) || w <= 0)) fail('表の列幅が不正です');
  if (!Array.isArray(t.rowHeights) || t.rowHeights.length !== t.cells.length || t.rowHeights.some((h) => !Number.isFinite(h) || h <= 0)) fail('表の行の高さが不正です');
  t.cells = t.cells.map((row) => row.map((c) => ({
    paragraphs: checkParagraphs(c.paragraphs),
    fill: c.fill === null || isColorValue(c.fill) ? c.fill ?? null : fail('セルの色が不正です'),
  })));
  t.headerRow = t.headerRow !== false;
  t.bandedRows = t.bandedRows !== false;
}

// ---- コメント: { id, author, date, text, x, y, target?, resolved, replies: [{ id, author, date, text }] }
export const MAX_COMMENT_TEXT = 10000;
function checkCommentBase(c) {
  return {
    id: typeof c.id === 'string' ? c.id : newId('c'),
    author: typeof c.author === 'string' ? c.author.slice(0, 200) : '',
    date: typeof c.date === 'string' && !Number.isNaN(Date.parse(c.date)) ? c.date : new Date(0).toISOString(),
    text: typeof c.text === 'string' ? c.text.slice(0, MAX_COMMENT_TEXT) : '',
  };
}

/** コメントのマーカーの位置: 図形に付けたコメントは図形の右上（図形が無ければ保存した位置） */
export function commentAnchor(slide, c, size = { width: SLIDE_W, height: SLIDE_H }) {
  const o = c.target && slide.objects.find((x) => x.id === c.target);
  if (!o) return { x: c.x, y: c.y };
  const b = bounds([o]);
  return { x: Math.min(size.width - 20, b.x + b.w), y: Math.max(0, b.y) };
}

function checkComments(list, objects, size) {
  if (!Array.isArray(list)) return [];
  const ids = new Set(objects.map((o) => o.id));
  return list.filter((c) => c && typeof c === 'object').slice(0, 1000).map((c) => {
    const out = {
      ...checkCommentBase(c),
      x: Number.isFinite(c.x) ? Math.max(0, Math.min(size.width, c.x)) : 0,
      y: Number.isFinite(c.y) ? Math.max(0, Math.min(size.height, c.y)) : 0,
      resolved: c.resolved === true,
      replies: Array.isArray(c.replies) ? c.replies.filter((r) => r && typeof r === 'object').slice(0, 1000).map(checkCommentBase) : [],
    };
    if (typeof c.target === 'string' && ids.has(c.target)) out.target = c.target;
    return out;
  });
}

function checkSlide(s, size) {
  if (!s || !Array.isArray(s.objects)) fail('スライドの形式が正しくありません');
  const slide = createSlide('blank', size);
  slide.id = typeof s.id === 'string' ? s.id : slide.id;
  slide.layout = typeof s.layout === 'string' ? s.layout : 'blank';
  slide.objects = s.objects.map(checkObject);
  slide.background = s.background == null ? null : isColorValue(s.background) ? s.background : fail('背景の色が不正です');
  slide.notes = typeof s.notes === 'string' ? s.notes : '';
  slide.hidden = s.hidden === true;
  slide.advanceAfter = Number.isFinite(s.advanceAfter) && s.advanceAfter > 0 && s.advanceAfter <= 3600 ? s.advanceAfter : null;
  const dirOk = (d) => ['fromBottom', 'fromTop', 'fromLeft', 'fromRight'].includes(d);
  const dur = (d, def) => (Number.isFinite(d) && d > 0 && d <= 60 ? d : def);
  if (s.transition && typeof s.transition === 'object' && TRANSITION_IDS.has(s.transition.type) && s.transition.type !== 'none') {
    slide.transition = { type: s.transition.type, duration: dur(s.transition.duration, 0.7), direction: dirOk(s.transition.direction) ? s.transition.direction : undefined };
  }
  slide.comments = checkComments(s.comments, slide.objects, size);
  if (Array.isArray(s.animations)) {
    const ids = new Set(slide.objects.map((o) => o.id));
    slide.animations = s.animations
      .filter((a) => a && ids.has(a.target) && EFFECT_IDS.has(a.effect))
      .map((a) => ({
        target: a.target, effect: a.effect, trigger: ['click', 'with', 'after'].includes(a.trigger) ? a.trigger : 'click',
        duration: dur(a.duration, 0.5), direction: dirOk(a.direction) ? a.direction : undefined,
      }));
  }
  return slide;
}

/** 保存データを検証し、欠けている値を補ったプレゼンテーションを返す。不正なら例外。 */
export function normalizePresentation(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.slides)) fail('プレゼンテーションの形式が正しくありません');
  const width = Number.isFinite(data.width) && data.width >= 100 && data.width <= 5000 ? data.width : SLIDE_W;
  const height = Number.isFinite(data.height) && data.height >= 100 && data.height <= 5000 ? data.height : SLIDE_H;
  const size = { width, height };
  const pres = createPresentation(size);
  pres.theme = THEMES.some((t) => t.id === data.theme) ? data.theme : 'office';
  if (data.theme === 'custom') {
    const custom = checkCustomTheme(data.customTheme);
    if (custom) { pres.theme = 'custom'; pres.customTheme = custom; }
  }
  const hf = data.headerFooter || {};
  pres.headerFooter = {
    slideNumber: hf.slideNumber === true,
    footer: typeof hf.footer === 'string' ? hf.footer : '',
    showFooter: hf.showFooter === true,
    date: hf.date === true,
    hideOnTitle: hf.hideOnTitle !== false,
  };
  pres.slides = data.slides.map((s) => checkSlide(s, size));
  if (pres.slides.length === 0) pres.slides.push(createSlide('blank', size));
  pres.sections = checkSections(data.sections, pres.slides);
  return pres;
}

/** 選択ウィンドウなどで表示する名前（名前がなければ「種類 番号」） */
export function displayName(o, slide) {
  if (o.name) return o.name;
  const i = slide ? slide.objects.indexOf(o) : -1;
  return `${SHAPE_LABELS[o.type] || o.type} ${i + 1}`;
}

/** 図形のクイック スタイル（テーマの色の組み合わせ） */
export function shapeStyles() {
  const keys = ['tx1', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  const out = [];
  for (const [kind, label] of [['colored', '塗りつぶし'], ['light', '淡色'], ['outline', '枠線のみ'], ['intense', '濃色']]) {
    for (const k of keys) {
      const style = {
        colored: { fill: `@${k}`, stroke: `@${k}:-0.5`, text: '@bg1' },
        light: { fill: `@${k}:0.8`, stroke: `@${k}`, text: '@tx1' },
        outline: { fill: '@bg1', stroke: `@${k}`, text: '@tx1' },
        intense: { fill: `@${k}:-0.25`, stroke: null, text: '@bg1' },
      }[kind];
      out.push({ ...style, label: `${label} - ${k === 'tx1' ? '黒' : `アクセント ${k.slice(-1)}`}` });
    }
  }
  return out;
}

export const LINE_WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];

/** オブジェクトの外接矩形（回転は無視） */
export function bounds(objs) {
  if (objs.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of objs) {
    x1 = Math.min(x1, o.x);
    y1 = Math.min(y1, o.y);
    x2 = Math.max(x2, o.x + o.w);
    y2 = Math.max(y2, o.y + o.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
