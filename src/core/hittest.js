// マウス操作の幾何計算（DOM に依存しない）: 図形の当たり判定・ハンドル・サイズ変更・回転。
// 座標はすべてスライドの座標（pt）。
import { isLine } from './model.js';

const rad = (deg) => (deg * Math.PI) / 180;

/** 点 (px, py) を中心 (cx, cy) のまわりに deg 度回転 */
export function rotatePoint(px, py, cx, cy, deg) {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

/** 図形の回転を戻した座標（図形の中心が原点） */
function toLocal(o, x, y) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const p = rotatePoint(x, y, cx, cy, -(o.rotation || 0));
  return { x: p.x - cx, y: p.y - cy };
}

/** 線の両端（スライドの座標）: [始点, 終点] */
export function lineEnds(o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const fx = o.flipH ? -1 : 1, fy = o.flipV ? -1 : 1;
  const a = rotatePoint(cx - (o.w / 2) * fx, cy - (o.h / 2) * fy, cx, cy, o.rotation || 0);
  const b = rotatePoint(cx + (o.w / 2) * fx, cy + (o.h / 2) * fy, cx, cy, o.rotation || 0);
  return [a, b];
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 点が図形に当たるか（tol: 許容する距離） */
export function hitsObject(o, x, y, tol = 3) {
  if (isLine(o)) {
    const [a, b] = lineEnds(o);
    return distToSegment({ x, y }, a, b) <= tol + (o.strokeWidth || 1) / 2;
  }
  const p = toLocal(o, x, y);
  return Math.abs(p.x) <= o.w / 2 + tol && Math.abs(p.y) <= o.h / 2 + tol;
}

/** 点にある一番手前のオブジェクト（非表示は除く）。無ければ null */
export function objectAt(slide, x, y, tol = 3) {
  for (let i = slide.objects.length - 1; i >= 0; i--) {
    const o = slide.objects[i];
    if (!o.hidden && hitsObject(o, x, y, tol)) return o;
  }
  return null;
}

/** 矩形（スライドの座標）に完全に入るオブジェクト */
export function objectsInRect(slide, r) {
  const x1 = Math.min(r.x1, r.x2), x2 = Math.max(r.x1, r.x2), y1 = Math.min(r.y1, r.y2), y2 = Math.max(r.y1, r.y2);
  return slide.objects.filter((o) => {
    if (o.hidden) return false;
    const pts = isLine(o) ? lineEnds(o) : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
      rotatePoint(o.x + o.w / 2 + (sx * o.w) / 2, o.y + o.h / 2 + (sy * o.h) / 2, o.x + o.w / 2, o.y + o.h / 2, o.rotation || 0));
    return pts.every((p) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
  });
}

// ---------------------------------------------------------------- ハンドル
/** ハンドルの名前 → 図形の中心から見た向き（-1 / 0 / 1） */
export const HANDLES = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1], w: [-1, 0], e: [1, 0], sw: [-1, 1], s: [0, 1], se: [1, 1],
};

/**
 * 点にあるハンドル。scale: 画面の 1pt あたりのピクセル（ハンドルの大きさは画面上で一定）。
 * 線は 'start' / 'end'、それ以外は HANDLES の名前か 'rotate'。無ければ null
 */
export function handleAt(o, x, y, scale) {
  const r = 6 / scale; // 画面で 6px
  if (isLine(o)) {
    const [a, b] = lineEnds(o);
    if (Math.hypot(x - b.x, y - b.y) <= r) return 'end';
    if (Math.hypot(x - a.x, y - a.y) <= r) return 'start';
    return null;
  }
  const p = toLocal(o, x, y);
  // 回転ハンドルは上辺の中央から画面で 18px 上
  if (Math.hypot(p.x, p.y - (-o.h / 2 - 18 / scale)) <= r + 1 / scale) return 'rotate';
  for (const [name, [sx, sy]] of Object.entries(HANDLES)) {
    if (Math.hypot(p.x - (sx * o.w) / 2, p.y - (sy * o.h) / 2) <= r) return name;
  }
  return null;
}

/**
 * ハンドルでのサイズ変更。orig: 開始時の図形、(dx, dy): マウスの移動量（スライドの座標）。
 * keepAspect: 縦横比を保つ（Shift / 図のロック）。戻り値: { x, y, w, h }（反対側の辺・角は動かない）
 */
export function resizeByHandle(orig, handle, dx, dy, { keepAspect = false, min = 1 } = {}) {
  const [sx, sy] = HANDLES[handle];
  const rot = orig.rotation || 0;
  // 移動量を図形の向きに合わせる
  const l = rotatePoint(dx, dy, 0, 0, -rot);
  let w = sx ? Math.max(min, orig.w + sx * l.x) : orig.w;
  let h = sy ? Math.max(min, orig.h + sy * l.y) : orig.h;
  if (keepAspect && orig.w > 0 && orig.h > 0) {
    // 角は大きく変わった方向に合わせる（内側へのドラッグでも縮む）。辺はもう一方も同じ比率で変える
    const kx = w / orig.w, ky = h / orig.h;
    const k = !sy ? kx : !sx ? ky : Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky;
    w = Math.max(min, orig.w * k);
    h = Math.max(min, orig.h * k);
  }
  // 反対側（アンカー）の位置を保つ
  const cx = orig.x + orig.w / 2, cy = orig.y + orig.h / 2;
  const anchor = rotatePoint(cx - (sx * orig.w) / 2, cy - (sy * orig.h) / 2, cx, cy, rot);
  const off = rotatePoint((sx * w) / 2, (sy * h) / 2, 0, 0, rot);
  const ncx = anchor.x + off.x, ncy = anchor.y + off.y;
  return { x: ncx - w / 2, y: ncy - h / 2, w, h };
}

/** 線の端点を動かす。which: 'start' | 'end'、(px, py): 新しい位置。戻り値: { x, y, w, h, flipH, flipV, rotation: 0 } */
export function moveLineEnd(o, which, px, py) {
  const [a, b] = lineEnds(o);
  const s = which === 'start' ? { x: px, y: py } : a;
  const e = which === 'end' ? { x: px, y: py } : b;
  return {
    x: Math.min(s.x, e.x), y: Math.min(s.y, e.y), w: Math.abs(e.x - s.x), h: Math.abs(e.y - s.y),
    flipH: e.x < s.x, flipV: e.y < s.y, rotation: 0,
  };
}

/** 回転ハンドル: 中心から見た点の向き → 回転角（上向きが 0°）。snap なら 15° 刻み */
export function rotationFromPoint(o, x, y, snap = false) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  let deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
  if (snap) deg = Math.round(deg / 15) * 15;
  return ((Math.round(deg) % 360) + 360) % 360;
}
