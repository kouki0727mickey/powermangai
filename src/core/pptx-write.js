// .pptx（PresentationML）への書き出し
import { tag, esc, XML_HEAD } from './xml.js';
import { writeZip } from './zip.js';
import { themeOf, resolveFontFamily } from './colors.js';
import { createSlide, LAYOUTS, isLine, hasText, objText, bounds } from './model.js';
import { tableLayout } from './table.js';
import { buildSteps } from './animation.js';

export const EMU = 12700; // 1pt
const emu = (v) => Math.round(v * EMU);

const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
};
const nsAttrs = { 'xmlns:a': NS.a, 'xmlns:r': NS.r, 'xmlns:p': NS.p };
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.presentationml';

/** 形状の名前（model → OOXML のプリセット名） */
export const PRST = { star: 'star5', text: 'rect', line: 'line', arrow: 'line', doubleArrow: 'line' };
const prstOf = (type) => PRST[type] || type;

const LAYOUT_TYPES = { title: 'title', titleContent: 'obj', sectionHeader: 'secHead', twoContent: 'twoObj', titleOnly: 'titleOnly', blank: 'blank' };
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

// ---------------------------------------------------------------- 色・フォント
/** 色の値（'#RRGGBB' / '@key:t'）→ DrawingML の色要素 */
export function colorXml(c, alpha = 1) {
  const al = alpha < 1 ? tag('a:alpha', { val: Math.round(alpha * 100000) }) : '';
  if (c[0] === '#') return tag('a:srgbClr', { val: c.slice(1).toUpperCase() }, al);
  const m = /^@([a-zA-Z0-9]+)(?::(-?\d*\.?\d+))?$/.exec(c);
  const key = { lt1: 'bg1', dk1: 'tx1', lt2: 'bg2', dk2: 'tx2' }[m[1]] || m[1];
  const t = m[2] ? Number(m[2]) : 0;
  const mods = t > 0
    ? tag('a:lumMod', { val: Math.round((1 - t) * 100000) }) + tag('a:lumOff', { val: Math.round(t * 100000) })
    : t < 0 ? tag('a:lumMod', { val: Math.round((1 + t) * 100000) }) : '';
  return tag('a:schemeClr', { val: key }, mods, al);
}

const fill = (c, alpha = 1) => (c ? tag('a:solidFill', {}, colorXml(c, alpha)) : tag('a:noFill'));

function fontFaces(family) {
  if (family === '+major') return tag('a:latin', { typeface: '+mj-lt' }) + tag('a:ea', { typeface: '+mj-ea' }) + tag('a:cs', { typeface: '+mj-cs' });
  if (family === '+minor') return tag('a:latin', { typeface: '+mn-lt' }) + tag('a:ea', { typeface: '+mn-ea' }) + tag('a:cs', { typeface: '+mn-cs' });
  return tag('a:latin', { typeface: family }) + tag('a:ea', { typeface: family }) + tag('a:cs', { typeface: family });
}

/** 書き出し中のスライドの外部リンク（URL → rId） */
let linkRel = null;

function rPr(name, f) {
  const link = f.link && linkRel && name === 'a:rPr' ? tag('a:hlinkClick', { 'r:id': linkRel(f.link) }) : '';
  return tag(name, {
    lang: 'ja-JP', altLang: 'en-US', sz: Math.round(f.size * 100),
    b: f.bold ? 1 : 0, i: f.italic ? 1 : 0, u: f.underline ? 'sng' : undefined, strike: f.strike ? 'sngStrike' : undefined,
    baseline: f.baseline === 'super' ? 30000 : f.baseline === 'sub' ? -25000 : undefined, dirty: 0,
  }, fill(f.color), fontFaces(f.family), link);
}

// ---------------------------------------------------------------- 文字
const LEVEL_INDENT = 36, BULLET_HANG = 20;

function paragraphXml(p) {
  const bullet = p.bullet === 'bullet' || p.bullet === 'number';
  const marL = p.level * LEVEL_INDENT + (bullet ? BULLET_HANG : 0);
  const algn = { left: 'l', center: 'ctr', right: 'r', justify: 'just' }[p.align] || 'l';
  const first = p.runs[0].font;
  const bu = p.bullet === 'number'
    ? tag('a:buFont', { typeface: '+mj-lt' }) + tag('a:buAutoNum', { type: 'arabicPeriod' })
    : p.bullet === 'bullet'
      ? tag('a:buFont', { typeface: 'Arial', panose: '020B0604020202020204', pitchFamily: 34, charset: 0 }) + tag('a:buChar', { char: ['•', '–', '•', '–', '»'][p.level % 5] })
      : tag('a:buNone');
  const pPr = tag('a:pPr', { marL: emu(marL), indent: bullet ? -emu(BULLET_HANG) : 0, algn, lvl: p.level || undefined },
    p.lineSpacing !== 1 ? tag('a:lnSpc', {}, tag('a:spcPct', { val: Math.round(p.lineSpacing * 100000) })) : '',
    p.spaceBefore ? tag('a:spcBef', {}, tag('a:spcPts', { val: Math.round(p.spaceBefore * 100) })) : '',
    p.spaceAfter ? tag('a:spcAft', {}, tag('a:spcPts', { val: Math.round(p.spaceAfter * 100) })) : '',
    bu);
  const runs = [];
  for (const r of p.runs) {
    r.text.split('\n').forEach((part, i) => {
      if (i > 0) runs.push(tag('a:br', {}, rPr('a:rPr', r.font)));
      if (part) runs.push(tag('a:r', {}, rPr('a:rPr', r.font), tag('a:t', {}, esc(part))));
    });
  }
  return tag('a:p', {}, pPr, runs, rPr('a:endParaRPr', first));
}

function txBodyXml(o, name = 'p:txBody') {
  const ins = o.inset;
  const bodyPr = tag('a:bodyPr', {
    wrap: o.wrap === false ? 'none' : 'square', lIns: emu(ins.l), tIns: emu(ins.t), rIns: emu(ins.r), bIns: emu(ins.b),
    rtlCol: 0, anchor: { top: 't', middle: 'ctr', bottom: 'b' }[o.anchor] || 't', vert: o.vertical ? 'eaVert' : undefined,
  }, o.autoFit === 'shape' ? tag('a:spAutoFit') : tag('a:noAutofit'));
  return tag(name, {}, bodyPr, tag('a:lstStyle'), o.paragraphs.map(paragraphXml));
}

// ---------------------------------------------------------------- 図形
function xfrm(o, name = 'a:xfrm') {
  return tag(name, { rot: o.rotation ? Math.round(o.rotation * 60000) : undefined, flipH: o.flipH ? 1 : undefined, flipV: o.flipV ? 1 : undefined },
    tag('a:off', { x: emu(o.x), y: emu(o.y) }), tag('a:ext', { cx: emu(o.w), cy: emu(o.h) }));
}

function lnXml(o) {
  if (!o.stroke || !o.strokeWidth) return tag('a:ln', {}, tag('a:noFill'));
  const dash = { dash: 'dash', dot: 'sysDot', dashDot: 'dashDot', longDash: 'lgDash' }[o.dash];
  return tag('a:ln', { w: emu(o.strokeWidth) }, fill(o.stroke, o.opacity ?? 1), dash ? tag('a:prstDash', { val: dash }) : '',
    o.type === 'doubleArrow' ? tag('a:headEnd', { type: 'triangle' }) : '',
    o.type === 'arrow' || o.type === 'doubleArrow' ? tag('a:tailEnd', { type: 'triangle' }) : '');
}

const shadowXml = (o) => (o.shadow ? tag('a:effectLst', {}, tag('a:outerShdw', { blurRad: 50800, dist: 38100, dir: 2700000, algn: 'tl', rotWithShape: 0 }, tag('a:prstClr', { val: 'black' }, tag('a:alpha', { val: 40000 })))) : '');

/** 図形の名前・代替テキスト・非表示・図形のリンク */
function cNvPr(o, id, name) {
  return tag('p:cNvPr', { id, name, descr: o.alt || undefined, hidden: o.hidden ? 1 : undefined },
    o.link && linkRel ? tag('a:hlinkClick', { 'r:id': linkRel(o.link) }) : '');
}

function phXml(o, slideCtx) {
  if (!o.ph) return '';
  if (o.ph === 'title') return tag('p:ph', { type: 'title' });
  if (o.ph === 'ctrTitle') return tag('p:ph', { type: 'ctrTitle' });
  if (o.ph === 'subTitle') return tag('p:ph', { type: 'subTitle', idx: 1 });
  // 本文（2 つ目以降は idx 2…）
  slideCtx.bodyIdx += 1;
  return slideCtx.layout === 'sectionHeader' ? tag('p:ph', { type: 'body', idx: slideCtx.bodyIdx }) : tag('p:ph', { idx: slideCtx.bodyIdx });
}

function spXml(o, id, slideCtx) {
  const name = o.name || `${o.ph ? 'Placeholder' : o.type === 'text' ? 'TextBox' : 'Shape'} ${id}`;
  if (isLine(o)) {
    return tag('p:cxnSp', {},
      tag('p:nvCxnSpPr', {}, cNvPr(o, id, name), tag('p:cNvCxnSpPr'), tag('p:nvPr')),
      tag('p:spPr', {}, xfrm(o), tag('a:prstGeom', { prst: 'line' }, tag('a:avLst')), lnXml(o), shadowXml(o)));
  }
  const nv = tag('p:nvSpPr', {},
    cNvPr(o, id, name),
    tag('p:cNvSpPr', { txBox: o.type === 'text' && !o.ph ? 1 : undefined }, o.ph ? tag('a:spLocks', { noGrp: 1 }) : ''),
    tag('p:nvPr', {}, phXml(o, slideCtx)));
  const spPr = tag('p:spPr', {}, xfrm(o), tag('a:prstGeom', { prst: prstOf(o.type) }, tag('a:avLst')), fill(o.fill, o.opacity ?? 1), lnXml(o), shadowXml(o));
  return tag('p:sp', {}, nv, spPr, txBodyXml(o));
}

function picXml(o, id, rid) {
  return tag('p:pic', {},
    tag('p:nvPicPr', {}, cNvPr(o, id, o.name || `Picture ${id}`), tag('p:cNvPicPr', {}, tag('a:picLocks', { noChangeAspect: 1 })), tag('p:nvPr')),
    tag('p:blipFill', {}, tag('a:blip', { 'r:embed': rid }), tag('a:stretch', {}, tag('a:fillRect'))),
    tag('p:spPr', {}, xfrm(o), tag('a:prstGeom', { prst: 'rect' }, tag('a:avLst')), o.stroke && o.strokeWidth ? lnXml(o) : '', shadowXml(o)));
}

function tableXml(o, id) {
  const lay = tableLayout(o);
  const rows = o.cells.map((row, r) => tag('a:tr', { h: emu(lay.heights[r]) }, row.map((cell) => tag('a:tc', {},
    tag('a:txBody', {}, tag('a:bodyPr'), tag('a:lstStyle'), cell.paragraphs.map(paragraphXml)),
    tag('a:tcPr', { marL: emu(7.2), marR: emu(7.2), marT: emu(3.6), marB: emu(3.6) }, cell.fill ? fill(cell.fill) : '')))));
  return tag('p:graphicFrame', {},
    tag('p:nvGraphicFramePr', {}, cNvPr(o, id, o.name || `Table ${id}`), tag('p:cNvGraphicFramePr', {}, tag('a:graphicFrameLocks', { noGrp: 1 })), tag('p:nvPr')),
    tag('p:xfrm', {}, tag('a:off', { x: emu(o.x), y: emu(o.y) }), tag('a:ext', { cx: emu(o.w), cy: emu(lay.total) })),
    tag('a:graphic', {}, tag('a:graphicData', { uri: 'http://schemas.openxmlformats.org/drawingml/2006/table' },
      tag('a:tbl', {},
        tag('a:tblPr', { firstRow: o.headerRow ? 1 : undefined, bandRow: o.bandedRows ? 1 : undefined }, tag('a:tableStyleId', {}, '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}')),
        tag('a:tblGrid', {}, o.colWidths.map((w) => tag('a:gridCol', { w: emu(w) }))),
        rows))));
}

function spTreeStart() {
  return tag('p:nvGrpSpPr', {}, tag('p:cNvPr', { id: 1, name: '' }), tag('p:cNvGrpSpPr'), tag('p:nvPr'))
    + tag('p:grpSpPr', {}, tag('a:xfrm', {}, tag('a:off', { x: 0, y: 0 }), tag('a:ext', { cx: 0, cy: 0 }), tag('a:chOff', { x: 0, y: 0 }), tag('a:chExt', { cx: 0, cy: 0 })));
}

// ---------------------------------------------------------------- 画像
function decodeDataUrl(src) {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(src);
  if (!m) return null;
  const bin = atob(m[2]);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return { mime: m[1], data: u8 };
}

// ---------------------------------------------------------------- スライド
const TRANS_DIR = { fromRight: 'l', fromLeft: 'r', fromBottom: 'u', fromTop: 'd' };

function transitionXml(tr, advanceAfter) {
  const advTm = advanceAfter ? Math.round(advanceAfter * 1000) : undefined;
  if (!tr) return advTm ? tag('p:transition', { advTm }) : '';
  const spd = tr.duration < 0.5 ? 'fast' : tr.duration > 1 ? 'slow' : 'med';
  const d = TRANS_DIR[tr.direction || 'fromRight'];
  const child = {
    fade: tag('p:fade'),
    push: tag('p:push', { dir: d }),
    wipe: tag('p:wipe', { dir: d }),
    split: tag('p:split', { orient: 'vert', dir: 'out' }),
    cover: tag('p:cover', { dir: d }),
    uncover: tag('p:pull', { dir: d }),
    zoom: tag('p:zoom'),
  }[tr.type];
  if (!child) return advTm ? tag('p:transition', { advTm }) : '';
  // 正確な時間は PowerPoint 2010 以降の p14:dur で書く（古いアプリ用に spd だけの版も付ける）
  const dur = Math.round(tr.duration * 1000);
  return tag('mc:AlternateContent', { 'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006' },
    tag('mc:Choice', { 'xmlns:p14': 'http://schemas.microsoft.com/office/powerpoint/2010/main', Requires: 'p14' }, tag('p:transition', { spd, 'p14:dur': dur, advTm }, child)),
    tag('mc:Fallback', {}, tag('p:transition', { spd, advTm }, child)));
}

// ---------------------------------------------------------------- アニメーション（p:timing）
const PRESET_OUT = { appear: 1, fade: 10, flyIn: 2, wipe: 22, zoom: 53, floatIn: 42 };
const DIR_SUB = { fromTop: 1, fromRight: 2, fromBottom: 4, fromLeft: 8 };
const WIPE_FILTER = { fromTop: 'wipe(down)', fromBottom: 'wipe(up)', fromLeft: 'wipe(right)', fromRight: 'wipe(left)' };
const FLY_FROM = {
  fromBottom: ['#ppt_x', '1+#ppt_h/2'], fromTop: ['#ppt_x', '0-#ppt_h/2'], fromLeft: ['0-#ppt_w/2', '#ppt_y'], fromRight: ['1+#ppt_w/2', '#ppt_y'],
};

function timingXml(slide, spidOf) {
  const anims = (slide.animations || []).filter((a) => spidOf(a.target));
  if (!anims.length) return '';
  let id = 2;
  const next = () => { id += 1; return id; };
  const tgt = (spid) => tag('p:tgtEl', {}, tag('p:spTgt', { spid }));
  const cond = (delay) => tag('p:stCondLst', {}, tag('p:cond', { delay }));
  const anim = (spid, dur, attr, from, to) => tag('p:anim', { calcmode: 'lin', valueType: 'num' },
    tag('p:cBhvr', { additive: 'base' }, tag('p:cTn', { id: next(), dur, fill: 'hold' }), tgt(spid), tag('p:attrNameLst', {}, tag('p:attrName', {}, attr))),
    tag('p:tavLst', {}, tag('p:tav', { tm: 0 }, tag('p:val', {}, tag('p:strVal', { val: from }))), tag('p:tav', { tm: 100000 }, tag('p:val', {}, tag('p:strVal', { val: to })))));
  const animEffect = (spid, dur, filter) => tag('p:animEffect', { transition: 'in', filter },
    tag('p:cBhvr', {}, tag('p:cTn', { id: next(), dur }), tgt(spid)));
  const effectXml = (a) => {
    const spid = spidOf(a.target);
    const dur = Math.max(1, Math.round((a.duration || 0.5) * 1000));
    const dir = a.direction || (a.effect === 'flyIn' || a.effect === 'wipe' ? 'fromBottom' : undefined);
    const ctnId = next();
    const set = tag('p:set', {}, tag('p:cBhvr', {}, tag('p:cTn', { id: next(), dur: 1, fill: 'hold' }, cond(0)), tgt(spid), tag('p:attrNameLst', {}, tag('p:attrName', {}, 'style.visibility'))),
      tag('p:to', {}, tag('p:strVal', { val: 'visible' })));
    let behaviors = set;
    if (a.effect === 'fade') behaviors += animEffect(spid, dur, 'fade');
    else if (a.effect === 'wipe') behaviors += animEffect(spid, dur, WIPE_FILTER[dir]);
    else if (a.effect === 'flyIn') behaviors += anim(spid, dur, 'ppt_x', FLY_FROM[dir][0], '#ppt_x') + anim(spid, dur, 'ppt_y', FLY_FROM[dir][1], '#ppt_y');
    else if (a.effect === 'zoom') behaviors += anim(spid, dur, 'ppt_w', '0', '#ppt_w') + anim(spid, dur, 'ppt_h', '0', '#ppt_h') + animEffect(spid, dur, 'fade');
    else if (a.effect === 'floatIn') behaviors += animEffect(spid, dur, 'fade') + anim(spid, dur, 'ppt_x', '#ppt_x', '#ppt_x') + anim(spid, dur, 'ppt_y', '#ppt_y+.1', '#ppt_y');
    return tag('p:par', {}, tag('p:cTn', {
      id: ctnId, presetID: PRESET_OUT[a.effect] || 10, presetClass: 'entr', presetSubtype: dir ? DIR_SUB[dir] : 0, fill: 'hold', grpId: 0,
      nodeType: { click: 'clickEffect', with: 'withEffect', after: 'afterEffect' }[a.trigger] || 'clickEffect',
    }, cond(0), tag('p:childTnLst', {}, behaviors)));
  };
  const steps = buildSteps(anims);
  const stepXml = steps.map((step) => {
    // 同じ開始時刻の効果を 1 つの par にまとめる（「後」は開始時刻がずれる）
    const byStart = new Map();
    for (const it of step.items) {
      const k = Math.round(it.start * 1000);
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push(it.anim);
    }
    const outerId = next();
    const inner = [...byStart.entries()].map(([start, list]) => tag('p:par', {}, tag('p:cTn', { id: next(), fill: 'hold' }, cond(start), tag('p:childTnLst', {}, list.map(effectXml)))));
    const stCond = step.auto
      ? tag('p:stCondLst', {}, tag('p:cond', { delay: 'indefinite' }), tag('p:cond', { evt: 'onBegin', delay: 0 }, tag('p:tn', { val: 2 })))
      : tag('p:stCondLst', {}, tag('p:cond', { delay: 'indefinite' }));
    return tag('p:par', {}, tag('p:cTn', { id: outerId, fill: 'hold' }, stCond, tag('p:childTnLst', {}, inner)));
  });
  const main = tag('p:seq', { concurrent: 1, nextAc: 'seek' },
    tag('p:cTn', { id: 2, dur: 'indefinite', nodeType: 'mainSeq' }, tag('p:childTnLst', {}, stepXml)),
    tag('p:prevCondLst', {}, tag('p:cond', { evt: 'onPrev', delay: 0 }, tag('p:tgtEl', {}, tag('p:sldTgt')))),
    tag('p:nextCondLst', {}, tag('p:cond', { evt: 'onNext', delay: 0 }, tag('p:tgtEl', {}, tag('p:sldTgt')))));
  const bld = [...new Set(anims.map((a) => spidOf(a.target, true)).filter(Boolean))].map((spid) => tag('p:bldP', { spid, grpId: 0, animBg: 1 }));
  return tag('p:timing', {},
    tag('p:tnLst', {}, tag('p:par', {}, tag('p:cTn', { id: 1, dur: 'indefinite', restart: 'never', nodeType: 'tmRoot' }, tag('p:childTnLst', {}, main)))),
    bld.length ? tag('p:bldLst', {}, bld) : '');
}

/** ヘッダーとフッターのプレースホルダー（スライド番号・フッター・日付） */
function headerFooterXml(pres, slide, index, nextId) {
  const hf = pres.headerFooter;
  if (!hf || (hf.hideOnTitle && slide.layout === 'title')) return '';
  const W = pres.width, H = pres.height;
  const box = (type, idx, x, w, algn, inner) => {
    const id = nextId();
    return tag('p:sp', {},
      tag('p:nvSpPr', {}, tag('p:cNvPr', { id, name: `${type} ${id}` }), tag('p:cNvSpPr', {}, tag('a:spLocks', { noGrp: 1 })), tag('p:nvPr', {}, tag('p:ph', { type, sz: type === 'dt' ? 'half' : 'quarter', idx }))),
      tag('p:spPr', {}, tag('a:xfrm', {}, tag('a:off', { x: emu(x), y: emu(H - 38) }), tag('a:ext', { cx: emu(w), cy: emu(29) }))),
      tag('p:txBody', {}, tag('a:bodyPr'), tag('a:lstStyle'), tag('a:p', {}, tag('a:pPr', { algn }), inner)));
  };
  const rp = tag('a:rPr', { lang: 'ja-JP', altLang: 'en-US', sz: 1200 });
  let out = '';
  if (hf.date) out += box('dt', 10, 40, 200, 'l', tag('a:fld', { id: '{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}', type: 'datetime1' }, rp, tag('a:t', {}, esc(new Date().toLocaleDateString('ja-JP')))));
  if (hf.showFooter && hf.footer) out += box('ftr', 11, W / 2 - 200, 400, 'ctr', tag('a:r', {}, rp, tag('a:t', {}, esc(hf.footer))));
  if (hf.slideNumber) out += box('sldNum', 12, W - 240, 200, 'r', tag('a:fld', { id: '{3A9A3E6F-6C2B-4B1E-9C2F-1B6E1C7C9D10}', type: 'slidenum' }, rp, tag('a:t', {}, String(index + 1))));
  return out;
}

function slideXml(pres, slide, index, rels) {
  linkRel = rels.link;
  try {
    return slideXmlInner(pres, slide, index, rels);
  } finally {
    linkRel = null;
  }
}

function slideXmlInner(pres, slide, index, rels) {
  let nid = 1;
  const nextId = () => { nid += 1; return nid; };
  const ctx = { layout: slide.layout, bodyIdx: 0 };
  // アニメーション用: オブジェクト ID → 図形の ID（グループのメンバーはグループの ID）
  const spids = new Map();
  const textSpids = new Set();
  const shapes = [];
  // グループ: 先頭のメンバーの位置にまとめて書き出す
  const done = new Set();
  const one = (o) => {
    const id = nextId();
    if (!o.groupId) spids.set(o.id, id);
    if (o.type === 'image') {
      const img = decodeDataUrl(o.src);
      if (!img) return '';
      return picXml(o, id, rels.image(img));
    }
    if (o.type === 'table') return tableXml(o, id);
    if (!isLine(o)) textSpids.add(id);
    return spXml(o, id, ctx);
  };
  for (const o of slide.objects) {
    if (done.has(o.id)) continue;
    if (o.groupId) {
      const members = slide.objects.filter((x) => x.groupId === o.groupId);
      members.forEach((m) => done.add(m.id));
      const b = bounds(members);
      const gid = nextId();
      for (const m of members) spids.set(m.id, gid);
      const off = tag('a:off', { x: emu(b.x), y: emu(b.y) }), ext = tag('a:ext', { cx: emu(b.w), cy: emu(b.h) });
      shapes.push(tag('p:grpSp', {},
        tag('p:nvGrpSpPr', {}, tag('p:cNvPr', { id: gid, name: `Group ${gid}` }), tag('p:cNvGrpSpPr'), tag('p:nvPr')),
        tag('p:grpSpPr', {}, tag('a:xfrm', {}, off, ext, tag('a:chOff', { x: emu(b.x), y: emu(b.y) }), tag('a:chExt', { cx: emu(b.w), cy: emu(b.h) }))),
        members.map(one)));
      continue;
    }
    done.add(o.id);
    shapes.push(one(o));
  }
  const bg = slide.background ? tag('p:bg', {}, tag('p:bgPr', {}, fill(slide.background), tag('a:effectLst'))) : '';
  return XML_HEAD + tag('p:sld', { ...nsAttrs, show: slide.hidden ? 0 : undefined },
    tag('p:cSld', {}, bg, tag('p:spTree', {}, spTreeStart(), shapes, headerFooterXml(pres, slide, index, nextId))),
    tag('p:clrMapOvr', {}, tag('a:masterClrMapping')),
    transitionXml(slide.transition, slide.advanceAfter),
    timingXml(slide, (id, forBuild) => {
      const spid = spids.get(id);
      return forBuild ? (textSpids.has(spid) ? spid : null) : spid;
    }));
}

// ---------------------------------------------------------------- テーマ・マスター・レイアウト
function themeXml(th, name = 'PowerMangai') {
  const c = th.colors;
  const clr = (k, v) => tag(`a:${k}`, {}, tag('a:srgbClr', { val: v.slice(1) }));
  const phFill = (mods = '') => tag('a:solidFill', {}, tag('a:schemeClr', { val: 'phClr' }, mods));
  const lnStyle = (w) => tag('a:ln', { w, cap: 'flat', cmpd: 'sng', algn: 'ctr' }, phFill(), tag('a:prstDash', { val: 'solid' }), tag('a:miter', { lim: 800000 }));
  const fontGroup = (name, face) => tag(name, {}, tag('a:latin', { typeface: face }), tag('a:ea', { typeface: '' }), tag('a:cs', { typeface: '' }), tag('a:font', { script: 'Jpan', typeface: face }));
  return XML_HEAD + tag('a:theme', { 'xmlns:a': NS.a, name },
    tag('a:themeElements', {},
      tag('a:clrScheme', { name: th.name || 'PowerMangai' },
        clr('dk1', c.tx1), clr('lt1', c.bg1), clr('dk2', c.tx2), clr('lt2', c.bg2),
        clr('accent1', c.accent1), clr('accent2', c.accent2), clr('accent3', c.accent3), clr('accent4', c.accent4),
        clr('accent5', c.accent5), clr('accent6', c.accent6), clr('hlink', c.hlink), clr('folHlink', c.folHlink)),
      tag('a:fontScheme', { name: th.name || 'PowerMangai' }, fontGroup('a:majorFont', th.fonts.major), fontGroup('a:minorFont', th.fonts.minor)),
      tag('a:fmtScheme', { name: 'Office' },
        tag('a:fillStyleLst', {}, phFill(), phFill(tag('a:tint', { val: 50000 })), phFill(tag('a:shade', { val: 80000 }))),
        tag('a:lnStyleLst', {}, lnStyle(6350), lnStyle(12700), lnStyle(19050)),
        tag('a:effectStyleLst', {}, tag('a:effectStyle', {}, tag('a:effectLst')), tag('a:effectStyle', {}, tag('a:effectLst')), tag('a:effectStyle', {}, tag('a:effectLst'))),
        tag('a:bgFillStyleLst', {}, phFill(), phFill(tag('a:tint', { val: 95000 })), phFill(tag('a:shade', { val: 90000 }))))),
    tag('a:objectDefaults'), tag('a:extraClrSchemeLst'));
}

function lvlPPr(lvl, { size, bullet, major = false, algn = 'l' }) {
  const marL = bullet ? emu(lvl * LEVEL_INDENT + BULLET_HANG) : 0;
  return tag(`a:lvl${lvl + 1}pPr`, { marL, indent: bullet ? -emu(BULLET_HANG) : 0, algn, defTabSz: 914400, rtl: 0, eaLnBrk: 1, latinLnBrk: 0, hangingPunct: 1 },
    tag('a:lnSpc', {}, tag('a:spcPct', { val: 100000 })),
    bullet ? tag('a:buFont', { typeface: 'Arial', panose: '020B0604020202020204', pitchFamily: 34, charset: 0 }) + tag('a:buChar', { char: ['•', '–', '•', '–', '»'][lvl % 5] }) : tag('a:buNone'),
    tag('a:defRPr', { sz: size * 100, kern: 1200 }, tag('a:solidFill', {}, tag('a:schemeClr', { val: 'tx1' })), fontFaces(major ? '+major' : '+minor')));
}

function layoutPlaceholders(layout, size) {
  const slide = createSlide(layout, size);
  const ctx = { layout, bodyIdx: 0 };
  let id = 1;
  return slide.objects.map((o) => {
    id += 1;
    const ph = phXml(o, ctx);
    const f = o.paragraphs[0].runs[0].font;
    const p0 = o.paragraphs[0];
    return tag('p:sp', {},
      tag('p:nvSpPr', {}, tag('p:cNvPr', { id, name: o.name || `Placeholder ${id}` }), tag('p:cNvSpPr', {}, tag('a:spLocks', { noGrp: 1 })), tag('p:nvPr', {}, ph)),
      tag('p:spPr', {}, xfrm(o)),
      tag('p:txBody', {},
        tag('a:bodyPr', { anchor: { top: 't', middle: 'ctr', bottom: 'b' }[o.anchor] }),
        tag('a:lstStyle', {}, tag('a:lvl1pPr', { algn: { left: 'l', center: 'ctr', right: 'r', justify: 'just' }[p0.align], marL: p0.bullet === 'none' ? 0 : undefined, indent: p0.bullet === 'none' ? 0 : undefined },
          p0.bullet === 'none' ? tag('a:buNone') : '',
          tag('a:defRPr', { sz: Math.round(f.size * 100) }, f.color !== '@tx1' ? fill(f.color) : ''))),
        tag('a:p', {}, tag('a:r', {}, tag('a:rPr', { lang: 'ja-JP', altLang: 'en-US' }), tag('a:t', {}, esc(o.placeholder || ''))))));
  }).join('');
}

function footerPlaceholders(size, idxBase) {
  const W = size.width, H = size.height;
  const box = (id, type, idx, x, w, algn) => tag('p:sp', {},
    tag('p:nvSpPr', {}, tag('p:cNvPr', { id, name: `${type} ${id}` }), tag('p:cNvSpPr', {}, tag('a:spLocks', { noGrp: 1 })), tag('p:nvPr', {}, tag('p:ph', { type, sz: type === 'dt' ? 'half' : 'quarter', idx }))),
    tag('p:spPr', {}, tag('a:xfrm', {}, tag('a:off', { x: emu(x), y: emu(H - 38) }), tag('a:ext', { cx: emu(w), cy: emu(29) }))),
    tag('p:txBody', {}, tag('a:bodyPr', { anchor: 'ctr' }), tag('a:lstStyle', {}, tag('a:lvl1pPr', { algn }, tag('a:defRPr', { sz: 1200 }, tag('a:solidFill', {}, tag('a:schemeClr', { val: 'tx1' }, tag('a:lumMod', { val: 50000 }), tag('a:lumOff', { val: 50000 })))))), tag('a:p', {}, tag('a:endParaRPr', { lang: 'ja-JP' }))));
  return box(20, 'dt', idxBase, 40, 200, 'l') + box(21, 'ftr', idxBase + 1, W / 2 - 200, 400, 'ctr') + box(22, 'sldNum', idxBase + 2, W - 240, 200, 'r');
}

function masterXml(size, layoutCount) {
  const title = createSlide('titleContent', size).objects[0];
  const body = createSlide('titleContent', size).objects[1];
  const ph = (id, type, idx, o, anchor) => tag('p:sp', {},
    tag('p:nvSpPr', {}, tag('p:cNvPr', { id, name: `${type} ${id}` }), tag('p:cNvSpPr', {}, tag('a:spLocks', { noGrp: 1 })), tag('p:nvPr', {}, tag('p:ph', { type, idx }))),
    tag('p:spPr', {}, xfrm(o), tag('a:prstGeom', { prst: 'rect' }, tag('a:avLst'))),
    tag('p:txBody', {}, tag('a:bodyPr', { vert: 'horz', lIns: 91440, tIns: 45720, rIns: 91440, bIns: 45720, rtlCol: 0, anchor }, tag('a:normAutofit')), tag('a:lstStyle'),
      tag('a:p', {}, tag('a:r', {}, tag('a:rPr', { lang: 'ja-JP', altLang: 'en-US' }), tag('a:t', {}, type === 'title' ? 'マスター タイトルの書式設定' : 'マスター テキストの書式設定')))));
  const bodySizes = [24, 20, 18, 16, 16, 16, 16, 16, 16];
  return XML_HEAD + tag('p:sldMaster', nsAttrs,
    tag('p:cSld', {}, tag('p:bg', {}, tag('p:bgRef', { idx: 1001 }, tag('a:schemeClr', { val: 'bg1' }))),
      tag('p:spTree', {}, spTreeStart(), ph(2, 'title', undefined, title, 'ctr'), ph(3, 'body', 1, body, undefined), footerPlaceholders(size, 2))),
    tag('p:clrMap', { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' }),
    tag('p:sldLayoutIdLst', {}, Array.from({ length: layoutCount }, (_, i) => tag('p:sldLayoutId', { id: 2147483649 + i, 'r:id': `rId${i + 1}` }))),
    tag('p:txStyles', {},
      tag('p:titleStyle', {}, lvlPPr(0, { size: 36, bullet: false, major: true })),
      tag('p:bodyStyle', {}, bodySizes.map((sz, i) => lvlPPr(i, { size: sz, bullet: true }))),
      tag('p:otherStyle', {}, tag('a:defPPr', {}, tag('a:defRPr', { lang: 'ja-JP' })), lvlPPr(0, { size: 18, bullet: false }))));
}

function layoutXml(layout, size) {
  const label = LAYOUTS.find((l) => l.id === layout)?.label || layout;
  return XML_HEAD + tag('p:sldLayout', { ...nsAttrs, type: LAYOUT_TYPES[layout], preserve: 1 },
    tag('p:cSld', { name: label }, tag('p:spTree', {}, spTreeStart(), layoutPlaceholders(layout, size), footerPlaceholders(size, 10).replace(/id="2([012])"/g, 'id="3$1"'))),
    tag('p:clrMapOvr', {}, tag('a:masterClrMapping')));
}

function notesMasterXml(size) {
  return XML_HEAD + tag('p:notesMaster', nsAttrs,
    tag('p:cSld', {}, tag('p:bg', {}, tag('p:bgRef', { idx: 1001 }, tag('a:schemeClr', { val: 'bg1' }))),
      tag('p:spTree', {}, spTreeStart(),
        tag('p:sp', {}, tag('p:nvSpPr', {}, tag('p:cNvPr', { id: 2, name: 'Slide Image Placeholder 1' }), tag('p:cNvSpPr', {}, tag('a:spLocks', { noGrp: 1, noRot: 1, noChangeAspect: 1 })), tag('p:nvPr', {}, tag('p:ph', { type: 'sldImg', idx: 2 }))),
          tag('p:spPr', {}, tag('a:xfrm', {}, tag('a:off', { x: 685800, y: 1143000 }), tag('a:ext', { cx: 5486400, cy: Math.round((5486400 * size.height) / size.width) })), tag('a:prstGeom', { prst: 'rect' }, tag('a:avLst')), tag('a:noFill'), tag('a:ln', { w: 12700 }, tag('a:solidFill', {}, tag('a:prstClr', { val: 'black' }))))),
        tag('p:sp', {}, tag('p:nvSpPr', {}, tag('p:cNvPr', { id: 3, name: 'Notes Placeholder 2' }), tag('p:cNvSpPr', {}, tag('a:spLocks', { noGrp: 1 })), tag('p:nvPr', {}, tag('p:ph', { type: 'body', sz: 'quarter', idx: 3 }))),
          tag('p:spPr', {}, tag('a:xfrm', {}, tag('a:off', { x: 685800, y: 4400550 }), tag('a:ext', { cx: 5486400, cy: 3600450 })), tag('a:prstGeom', { prst: 'rect' }, tag('a:avLst'))),
          tag('p:txBody', {}, tag('a:bodyPr', { vert: 'horz', lIns: 91440, tIns: 45720, rIns: 91440, bIns: 45720, rtlCol: 0 }), tag('a:lstStyle'), tag('a:p', {}, tag('a:endParaRPr', { lang: 'ja-JP' })))))),
    tag('p:clrMap', { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' }),
    tag('p:notesStyle', {}, tag('a:lvl1pPr', { marL: 0, algn: 'l', defTabSz: 914400, rtl: 0, eaLnBrk: 1, latinLnBrk: 0, hangingPunct: 1 }, tag('a:defRPr', { sz: 1200, kern: 1200 }, tag('a:solidFill', {}, tag('a:schemeClr', { val: 'tx1' })), fontFaces('+minor')))));
}

function notesSlideXml(text) {
  return XML_HEAD + tag('p:notes', nsAttrs,
    tag('p:cSld', {}, tag('p:spTree', {}, spTreeStart(),
      tag('p:sp', {}, tag('p:nvSpPr', {}, tag('p:cNvPr', { id: 2, name: 'Slide Image Placeholder 1' }), tag('p:cNvSpPr', {}, tag('a:spLocks', { noGrp: 1, noRot: 1, noChangeAspect: 1 })), tag('p:nvPr', {}, tag('p:ph', { type: 'sldImg' }))), tag('p:spPr')),
      tag('p:sp', {}, tag('p:nvSpPr', {}, tag('p:cNvPr', { id: 3, name: 'Notes Placeholder 2' }), tag('p:cNvSpPr', {}, tag('a:spLocks', { noGrp: 1 })), tag('p:nvPr', {}, tag('p:ph', { type: 'body', idx: 1 }))), tag('p:spPr'),
        tag('p:txBody', {}, tag('a:bodyPr'), tag('a:lstStyle'), text.split('\n').map((line) => tag('a:p', {}, line ? tag('a:r', {}, tag('a:rPr', { lang: 'ja-JP', altLang: 'en-US', dirty: 0 }), tag('a:t', {}, esc(line))) : '', tag('a:endParaRPr', { lang: 'ja-JP' }))))))),
    tag('p:clrMapOvr', {}, tag('a:masterClrMapping')));
}

const relsXml = (rels) => XML_HEAD + tag('Relationships', { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
  rels.map(([id, type, target, mode]) => tag('Relationship', { Id: id, Type: type.startsWith('http') ? type : `${REL}/${type}`, Target: target, TargetMode: mode })));

// ---------------------------------------------------------------- パッケージ全体
/** プレゼンテーション → { パス: 文字列 | Uint8Array } */
export function buildPptxFiles(pres, { title = '' } = {}) {
  const th = themeOf(pres);
  const size = { width: pres.width, height: pres.height };
  const files = {};
  const overrides = [];
  const media = [];
  const mediaExts = new Set();
  const layoutIds = LAYOUTS.map((l) => l.id);
  const hasNotes = pres.slides.some((s) => s.notes && s.notes.trim());

  pres.slides.forEach((slide, i) => {
    const n = i + 1;
    const rels = [['rId1', 'slideLayout', `../slideLayouts/slideLayout${Math.max(0, layoutIds.indexOf(slide.layout)) + 1}.xml`]];
    const imageRel = (img) => {
      const ext = IMAGE_EXT[img.mime] || 'png';
      mediaExts.add(ext);
      const name = `image${media.length + 1}.${ext}`;
      media.push([name, img.data]);
      const id = `rId${rels.length + 1}`;
      rels.push([id, 'image', `../media/${name}`]);
      return id;
    };
    const links = new Map();
    const linkRelFn = (url) => {
      if (!links.has(url)) {
        const id = `rId${rels.length + 1}`;
        rels.push([id, 'hyperlink', url, 'External']);
        links.set(url, id);
      }
      return links.get(url);
    };
    files[`ppt/slides/slide${n}.xml`] = slideXml(pres, slide, i, { image: imageRel, link: linkRelFn });
    if (hasNotes && slide.notes && slide.notes.trim()) {
      rels.push([`rId${rels.length + 1}`, 'notesSlide', `../notesSlides/notesSlide${n}.xml`]);
      files[`ppt/notesSlides/notesSlide${n}.xml`] = notesSlideXml(slide.notes);
      files[`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`] = relsXml([['rId1', 'notesMaster', '../notesMasters/notesMaster1.xml'], ['rId2', 'slide', `../slides/slide${n}.xml`]]);
      overrides.push([`/ppt/notesSlides/notesSlide${n}.xml`, `${CT}.notesSlide+xml`]);
    }
    files[`ppt/slides/_rels/slide${n}.xml.rels`] = relsXml(rels);
    overrides.push([`/ppt/slides/slide${n}.xml`, `${CT}.slide+xml`]);
  });
  for (const [name, data] of media) files[`ppt/media/${name}`] = data;

  files['ppt/theme/theme1.xml'] = themeXml(th);
  overrides.push(['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml']);
  files['ppt/slideMasters/slideMaster1.xml'] = masterXml(size, layoutIds.length);
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = relsXml([
    ...layoutIds.map((_, i) => [`rId${i + 1}`, 'slideLayout', `../slideLayouts/slideLayout${i + 1}.xml`]),
    [`rId${layoutIds.length + 1}`, 'theme', '../theme/theme1.xml'],
  ]);
  overrides.push(['/ppt/slideMasters/slideMaster1.xml', `${CT}.slideMaster+xml`]);
  layoutIds.forEach((l, i) => {
    files[`ppt/slideLayouts/slideLayout${i + 1}.xml`] = layoutXml(l, size);
    files[`ppt/slideLayouts/_rels/slideLayout${i + 1}.xml.rels`] = relsXml([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]);
    overrides.push([`/ppt/slideLayouts/slideLayout${i + 1}.xml`, `${CT}.slideLayout+xml`]);
  });
  if (hasNotes) {
    files['ppt/notesMasters/notesMaster1.xml'] = notesMasterXml(size);
    files['ppt/notesMasters/_rels/notesMaster1.xml.rels'] = relsXml([['rId1', 'theme', '../theme/theme2.xml']]);
    files['ppt/theme/theme2.xml'] = themeXml(th, 'Notes');
    overrides.push(['/ppt/notesMasters/notesMaster1.xml', `${CT}.notesMaster+xml`], ['/ppt/theme/theme2.xml', 'application/vnd.openxmlformats-officedocument.theme+xml']);
  }

  const presRels = [['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml']];
  const sldIds = pres.slides.map((_, i) => {
    const id = `rId${presRels.length + 1}`;
    presRels.push([id, 'slide', `slides/slide${i + 1}.xml`]);
    return tag('p:sldId', { id: 256 + i, 'r:id': id });
  });
  let notesMasterRel = null;
  if (hasNotes) { notesMasterRel = `rId${presRels.length + 1}`; presRels.push([notesMasterRel, 'notesMaster', 'notesMasters/notesMaster1.xml']); }
  const n0 = presRels.length;
  presRels.push([`rId${n0 + 1}`, 'presProps', 'presProps.xml'], [`rId${n0 + 2}`, 'viewProps', 'viewProps.xml'], [`rId${n0 + 3}`, 'theme', 'theme/theme1.xml'], [`rId${n0 + 4}`, 'tableStyles', 'tableStyles.xml']);
  const wide = Math.abs(pres.width / pres.height - 16 / 9) < 0.01;
  const std = Math.abs(pres.width / pres.height - 4 / 3) < 0.01;
  files['ppt/presentation.xml'] = XML_HEAD + tag('p:presentation', { ...nsAttrs, saveSubsetFonts: 1 },
    tag('p:sldMasterIdLst', {}, tag('p:sldMasterId', { id: 2147483648, 'r:id': 'rId1' })),
    notesMasterRel ? tag('p:notesMasterIdLst', {}, tag('p:notesMasterId', { 'r:id': notesMasterRel })) : '',
    tag('p:sldIdLst', {}, sldIds),
    tag('p:sldSz', { cx: emu(pres.width), cy: emu(pres.height), type: std ? 'screen4x3' : wide ? undefined : 'custom' }),
    tag('p:notesSz', { cx: 6858000, cy: 9144000 }),
    tag('p:defaultTextStyle', {}, tag('a:defPPr', {}, tag('a:defRPr', { lang: 'ja-JP' })), lvlPPr(0, { size: 18, bullet: false })));
  files['ppt/_rels/presentation.xml.rels'] = relsXml(presRels);
  overrides.push(['/ppt/presentation.xml', `${CT}.presentation.main+xml`]);
  files['ppt/presProps.xml'] = XML_HEAD + tag('p:presentationPr', nsAttrs);
  files['ppt/viewProps.xml'] = XML_HEAD + tag('p:viewPr', nsAttrs,
    tag('p:normalViewPr', {}, tag('p:restoredLeft', { sz: 15620 }), tag('p:restoredTop', { sz: 94660 })),
    tag('p:slideViewPr', {}, tag('p:cSldViewPr', {}, tag('p:cViewPr', {}, tag('p:scale', {}, tag('a:sx', { n: 100, d: 100 }), tag('a:sy', { n: 100, d: 100 })), tag('p:origin', { x: 0, y: 0 })))),
    tag('p:gridSpacing', { cx: 72008, cy: 72008 }));
  files['ppt/tableStyles.xml'] = XML_HEAD + tag('a:tblStyleLst', { 'xmlns:a': NS.a, def: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}' });
  overrides.push(['/ppt/presProps.xml', `${CT}.presProps+xml`], ['/ppt/viewProps.xml', `${CT}.viewProps+xml`], ['/ppt/tableStyles.xml', `${CT}.tableStyles+xml`]);

  const firstTitle = pres.slides[0]?.objects.find((o) => o.ph === 'title' || o.ph === 'ctrTitle');
  const docTitle = title || (firstTitle && hasText(firstTitle) ? objText(firstTitle).split('\n')[0] : '');
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files['docProps/core.xml'] = XML_HEAD + tag('cp:coreProperties', {
    'xmlns:cp': 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties', 'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
    'xmlns:dcterms': 'http://purl.org/dc/terms/', 'xmlns:dcmitype': 'http://purl.org/dc/dcmitype/', 'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  }, tag('dc:title', {}, esc(docTitle)), tag('dc:creator', {}, 'PowerMangai'),
  tag('dcterms:created', { 'xsi:type': 'dcterms:W3CDTF' }, now), tag('dcterms:modified', { 'xsi:type': 'dcterms:W3CDTF' }, now));
  files['docProps/app.xml'] = XML_HEAD + tag('Properties', { xmlns: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties', 'xmlns:vt': 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes' },
    tag('Application', {}, 'PowerMangai'), tag('Slides', {}, String(pres.slides.length)), tag('PresentationFormat', {}, wide ? 'ワイド画面' : std ? '画面に合わせる (4:3)' : 'ユーザー設定'));
  overrides.push(['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'], ['/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml']);

  files['_rels/.rels'] = relsXml([
    ['rId1', 'officeDocument', 'ppt/presentation.xml'],
    ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
    ['rId3', 'extended-properties', 'docProps/app.xml'],
  ]);
  const mimeOf = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
  files['[Content_Types].xml'] = XML_HEAD + tag('Types', { xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types' },
    tag('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }),
    tag('Default', { Extension: 'xml', ContentType: 'application/xml' }),
    [...mediaExts].map((ext) => tag('Default', { Extension: ext, ContentType: mimeOf[ext] })),
    overrides.map(([part, ct]) => tag('Override', { PartName: part, ContentType: ct })));
  return files;
}

export async function exportPptx(pres, opts) {
  // [Content_Types].xml を先頭にする（一部のツールが先頭にあることを期待する）
  const files = buildPptxFiles(pres, opts);
  const ordered = { '[Content_Types].xml': files['[Content_Types].xml'], ...files };
  return writeZip(ordered);
}

export { resolveFontFamily };
