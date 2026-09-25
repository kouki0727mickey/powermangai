// スライド／図形のデータモデル（DOM に依存しない純粋なロジック）

export const SLIDE_W = 960;
export const SLIDE_H = 540;

export const SHAPE_TYPES = [
  'rect',
  'roundRect',
  'ellipse',
  'triangle',
  'diamond',
  'rightArrow',
  'star',
  'line',
];

export const SHAPE_LABELS = {
  text: 'テキスト ボックス',
  rect: '正方形/長方形',
  roundRect: '角丸四角形',
  ellipse: '楕円',
  triangle: '二等辺三角形',
  diamond: 'ひし形',
  rightArrow: '右矢印',
  star: '星 5pt',
  line: '直線',
};

let idCounter = 0;
export function newId(prefix = 'o') {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function defaultFont() {
  return {
    family: 'Yu Gothic UI',
    size: 18,
    bold: false,
    italic: false,
    underline: false,
    color: '#000000',
  };
}

export function createObject(type, props = {}) {
  const isText = type === 'text';
  const isLine = type === 'line';
  const base = {
    id: newId('o'),
    type,
    x: 0,
    y: 0,
    w: isText ? 320 : isLine ? 200 : 160,
    h: isText ? 48 : isLine ? 0 : 120,
    rotation: 0,
    fill: isText || isLine ? null : '#4472C4',
    stroke: isText ? null : isLine ? '#4472C4' : '#2F528F',
    strokeWidth: isLine ? 2 : 1,
    text: '',
    font: { ...defaultFont(), color: isText ? '#000000' : '#FFFFFF' },
    align: isText ? 'left' : 'center',
    groupId: null,
  };
  const obj = { ...base, ...props, font: { ...base.font, ...(props.font || {}) } };
  return obj;
}

export function createSlide(layout = 'blank') {
  const slide = { id: newId('s'), objects: [] };
  if (layout === 'title') {
    slide.objects.push(
      createObject('text', {
        x: 80, y: 170, w: 800, h: 110, text: '',
        placeholder: 'タイトルを入力',
        align: 'center',
        font: { size: 44 },
      }),
      createObject('text', {
        x: 160, y: 300, w: 640, h: 70, text: '',
        placeholder: 'サブタイトルを入力',
        align: 'center',
        font: { size: 24, color: '#595959' },
      }),
    );
  } else if (layout === 'titleContent') {
    slide.objects.push(
      createObject('text', {
        x: 60, y: 30, w: 840, h: 80, text: '',
        placeholder: 'タイトルを入力',
        font: { size: 36 },
      }),
      createObject('text', {
        x: 60, y: 130, w: 840, h: 370, text: '',
        placeholder: 'テキストを入力',
        font: { size: 24 },
      }),
    );
  }
  return slide;
}

export function createPresentation() {
  return { version: 1, width: SLIDE_W, height: SLIDE_H, slides: [createSlide('title')] };
}

/** 保存データを検証し、欠けている値を補ったプレゼンテーションを返す。不正なら例外。 */
export function normalizePresentation(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.slides)) {
    throw new Error('プレゼンテーションの形式が正しくありません');
  }
  const validTypes = new Set(['text', ...SHAPE_TYPES]);
  const slides = data.slides.map((s) => {
    if (!s || !Array.isArray(s.objects)) throw new Error('スライドの形式が正しくありません');
    return {
      id: typeof s.id === 'string' ? s.id : newId('s'),
      objects: s.objects.map((o) => {
        if (!o || !validTypes.has(o.type)) throw new Error(`不明な図形の種類です: ${o && o.type}`);
        const obj = createObject(o.type, o);
        for (const key of ['x', 'y', 'w', 'h', 'rotation', 'strokeWidth']) {
          if (!Number.isFinite(obj[key])) throw new Error(`数値が不正です: ${key}`);
        }
        if (!Number.isFinite(obj.font.size) || obj.font.size <= 0) throw new Error('フォントサイズが不正です');
        obj.text = String(obj.text ?? '');
        if (typeof obj.id !== 'string') obj.id = newId('o');
        return obj;
      }),
    };
  });
  if (slides.length === 0) slides.push(createSlide('blank'));
  return { version: 1, width: SLIDE_W, height: SLIDE_H, slides };
}

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

export function hasText(obj) {
  return obj.type !== 'line';
}
