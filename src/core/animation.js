// 画面切り替えとアニメーション（開始効果）。DOM に依存しない計算だけを行う。

export const TRANSITIONS = [
  { id: 'none', label: 'なし' },
  { id: 'fade', label: 'フェード' },
  { id: 'push', label: 'プッシュ', directions: ['fromRight', 'fromLeft', 'fromBottom', 'fromTop'] },
  { id: 'wipe', label: 'ワイプ', directions: ['fromRight', 'fromLeft', 'fromBottom', 'fromTop'] },
  { id: 'split', label: 'スプリット' },
  { id: 'cover', label: 'カバー', directions: ['fromRight', 'fromLeft', 'fromBottom', 'fromTop'] },
  { id: 'uncover', label: 'アンカバー', directions: ['fromRight', 'fromLeft', 'fromBottom', 'fromTop'] },
  { id: 'zoom', label: 'ズーム' },
];

export const EFFECTS = [
  { id: 'appear', label: 'アピール' },
  { id: 'fade', label: 'フェード' },
  { id: 'flyIn', label: 'スライドイン', directions: ['fromBottom', 'fromLeft', 'fromRight', 'fromTop'] },
  { id: 'wipe', label: 'ワイプ', directions: ['fromBottom', 'fromLeft', 'fromRight', 'fromTop'] },
  { id: 'zoom', label: 'ズーム' },
  { id: 'floatIn', label: 'フロートイン' },
];

/** 効果の既定の継続時間（秒） */
export function defaultDuration(effect) { return effect === 'appear' ? 0.01 : 0.5; }

export const DIRECTION_LABELS = { fromBottom: '下から', fromTop: '上から', fromLeft: '左から', fromRight: '右から' };
export const TRIGGER_LABELS = { click: 'クリック時', with: '直前の動作と同時', after: '直前の動作の後' };

const ease = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - (1 - p) ** 3);

/**
 * アニメーションをクリックごとのステップに分ける。
 * 戻り値: [{ auto, items: [{ anim, start, end }] }]（時間は秒、ステップ内の相対時間）
 * auto = true のステップは、スライドが表示されたときに自動で再生される（先頭が「クリック時」でない場合）。
 */
export function buildSteps(animations) {
  const steps = [];
  let cur = null;
  let prevStart = 0;
  let prevEnd = 0;
  for (const anim of animations) {
    const dur = Math.max(0.01, anim.duration ?? 0.5);
    if (anim.trigger === 'click' || !cur) {
      cur = { auto: anim.trigger !== 'click', items: [] };
      steps.push(cur);
      prevStart = 0;
      prevEnd = 0;
    }
    const start = anim.trigger === 'after' ? prevEnd : anim.trigger === 'with' ? prevStart : 0;
    cur.items.push({ anim, start, end: start + dur });
    prevStart = start;
    prevEnd = Math.max(prevEnd, start + dur);
  }
  return steps;
}

export function stepDuration(step) {
  return step.items.reduce((m, it) => Math.max(m, it.end), 0);
}

/**
 * 1 つの効果の進み具合 p（0〜1）での見た目。
 * 戻り値: { alpha, dx, dy, scale, clip }（clip はスライド座標の矩形）
 */
export function effectStyle(anim, o, p, size) {
  const e = ease(p);
  const dir = anim.direction || 'fromBottom';
  switch (anim.effect) {
    case 'appear':
      return p > 0 ? {} : { hidden: true };
    case 'fade':
      return { alpha: e };
    case 'flyIn': {
      // スライドの外から元の位置へ
      const off = {
        fromBottom: { dy: size.height - o.y },
        fromTop: { dy: -(o.y + o.h) },
        fromLeft: { dx: -(o.x + o.w) },
        fromRight: { dx: size.width - o.x },
      }[dir];
      return { dx: (off.dx || 0) * (1 - e), dy: (off.dy || 0) * (1 - e) };
    }
    case 'wipe': {
      const m = 4; // 回転や線幅で端が切れないよう少し広げる
      const r = { x: o.x - m, y: o.y - m, w: o.w + 2 * m, h: o.h + 2 * m };
      if (dir === 'fromBottom') return { clip: { x: r.x, y: r.y + r.h * (1 - e), w: r.w, h: r.h * e } };
      if (dir === 'fromTop') return { clip: { x: r.x, y: r.y, w: r.w, h: r.h * e } };
      if (dir === 'fromLeft') return { clip: { x: r.x, y: r.y, w: r.w * e, h: r.h } };
      return { clip: { x: r.x + r.w * (1 - e), y: r.y, w: r.w * e, h: r.h } };
    }
    case 'zoom':
      return { alpha: e, scale: 0.1 + 0.9 * e };
    case 'floatIn':
      return { alpha: e, dy: 40 * (1 - e) };
    default:
      return {};
  }
}

/**
 * スライドショー中のオブジェクトの見た目を返す関数を作る。
 * done: 再生が終わったステップ数、playing: 再生中のステップ番号（なければ null）、t: 再生中のステップの経過秒
 */
export function objectStyler(slide, steps, done, playing, t, size) {
  const stepOf = new Map();
  steps.forEach((st, si) => st.items.forEach((it) => stepOf.set(it.anim.target, { si, it })));
  const byId = new Map(slide.objects.map((o) => [o.id, o]));
  // グループは先頭のメンバーのアニメーションに従い、効果の範囲はグループ全体の外接矩形
  const groupAnim = new Map();
  const groupBox = new Map();
  for (const o of slide.objects) {
    if (o.groupId && stepOf.has(o.id) && !groupAnim.has(o.groupId)) groupAnim.set(o.groupId, stepOf.get(o.id));
    if (o.groupId) {
      const b = groupBox.get(o.groupId);
      if (!b) groupBox.set(o.groupId, { x: o.x, y: o.y, x2: o.x + o.w, y2: o.y + o.h });
      else Object.assign(b, { x: Math.min(b.x, o.x), y: Math.min(b.y, o.y), x2: Math.max(b.x2, o.x + o.w), y2: Math.max(b.y2, o.y + o.h) });
    }
  }
  const geometry = (o) => {
    const b = o.groupId && groupBox.get(o.groupId);
    return b ? { x: b.x, y: b.y, w: b.x2 - b.x, h: b.y2 - b.y } : o;
  };
  return (o) => {
    const entry = stepOf.get(o.id) || (o.groupId ? groupAnim.get(o.groupId) : null);
    if (!entry) return null;
    const { si, it } = entry;
    if (si < done) return null;
    if (si === playing) {
      if (t < it.start) return { hidden: true };
      const p = Math.min(1, (t - it.start) / (it.end - it.start));
      return effectStyle(it.anim, geometry(byId.get(it.anim.target) || o), p, size);
    }
    return { hidden: true };
  };
}

/**
 * 画面切り替えの 1 フレーム。p: 0〜1、W, H: キャンバスの大きさ。
 * 戻り値: 描く順のレイヤー [{ slide: 'prev' | 'next', dx, dy, alpha, scale, clip }]
 */
export function transitionFrame(tr, p, W, H) {
  const e = ease(p);
  const dir = tr.direction || 'fromRight';
  const v = { fromRight: [1, 0], fromLeft: [-1, 0], fromBottom: [0, 1], fromTop: [0, -1] }[dir] || [1, 0];
  const prev = (x = {}) => ({ slide: 'prev', ...x });
  const next = (x = {}) => ({ slide: 'next', ...x });
  switch (tr.type) {
    case 'fade': return [prev(), next({ alpha: e })];
    case 'push': return [prev({ dx: -v[0] * W * e, dy: -v[1] * H * e }), next({ dx: v[0] * W * (1 - e), dy: v[1] * H * (1 - e) })];
    case 'cover': return [prev(), next({ dx: v[0] * W * (1 - e), dy: v[1] * H * (1 - e) })];
    case 'uncover': return [next(), prev({ dx: -v[0] * W * e, dy: -v[1] * H * e })];
    case 'wipe': {
      const clip = {
        fromRight: { x: W * (1 - e), y: 0, w: W * e, h: H },
        fromLeft: { x: 0, y: 0, w: W * e, h: H },
        fromBottom: { x: 0, y: H * (1 - e), w: W, h: H * e },
        fromTop: { x: 0, y: 0, w: W, h: H * e },
      }[dir];
      return [prev(), next({ clip })];
    }
    case 'split': return [prev(), next({ clip: { x: (W / 2) * (1 - e), y: 0, w: W * e, h: H } })];
    case 'zoom': return [prev(), next({ alpha: e, scale: 0.3 + 0.7 * e })];
    default: return [next()];
  }
}
