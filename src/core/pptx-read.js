// .pptx（PresentationML）の読み込み
import { readZip } from './zip.js';
import { parseXml, kid, kids, path as xpath, textOf } from './xml.js';
import { THEMES, checkCustomTheme, resolveColor, DEFAULT_THEME } from './colors.js';
import { createObject, createPresentation, createSlide, normalizePresentation, SHAPE_TYPES, newId } from './model.js';
import { defaultRunFont, normalizeParagraph } from './richtext.js';

const EMU = 12700;
const pt = (v) => Math.round((Number(v) / EMU) * 100) / 100;

const PRST_IN = {
  star5: 'star', rect: 'rect', line: 'line', straightConnector1: 'line', snip1Rect: 'rect', round1Rect: 'roundRect', round2SameRect: 'roundRect',
  flowChartProcess: 'rect', flowChartAlternateProcess: 'roundRect', flowChartDecision: 'diamond', flowChartConnector: 'ellipse', flowChartTerminator: 'roundRect',
  bentConnector3: 'line', curvedConnector3: 'line', star7: 'star6', star8: 'star6', star10: 'star6', star12: 'star6', notchedRightArrow: 'rightArrow',
  stripedRightArrow: 'rightArrow', upDownArrow: 'upArrow', wedgeRoundRectCallout: 'wedgeRectCallout', cloudCallout: 'cloud', ellipseRibbon: 'rect',
};
const OUR_TYPES = new Set(SHAPE_TYPES);
const LAYOUT_IN = { title: 'title', obj: 'titleContent', tx: 'titleContent', secHead: 'sectionHeader', twoObj: 'twoContent', twoTxTwoObj: 'twoContent', titleOnly: 'titleOnly', blank: 'blank' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
const PRESET_EFFECT = { 1: 'appear', 10: 'fade', 2: 'flyIn', 22: 'wipe', 53: 'zoom', 23: 'zoom', 21: 'zoom', 42: 'floatIn', 47: 'floatIn' };
const SUBTYPE_DIR = { 1: 'fromTop', 2: 'fromRight', 4: 'fromBottom', 8: 'fromLeft' };
const TRANS_DIR_IN = { l: 'fromRight', r: 'fromLeft', u: 'fromBottom', d: 'fromTop' };

function dirname(p) { return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; }
function joinPath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (base ? `${base}/${target}` : target).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

function toBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

class Package {
  constructor(files) {
    this.files = files;
    this.cache = new Map();
  }

  xml(p) {
    if (!p || !this.files[p]) return null;
    if (!this.cache.has(p)) this.cache.set(p, parseXml(this.files[p]));
    return this.cache.get(p);
  }

  /** パーツの関係: rId → { type, target } */
  rels(part) {
    const relPath = `${dirname(part) ? `${dirname(part)}/` : ''}_rels/${part.split('/').pop()}.rels`;
    const x = this.xml(relPath);
    const map = {};
    if (!x) return map;
    for (const r of kids(x, 'Relationship')) {
      if (r.attrs.TargetMode === 'External') continue;
      map[r.attrs.Id] = { type: (r.attrs.Type || '').split('/').pop(), target: joinPath(dirname(part), r.attrs.Target || '') };
    }
    return map;
  }

  relOfType(part, type) {
    return Object.values(this.rels(part)).find((r) => r.type === type)?.target || null;
  }
}

// ---------------------------------------------------------------- テーマ・色
function schemeHex(el) {
  const c = kids(el)[0];
  if (!c) return null;
  if (c.name === 'a:srgbClr') return `#${c.attrs.val}`.toUpperCase();
  if (c.name === 'a:sysClr') return `#${c.attrs.lastClr || (c.attrs.val === 'window' ? 'FFFFFF' : '000000')}`.toUpperCase();
  return null;
}

function readTheme(pkg, themePath, clrMap) {
  const x = pkg.xml(themePath);
  if (!x) return DEFAULT_THEME;
  const scheme = xpath(x, 'a:themeElements/a:clrScheme');
  const raw = {};
  for (const el of kids(scheme)) raw[el.name.slice(2)] = schemeHex(el);
  const map = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', ...clrMap };
  const colors = {
    bg1: raw[map.bg1], tx1: raw[map.tx1], bg2: raw[map.bg2], tx2: raw[map.tx2],
    accent1: raw.accent1, accent2: raw.accent2, accent3: raw.accent3, accent4: raw.accent4, accent5: raw.accent5, accent6: raw.accent6,
    hlink: raw.hlink, folHlink: raw.folHlink,
  };
  const fontOf = (name) => {
    const f = xpath(x, `a:themeElements/a:fontScheme/${name}`);
    if (!f) return null;
    const jpan = kids(f, 'a:font').find((e) => e.attrs.script === 'Jpan')?.attrs.typeface;
    return jpan || kid(f, 'a:ea')?.attrs.typeface || kid(f, 'a:latin')?.attrs.typeface || null;
  };
  const custom = checkCustomTheme({
    name: xpath(x, 'a:themeElements/a:clrScheme')?.attrs.name || x.attrs.name,
    colors, fonts: { major: fontOf('a:majorFont'), minor: fontOf('a:minorFont') },
  });
  // 組み込みのテーマと同じなら、そのテーマを使う
  const same = THEMES.find((t) => Object.keys(t.colors).every((k) => t.colors[k] === custom.colors[k]) && t.fonts.major === custom.fonts.major && t.fonts.minor === custom.fonts.minor);
  return same || custom;
}

/** DrawingML の色要素（solidFill の子など）→ 色の値。alpha も返す */
function readColor(el, theme, phColor) {
  if (!el) return null;
  let base = null;
  let key = null;
  if (el.name === 'a:srgbClr') base = `#${el.attrs.val}`.toUpperCase();
  else if (el.name === 'a:sysClr') base = `#${el.attrs.lastClr || '000000'}`.toUpperCase();
  else if (el.name === 'a:prstClr') base = { black: '#000000', white: '#FFFFFF', red: '#FF0000', blue: '#0000FF', green: '#008000', yellow: '#FFFF00', gray: '#808080' }[el.attrs.val] || '#000000';
  else if (el.name === 'a:schemeClr') {
    if (el.attrs.val === 'phClr') return phColor || null;
    key = { lt1: 'bg1', dk1: 'tx1', lt2: 'bg2', dk2: 'tx2' }[el.attrs.val] || el.attrs.val;
    if (!(key in DEFAULT_THEME.colors)) key = 'tx1';
  } else return null;
  let lumMod = 1, lumOff = 0, alpha = 1, shade = null, tint = null;
  for (const m of kids(el)) {
    const v = Number(m.attrs.val) / 100000;
    if (m.name === 'a:lumMod') lumMod = v;
    else if (m.name === 'a:lumOff') lumOff = v;
    else if (m.name === 'a:alpha') alpha = v;
    else if (m.name === 'a:shade') shade = v;
    else if (m.name === 'a:tint') tint = v;
  }
  let t = 0;
  if (lumOff > 0) t = Math.round(lumOff * 100) / 100;
  else if (lumMod < 1) t = -Math.round((1 - lumMod) * 100) / 100;
  else if (shade !== null) t = -Math.round((1 - shade) * 100) / 100;
  else if (tint !== null) t = Math.round((1 - tint) * 100) / 100;
  let value;
  if (key) value = t ? `@${key}:${Math.max(-1, Math.min(1, t))}` : `@${key}`;
  else value = t ? adjustHex(base, t) : base;
  return { value, alpha };
}

function adjustHex(hex, t) {
  return resolveColor('@accent1' + (t ? `:${t}` : ''), { colors: { ...DEFAULT_THEME.colors, accent1: hex }, fonts: DEFAULT_THEME.fonts });
}

/** fill の要素（solidFill / noFill / gradFill）→ { value, alpha } | null（なし） | undefined（指定なし） */
function readFill(parent, theme, phColor) {
  if (!parent) return undefined;
  if (kid(parent, 'a:noFill')) return null;
  const solid = kid(parent, 'a:solidFill');
  if (solid) return readColor(kids(solid)[0], theme, phColor);
  const grad = kid(parent, 'a:gradFill');
  if (grad) {
    const gs = xpath(grad, 'a:gsLst');
    const stop = gs && kids(gs, 'a:gs')[0];
    return stop ? readColor(kids(stop)[0], theme, phColor) : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------- 文字の書式（継承）
/** lstStyle / txStyles の lvlNpPr を { algn, bullet, lnSpc, rPr: {...} } に */
function readLevels(styleEl, theme) {
  const out = {};
  if (!styleEl) return out;
  for (let i = 0; i < 9; i++) {
    const l = kid(styleEl, `a:lvl${i + 1}pPr`);
    if (l) out[i] = readPPr(l, theme);
  }
  return out;
}

function readPPr(p, theme) {
  if (!p) return {};
  const o = {};
  if (p.attrs.algn) o.align = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[p.attrs.algn] || 'left';
  if (kid(p, 'a:buNone')) o.bullet = 'none';
  else if (kid(p, 'a:buAutoNum')) o.bullet = 'number';
  else if (kid(p, 'a:buChar') || kid(p, 'a:buBlip')) o.bullet = 'bullet';
  const pct = xpath(p, 'a:lnSpc/a:spcPct');
  if (pct) o.lineSpacing = Math.max(0.5, Math.min(5, Math.round((Number(pct.attrs.val) / 100000) * 100) / 100));
  const bef = xpath(p, 'a:spcBef/a:spcPts');
  if (bef) o.spaceBefore = Number(bef.attrs.val) / 100;
  const aft = xpath(p, 'a:spcAft/a:spcPts');
  if (aft) o.spaceAfter = Number(aft.attrs.val) / 100;
  const def = kid(p, 'a:defRPr');
  if (def) o.rPr = readRPr(def, theme);
  return o;
}

function readRPr(r, theme) {
  const o = {};
  if (!r) return o;
  if (r.attrs.sz) o.size = Number(r.attrs.sz) / 100;
  if (r.attrs.b !== undefined) o.bold = r.attrs.b === '1' || r.attrs.b === 'true';
  if (r.attrs.i !== undefined) o.italic = r.attrs.i === '1' || r.attrs.i === 'true';
  if (r.attrs.u !== undefined) o.underline = r.attrs.u !== 'none';
  if (r.attrs.strike !== undefined) o.strike = r.attrs.strike !== 'noStrike';
  if (r.attrs.baseline !== undefined) { const b = Number(r.attrs.baseline); o.baseline = b > 0 ? 'super' : b < 0 ? 'sub' : 0; }
  const f = readFill(r, theme);
  if (f) o.color = f.value;
  const face = (el) => {
    const tf = el?.attrs.typeface;
    if (!tf) return null;
    if (tf.startsWith('+mj')) return '+major';
    if (tf.startsWith('+mn')) return '+minor';
    return tf;
  };
  const ea = face(kid(r, 'a:ea'));
  const latin = face(kid(r, 'a:latin'));
  // 日本語のフォント（ea）を優先する
  if (ea) o.family = ea;
  else if (latin) o.family = latin;
  return o;
}

/** 複数の書式の層（下から上へ）を重ねる */
function mergeLevel(layers, lvl) {
  const out = { rPr: {} };
  for (const layer of layers) {
    const l = layer?.[lvl];
    if (!l) continue;
    const { rPr, ...rest } = l;
    Object.assign(out, rest);
    if (rPr) Object.assign(out.rPr, rPr);
  }
  return out;
}

// ---------------------------------------------------------------- 図形の読み込み
class SlideReader {
  constructor(ctx, slidePath) {
    this.ctx = ctx;
    this.pkg = ctx.pkg;
    this.theme = ctx.theme;
    this.slidePath = slidePath;
    this.rels = this.pkg.rels(slidePath);
    this.layoutPath = Object.values(this.rels).find((r) => r.type === 'slideLayout')?.target;
    this.layout = this.pkg.xml(this.layoutPath);
    this.masterPath = this.layoutPath ? this.pkg.relOfType(this.layoutPath, 'slideMaster') : ctx.masterPath;
    this.master = this.pkg.xml(this.masterPath) || ctx.master;
    this.layoutPhs = placeholders(this.layout);
    this.masterPhs = placeholders(this.master);
    this.spIdMap = new Map(); // cNvPr id → オブジェクト ID（アニメーション用）
    this.headerFooter = {};
  }

  /** プレースホルダーの継承元（レイアウト → マスター） */
  inherited(ph) {
    const kind = (t) => (t === 'ctrTitle' ? 'title' : ['subTitle', 'obj', 'body', undefined].includes(t) ? 'body' : t);
    const byIdx = ph.idx !== undefined ? this.layoutPhs.find((p) => p.idx === ph.idx) : null;
    const lay = byIdx || this.layoutPhs.find((p) => p.type === ph.type) || this.layoutPhs.find((p) => kind(p.type) === kind(ph.type) && ph.idx === undefined);
    const mas = this.masterPhs.find((p) => kind(p.type) === kind(lay?.type ?? ph.type));
    return { lay, mas };
  }

  txStyleFor(phType) {
    const st = xpath(this.master, 'p:txStyles');
    if (phType === undefined) return this.ctx.otherStyle;
    if (phType === 'title' || phType === 'ctrTitle') return readLevels(kid(st, 'p:titleStyle'), this.theme);
    // 本文・サブタイトル・コンテンツ（obj / pic / tbl など）のプレースホルダーは本文のスタイル
    return readLevels(kid(st, 'p:bodyStyle'), this.theme);
  }

  readShapes(tree, transform, groupId, out) {
    for (const el of kids(tree)) {
      if (el.name === 'mc:AlternateContent') {
        const alt = kid(el, 'mc:Fallback') || kid(el, 'mc:Choice');
        if (alt) this.readShapes(alt, transform, groupId, out);
        continue;
      }
      try {
        if (el.name === 'p:sp' || el.name === 'p:cxnSp') this.readSp(el, transform, groupId, out);
        else if (el.name === 'p:pic') this.readPic(el, transform, groupId, out);
        else if (el.name === 'p:graphicFrame') this.readFrame(el, transform, groupId, out);
        else if (el.name === 'p:grpSp') this.readGroup(el, transform, groupId, out);
        else if (el.name === 'p:contentPart') this.ctx.warn('インク（手書き）');
      } catch (err) {
        this.ctx.warn(`読み込めない図形（${err.message}）`);
      }
    }
  }

  readGroup(el, transform, groupId, out) {
    const gSpid = xpath(el, 'p:nvGrpSpPr/p:cNvPr')?.attrs.id;
    const firstIndex = out.length;
    const x = xpath(el, 'p:grpSpPr/a:xfrm');
    let t = transform;
    if (x) {
      const off = kid(x, 'a:off'), ext = kid(x, 'a:ext'), chOff = kid(x, 'a:chOff'), chExt = kid(x, 'a:chExt');
      if (off && ext && chOff && chExt) {
        const sx = Number(chExt.attrs.cx) ? Number(ext.attrs.cx) / Number(chExt.attrs.cx) : 1;
        const sy = Number(chExt.attrs.cy) ? Number(ext.attrs.cy) / Number(chExt.attrs.cy) : 1;
        const inner = { ox: Number(off.attrs.x), oy: Number(off.attrs.y), cx: Number(chOff.attrs.x), cy: Number(chOff.attrs.y), sx, sy };
        // 親の変換と合成
        t = (b) => transform({ x: inner.ox + (b.x - inner.cx) * inner.sx, y: inner.oy + (b.y - inner.cy) * inner.sy, w: b.w * inner.sx, h: b.h * inner.sy, rot: b.rot + (Number(x.attrs.rot) || 0) / 60000 });
      }
    }
    this.readShapes(el, t, groupId || newId('g'), out);
    // グループへのアニメーションは、グループの先頭のメンバー（= グループ全体）に付ける
    if (gSpid && out[firstIndex]) this.spIdMap.set(gSpid, out[firstIndex].id);
  }

  geometry(xfrm, transform, fallback) {
    const src = xfrm || fallback;
    if (!src) return null;
    const off = kid(src, 'a:off'), ext = kid(src, 'a:ext');
    if (!off || !ext) return null;
    const b = transform({ x: Number(off.attrs.x), y: Number(off.attrs.y), w: Number(ext.attrs.cx), h: Number(ext.attrs.cy), rot: (Number(src.attrs.rot) || 0) / 60000 });
    return {
      x: pt(b.x), y: pt(b.y), w: Math.max(0, pt(b.w)), h: Math.max(0, pt(b.h)),
      rotation: ((Math.round(b.rot * 100) / 100) % 360 + 360) % 360,
      flipH: src.attrs.flipH === '1', flipV: src.attrs.flipV === '1',
    };
  }

  readSp(el, transform, groupId, out) {
    const isCxn = el.name === 'p:cxnSp';
    const nv = kid(el, isCxn ? 'p:nvCxnSpPr' : 'p:nvSpPr');
    const cNvPr = kid(nv, 'p:cNvPr');
    const phEl = xpath(nv, 'p:nvPr/p:ph');
    const ph = phEl ? { type: phEl.attrs.type, idx: phEl.attrs.idx !== undefined ? Number(phEl.attrs.idx) : undefined } : null;
    // ヘッダーとフッターのプレースホルダーはプレゼンテーションの設定として読む
    if (ph && ['sldNum', 'ftr', 'dt', 'hdr'].includes(ph.type)) {
      if (ph.type === 'sldNum') this.headerFooter.slideNumber = true;
      if (ph.type === 'dt') this.headerFooter.date = true;
      if (ph.type === 'ftr') { const t = textOf(kid(el, 'p:txBody')).trim(); if (t) { this.headerFooter.showFooter = true; this.headerFooter.footer = t; } }
      return;
    }
    if (ph && ['sldImg', 'chart', 'dgm', 'media', 'clipArt'].includes(ph.type) && !kid(el, 'p:txBody')) return;
    const spPr = kid(el, 'p:spPr');
    const inh = ph ? this.inherited(ph) : {};
    const geo = this.geometry(kid(spPr, 'a:xfrm'), transform, inh.lay?.xfrm || inh.mas?.xfrm);
    if (!geo) { this.ctx.warn('位置のない図形'); return; }
    const prst = kid(spPr, 'a:prstGeom')?.attrs.prst;
    const style = kid(el, 'p:style');
    const styleColor = (name) => { const ref = kid(style, name); return ref && Number(ref.attrs.idx) > 0 ? readColor(kids(ref)[0], this.theme) : null; };
    const txBox = xpath(nv, 'p:cNvSpPr')?.attrs.txBox === '1';
    let type;
    if (ph || txBox) type = 'text';
    else if (isCxn || prst === 'line') type = 'line';
    else if (prst && OUR_TYPES.has(PRST_IN[prst] || prst)) type = PRST_IN[prst] || prst;
    else {
      type = 'rect';
      if (prst || kid(spPr, 'a:custGeom')) this.ctx.warn(`対応していない図形の形（${prst || 'フリーフォーム'}）は四角形として読み込みました`);
    }
    // 塗りつぶし・線
    let fill = readFill(spPr, this.theme);
    if (fill === undefined) fill = style ? styleColor('a:fillRef') : null;
    const lnEl = kid(spPr, 'a:ln');
    let stroke = lnEl ? readFill(lnEl, this.theme) : undefined;
    if (stroke === undefined) stroke = style && Number(kid(style, 'a:lnRef')?.attrs.idx) > 0 ? styleColor('a:lnRef') : null;
    const strokeWidth = lnEl?.attrs.w ? pt(lnEl.attrs.w) : (stroke ? 1 : 0);
    const head = kid(lnEl, 'a:headEnd')?.attrs.type, tail = kid(lnEl, 'a:tailEnd')?.attrs.type;
    if (type === 'line') {
      const hasHead = head && head !== 'none', hasTail = tail && tail !== 'none';
      type = hasHead && hasTail ? 'doubleArrow' : hasTail ? 'arrow' : hasHead ? 'arrow' : 'line';
      if (hasHead && !hasTail) { geo.flipH = !geo.flipH; geo.flipV = !geo.flipV; }
    }
    const dashVal = kid(lnEl, 'a:prstDash')?.attrs.val;
    const dash = { dash: 'dash', sysDash: 'dash', dot: 'dot', sysDot: 'dot', dashDot: 'dashDot', sysDashDot: 'dashDot', lgDash: 'longDash', lgDashDot: 'longDash' }[dashVal] || 'solid';
    // 影: 図形の効果、または図形のスタイル（effectRef）が指すテーマの効果に外側の影がある
    const effIdx = Number(kid(style, 'a:effectRef')?.attrs.idx) || 0;
    const shadow = !!xpath(spPr, 'a:effectLst/a:outerShdw') || (!kid(spPr, 'a:effectLst') && effIdx > 0 && !!this.ctx.effectShadows[effIdx - 1]);
    const fontRefColor = style ? readColor(kids(kid(style, 'a:fontRef'))[0], this.theme) : null;
    const text = this.readTxBody(kid(el, 'p:txBody'), ph, inh, fontRefColor?.value, type);
    const obj = createObject(type, {
      ...geo,
      hidden: cNvPr?.attrs.hidden === '1' || cNvPr?.attrs.hidden === 'true',
      name: cNvPr?.attrs.name || '',
      fill: fill ? fill.value : null,
      opacity: fill?.alpha ?? 1,
      stroke: stroke ? stroke.value : null,
      strokeWidth,
      dash,
      shadow,
      groupId: groupId || null,
      ...(text || {}),
    });
    if (ph) {
      const t = ph.type || 'body';
      obj.ph = t === 'title' ? 'title' : t === 'ctrTitle' ? 'ctrTitle' : t === 'subTitle' ? 'subTitle' : 'body';
      obj.placeholder = { title: 'タイトルを入力', ctrTitle: 'タイトルを入力', subTitle: 'サブタイトルを入力' }[obj.ph] || 'テキストを入力';
    }
    this.spIdMap.set(cNvPr?.attrs.id, obj.id);
    out.push(obj);
  }

  readTxBody(tx, ph, inh, styleFontColor, type) {
    if (!tx) return null;
    const bodyPr = kid(tx, 'a:bodyPr');
    const layBody = inh.lay ? inh.lay.bodyPr : null;
    const masBody = inh.mas ? inh.mas.bodyPr : null;
    const bp = (name) => bodyPr?.attrs[name] ?? layBody?.attrs[name] ?? masBody?.attrs[name];
    const insets = {};
    for (const [k, a] of [['l', 'lIns'], ['t', 'tIns'], ['r', 'rIns'], ['b', 'bIns']]) if (bp(a) !== undefined) insets[k] = pt(bp(a));
    const anchor = { t: 'top', ctr: 'middle', b: 'bottom' }[bp('anchor')] || (type === 'text' && !ph ? 'top' : ph ? (ph.type === 'title' || ph.type === 'ctrTitle' ? 'middle' : 'top') : 'middle');
    const autoFit = kid(bodyPr, 'a:spAutoFit') ? 'shape' : 'none';
    // 書式の層: マスターの文字スタイル → マスターのプレースホルダー → レイアウトのプレースホルダー → 図形
    const baseLayers = [
      this.ctx.defaultStyle,
      ph ? this.txStyleFor(ph.type || 'body') : this.ctx.otherStyle,
      inh.mas?.lstStyle ? readLevels(inh.mas.lstStyle, this.theme) : null,
      inh.lay?.lstStyle ? readLevels(inh.lay.lstStyle, this.theme) : null,
    ];
    const shapeLayer = readLevels(kid(tx, 'a:lstStyle'), this.theme);
    const titleLike = ph && (ph.type === 'title' || ph.type === 'ctrTitle');
    const baseFont = defaultRunFont({ family: titleLike ? '+major' : '+minor', color: styleFontColor || (type === 'text' ? '@tx1' : '@bg1') });
    const paragraphs = kids(tx, 'a:p').map((p) => {
      const pPrEl = kid(p, 'a:pPr');
      const lvl = Math.max(0, Math.min(8, Number(pPrEl?.attrs.lvl) || 0));
      const inherit = mergeLevel(baseLayers, lvl);
      const shapeLvl = mergeLevel([shapeLayer], lvl);
      const own = readPPr(pPrEl, this.theme);
      const pp = { ...inherit, ...shapeLvl, ...own };
      // 図形のスタイル（fontRef）の文字の色は、既定の文字スタイルより優先し、図形自身の書式より弱い
      const paraFont = {
        ...baseFont, ...inherit.rPr, ...(styleFontColor && !ph ? { color: styleFontColor } : {}), ...shapeLvl.rPr, ...(own.rPr || {}),
      };
      const runs = [];
      for (const r of kids(p)) {
        if (r.name === 'a:r' || r.name === 'a:fld') {
          const t = textOf(kid(r, 'a:t'));
          if (t) runs.push({ text: t.replace(/\u000b/g, '\n'), font: { ...paraFont, ...readRPr(kid(r, 'a:rPr'), this.theme) } });
        } else if (r.name === 'a:br') {
          runs.push({ text: '\n', font: { ...paraFont, ...readRPr(kid(r, 'a:rPr'), this.theme) } });
        }
      }
      if (!runs.length) runs.push({ text: '', font: { ...paraFont, ...readRPr(kid(p, 'a:endParaRPr'), this.theme) } });
      const bullet = pp.bullet || 'none';
      return normalizeParagraph({
        align: pp.align || 'left', level: lvl, bullet: bullet === 'bullet' || bullet === 'number' ? bullet : 'none',
        lineSpacing: pp.lineSpacing || 1, spaceBefore: pp.spaceBefore || 0, spaceAfter: pp.spaceAfter || 0,
        runs: runs.map((r) => ({ text: r.text, font: cleanFont(r.font) })),
      });
    });
    return { paragraphs: paragraphs.length ? paragraphs : undefined, anchor, autoFit, wrap: bp('wrap') !== 'none', inset: insets };
  }

  readPic(el, transform, groupId, out) {
    const nv = kid(el, 'p:nvPicPr');
    const cNvPr = kid(nv, 'p:cNvPr');
    const spPr = kid(el, 'p:spPr');
    const geo = this.geometry(kid(spPr, 'a:xfrm'), transform);
    const rid = xpath(el, 'p:blipFill/a:blip')?.attrs['r:embed'];
    const target = rid && this.rels[rid]?.target;
    const data = target && this.pkg.files[target];
    if (!geo || !data) { this.ctx.warn('読み込めない画像'); return; }
    const ext = target.split('.').pop().toLowerCase();
    const mime = MIME[ext];
    if (!mime) { this.ctx.warn(`対応していない画像形式（${ext}）`); return; }
    const lnEl = kid(spPr, 'a:ln');
    const stroke = lnEl ? readFill(lnEl, this.theme) : null;
    const obj = createObject('image', {
      ...geo, name: cNvPr?.attrs.name || '', hidden: cNvPr?.attrs.hidden === '1', src: `data:${mime};base64,${toBase64(data)}`, fill: null,
      stroke: stroke ? stroke.value : null, strokeWidth: lnEl?.attrs.w ? pt(lnEl.attrs.w) : 0, lockAspect: true, groupId: groupId || null,
      shadow: !!xpath(spPr, 'a:effectLst/a:outerShdw'),
    });
    this.spIdMap.set(cNvPr?.attrs.id, obj.id);
    out.push(obj);
  }

  readFrame(el, transform, groupId, out) {
    const data = xpath(el, 'a:graphic/a:graphicData');
    const tbl = kid(data, 'a:tbl');
    const cNvPr = xpath(el, 'p:nvGraphicFramePr/p:cNvPr');
    if (!tbl) { this.ctx.warn(`グラフ・SmartArt などの埋め込みオブジェクト（${cNvPr?.attrs.name || ''}）`); return; }
    const x = kid(el, 'p:xfrm');
    const geo = this.geometry(x, transform);
    if (!geo) return;
    const colWidths = kids(kid(tbl, 'a:tblGrid'), 'a:gridCol').map((g) => Math.max(1, pt(g.attrs.w)));
    const rowsEl = kids(tbl, 'a:tr');
    let merged = false;
    const cells = rowsEl.map((tr) => kids(tr, 'a:tc').slice(0, colWidths.length).map((tc) => {
      if (tc.attrs.gridSpan || tc.attrs.rowSpan || tc.attrs.hMerge || tc.attrs.vMerge) merged = true;
      const txt = this.readTxBody(kid(tc, 'a:txBody'), null, {}, null, 'text');
      const f = readFill(kid(tc, 'a:tcPr'), this.theme);
      return { paragraphs: txt?.paragraphs || [{ align: 'left', level: 0, bullet: 'none', lineSpacing: 1, spaceBefore: 0, spaceAfter: 0, runs: [{ text: '', font: defaultRunFont() }] }], fill: f ? f.value : null };
    }));
    for (const row of cells) while (row.length < colWidths.length) row.push({ paragraphs: [{ align: 'left', level: 0, bullet: 'none', lineSpacing: 1, spaceBefore: 0, spaceAfter: 0, runs: [{ text: '', font: defaultRunFont() }] }], fill: null });
    if (merged) this.ctx.warn('結合したセル（結合せずに読み込みました）');
    const tblPr = kid(tbl, 'a:tblPr');
    const obj = createObject('table', {
      ...geo, name: cNvPr?.attrs.name || '', hidden: cNvPr?.attrs.hidden === '1', fill: null, stroke: null, colWidths, cells,
      rowHeights: rowsEl.map((tr) => Math.max(8, pt(tr.attrs.h || 370840))),
      headerRow: tblPr?.attrs.firstRow === '1', bandedRows: tblPr?.attrs.bandRow === '1', groupId: groupId || null,
    });
    this.spIdMap.set(cNvPr?.attrs.id, obj.id);
    out.push(obj);
  }
}

function cleanFont(f) {
  const d = defaultRunFont();
  return {
    family: typeof f.family === 'string' && f.family ? f.family : d.family,
    size: Number.isFinite(f.size) && f.size > 0 ? f.size : d.size,
    bold: !!f.bold, italic: !!f.italic, underline: !!f.underline, strike: !!f.strike,
    color: f.color || d.color, baseline: f.baseline || 0,
  };
}

/** レイアウト / マスターのプレースホルダー: [{ type, idx, xfrm, lstStyle, bodyPr }] */
function placeholders(x) {
  if (!x) return [];
  const tree = xpath(x, 'p:cSld/p:spTree');
  return kids(tree, 'p:sp').map((sp) => {
    const ph = xpath(sp, 'p:nvSpPr/p:nvPr/p:ph');
    if (!ph) return null;
    return {
      type: ph.attrs.type, idx: ph.attrs.idx !== undefined ? Number(ph.attrs.idx) : undefined,
      xfrm: xpath(sp, 'p:spPr/a:xfrm'), lstStyle: xpath(sp, 'p:txBody/a:lstStyle'), bodyPr: xpath(sp, 'p:txBody/a:bodyPr'),
    };
  }).filter(Boolean);
}

function readBackground(el, theme) {
  const bg = xpath(el, 'p:cSld/p:bg');
  if (!bg) return undefined;
  const bgPr = kid(bg, 'p:bgPr');
  if (bgPr) { const f = readFill(bgPr, theme); return f ? f.value : undefined; }
  const ref = kid(bg, 'p:bgRef');
  if (ref) { const c = readColor(kids(ref)[0], theme); return c ? c.value : undefined; }
  return undefined;
}

const TRANS_TYPES = { fade: 'fade', push: 'push', wipe: 'wipe', split: 'split', cover: 'cover', pull: 'uncover', zoom: 'zoom' };

function readTransition(sld) {
  // PowerPoint 2010 以降は mc:AlternateContent の Choice（p14:dur で正確な時間）と Fallback の両方を書く
  const candidates = [kid(sld, 'p:transition')];
  for (const alt of kids(sld, 'mc:AlternateContent')) {
    candidates.push(kid(kid(alt, 'mc:Choice'), 'p:transition'), kid(kid(alt, 'mc:Fallback'), 'p:transition'));
  }
  const trs = candidates.filter(Boolean);
  if (!trs.length) return null;
  // 種類は対応している効果の要素から（Choice の p14 独自の効果なら Fallback の効果を使う）
  let type = null;
  let dir;
  for (const tr of trs) {
    const child = kids(tr).find((c) => TRANS_TYPES[c.name.split(':').pop()] && c.name.startsWith('p:'));
    if (child) { type = TRANS_TYPES[child.name.split(':').pop()]; dir = TRANS_DIR_IN[child.attrs.dir]; break; }
  }
  if (!type) {
    if (!trs.some((tr) => kids(tr).length)) return null;
    type = 'fade';
  }
  const exact = trs.map((tr) => Number(tr.attrs['p14:dur'])).find((v) => v > 0);
  const duration = exact ? exact / 1000 : { fast: 0.5, med: 0.75, slow: 1 }[trs[0].attrs.spd] || 0.7;
  return { type, duration, direction: dir };
}

/** p:timing の開始効果（クリック時 / 同時 / 後）を読む */
function readAnimations(sld, spIdMap) {
  const out = [];
  const visit = (el) => {
    for (const c of kids(el)) {
      if (c.name === 'p:par') {
        const ctn = kid(c, 'p:cTn');
        if (ctn?.attrs.presetClass === 'entr') {
          let spid = null;
          let dur = 0;
          for (const d of walkAll(ctn)) {
            if (d.name === 'p:spTgt' && !spid) spid = d.attrs.spid;
            if (d.name === 'p:cTn' && d.attrs.dur && d.attrs.dur !== 'indefinite') dur = Math.max(dur, Number(d.attrs.dur));
          }
          const target = spIdMap.get(spid);
          if (target) {
            const effect = PRESET_EFFECT[ctn.attrs.presetID] || 'fade';
            out.push({
              target, effect,
              trigger: { clickEffect: 'click', withEffect: 'with', afterEffect: 'after' }[ctn.attrs.nodeType] || 'click',
              duration: effect === 'appear' ? 0.01 : Math.max(0.01, dur / 1000 || 0.5),
              direction: effect === 'flyIn' || effect === 'wipe' ? SUBTYPE_DIR[ctn.attrs.presetSubtype] : undefined,
            });
          }
          continue;
        }
      }
      visit(c);
    }
  };
  const timing = kid(sld, 'p:timing');
  if (timing) visit(timing);
  return out;
}

function* walkAll(el) {
  for (const c of kids(el)) { yield c; yield* walkAll(c); }
}

/** .pptx のバイト列 → { pres, warnings } */
export async function importPptx(bytes) {
  const files = await readZip(bytes);
  const pkg = new Package(files);
  const presPath = pkg.relOfType('', 'officeDocument') || 'ppt/presentation.xml';
  const px = pkg.xml(presPath);
  if (!px || px.name !== 'p:presentation') throw new Error('PowerPoint のファイルではありません');
  const warnings = new Map();
  const warn = (msg) => warnings.set(msg, (warnings.get(msg) || 0) + 1);
  const sz = kid(px, 'p:sldSz');
  const width = sz ? pt(sz.attrs.cx) : 960;
  const height = sz ? pt(sz.attrs.cy) : 540;
  const presRels = pkg.rels(presPath);
  const masterPath = Object.values(presRels).find((r) => r.type === 'slideMaster')?.target;
  const master = pkg.xml(masterPath);
  const clrMap = kid(master, 'p:clrMap')?.attrs || {};
  const themePath = masterPath ? pkg.relOfType(masterPath, 'theme') : Object.values(presRels).find((r) => r.type === 'theme')?.target;
  const theme = readTheme(pkg, themePath, clrMap);
  const effectList = themePath ? xpath(pkg.xml(themePath), 'a:themeElements/a:fmtScheme/a:effectStyleLst') : null;
  const ctx = {
    pkg, theme, master, masterPath, warn,
    effectShadows: kids(effectList, 'a:effectStyle').map((e) => !!xpath(e, 'a:effectLst/a:outerShdw')),
    defaultStyle: readLevels(kid(px, 'p:defaultTextStyle'), theme),
    otherStyle: { ...readLevels(kid(px, 'p:defaultTextStyle'), theme), ...readLevels(xpath(master, 'p:txStyles/p:otherStyle'), theme) },
  };
  const pres = createPresentation({ width, height });
  if (theme.id === 'custom') { pres.theme = 'custom'; pres.customTheme = theme; } else pres.theme = theme.id;
  const hf = {};
  pres.slides = kids(kid(px, 'p:sldIdLst'), 'p:sldId').map((sid) => {
    const slidePath = presRels[sid.attrs['r:id']]?.target;
    const sx = pkg.xml(slidePath);
    if (!sx) { warn('見つからないスライド'); return null; }
    const reader = new SlideReader(ctx, slidePath);
    const objects = [];
    reader.readShapes(xpath(sx, 'p:cSld/p:spTree'), (b) => b, null, objects);
    const slide = createSlide('blank', { width, height });
    const layoutType = reader.layout?.attrs.type;
    slide.layout = LAYOUT_IN[layoutType] || (objects.some((o) => o.ph === 'body') ? 'titleContent' : 'blank');
    slide.objects = objects;
    slide.hidden = sx.attrs.show === '0';
    slide.background = readBackground(sx, theme) ?? readBackground(reader.layout, theme) ?? readBackground(reader.master, theme) ?? null;
    if (slide.background === '@bg1') slide.background = null;
    slide.transition = readTransition(sx);
    slide.animations = readAnimations(sx, reader.spIdMap);
    const notesPath = Object.values(reader.rels).find((r) => r.type === 'notesSlide')?.target;
    const nx = pkg.xml(notesPath);
    if (nx) {
      const body = kids(xpath(nx, 'p:cSld/p:spTree'), 'p:sp').find((sp) => xpath(sp, 'p:nvSpPr/p:nvPr/p:ph')?.attrs.type === 'body');
      if (body) slide.notes = kids(kid(body, 'p:txBody'), 'a:p').map((p) => textOf(p)).join('\n').replace(/\s+$/, '');
    }
    Object.assign(hf, reader.headerFooter);
    return slide;
  }).filter(Boolean);
  if (!pres.slides.length) pres.slides.push(createSlide('blank', { width, height }));
  pres.headerFooter = { ...pres.headerFooter, ...hf, hideOnTitle: true };
  // 読み込んだ結果もアプリの形式として検証（範囲外の値を補正）
  const checked = normalizePresentation(JSON.parse(JSON.stringify(pres)));
  return { pres: checked, warnings: [...warnings.entries()].map(([msg, n]) => (n > 1 ? `${msg} × ${n}` : msg)) };
}
