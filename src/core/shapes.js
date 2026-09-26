// 図形の形状（パス）。p は CanvasRenderingContext2D 互換（beginPath 後の moveTo / lineTo / bezierCurveTo /
// quadraticCurveTo / ellipse / rect / closePath）。w, h はオブジェクトの幅と高さ。
// 種類名は PowerPoint（OOXML）のプリセット名にそろえている（star → star5 のみ異なる）。

const poly = (p, pts) => {
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
};

function star(p, w, h, n, inner) {
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const x = cx + Math.cos(a) * (w / 2) * r;
    const y = cy + Math.sin(a) * (h / 2) * r;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath();
}

/** 塗りつぶしに evenodd（穴あき）を使う図形 */
export const EVENODD = new Set(['donut', 'frame']);

/** 図形の外形のパスを作る */
export function buildShape(p, type, w, h) {
  const m = Math.min(w, h);
  switch (type) {
    case 'text':
    case 'rect':
    case 'image':
    case 'table':
    case 'chart':
      p.rect(0, 0, w, h);
      break;
    case 'roundRect': {
      const r = m * 0.1667;
      p.moveTo(r, 0);
      p.lineTo(w - r, 0);
      p.quadraticCurveTo(w, 0, w, r);
      p.lineTo(w, h - r);
      p.quadraticCurveTo(w, h, w - r, h);
      p.lineTo(r, h);
      p.quadraticCurveTo(0, h, 0, h - r);
      p.lineTo(0, r);
      p.quadraticCurveTo(0, 0, r, 0);
      p.closePath();
      break;
    }
    case 'ellipse':
      p.ellipse(w / 2, h / 2, Math.max(w / 2, 0), Math.max(h / 2, 0), 0, 0, Math.PI * 2);
      break;
    case 'triangle': poly(p, [[w / 2, 0], [w, h], [0, h]]); break;
    case 'rtTriangle': poly(p, [[0, 0], [w, h], [0, h]]); break;
    case 'diamond': poly(p, [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]); break;
    case 'parallelogram': { const o = m * 0.25; poly(p, [[o, 0], [w, 0], [w - o, h], [0, h]]); break; }
    case 'trapezoid': { const o = m * 0.25; poly(p, [[o, 0], [w - o, 0], [w, h], [0, h]]); break; }
    case 'pentagon': poly(p, [[w / 2, 0], [w, h * 0.382], [w * 0.809, h], [w * 0.191, h], [0, h * 0.382]]); break;
    case 'hexagon': { const o = m * 0.25; poly(p, [[o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]]); break; }
    case 'octagon': {
      const o = m * 0.2929;
      poly(p, [[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]]);
      break;
    }
    case 'plus': {
      const t = m * 0.25;
      poly(p, [[t, 0], [w - t, 0], [w - t, t], [w, t], [w, h - t], [w - t, h - t], [w - t, h], [t, h], [t, h - t], [0, h - t], [0, t], [t, t]]);
      break;
    }
    case 'donut': {
      const t = m * 0.25;
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      p.moveTo(w / 2 + Math.max(0, w / 2 - t), h / 2);
      p.ellipse(w / 2, h / 2, Math.max(0, w / 2 - t), Math.max(0, h / 2 - t), 0, 0, Math.PI * 2);
      break;
    }
    case 'frame': {
      const t = m * 0.125;
      p.rect(0, 0, w, h);
      p.rect(t, t, Math.max(0, w - 2 * t), Math.max(0, h - 2 * t));
      break;
    }
    case 'heart':
      p.moveTo(w / 2, h * 0.25);
      p.bezierCurveTo(w / 2, -h * 0.05, 0, -h * 0.05, 0, h * 0.3);
      p.bezierCurveTo(0, h * 0.6, w * 0.4, h * 0.75, w / 2, h);
      p.bezierCurveTo(w * 0.6, h * 0.75, w, h * 0.6, w, h * 0.3);
      p.bezierCurveTo(w, -h * 0.05, w / 2, -h * 0.05, w / 2, h * 0.25);
      p.closePath();
      break;
    case 'star': star(p, w, h, 5, 0.382); break;
    case 'star4': star(p, w, h, 4, 0.25); break;
    case 'star6': star(p, w, h, 6, 0.5); break;
    case 'rightArrow': {
      const head = Math.min(w, h * 0.5), t = h * 0.25;
      poly(p, [[0, t], [w - head, t], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h - t], [0, h - t]]);
      break;
    }
    case 'leftArrow': {
      const head = Math.min(w, h * 0.5), t = h * 0.25;
      poly(p, [[w, t], [head, t], [head, 0], [0, h / 2], [head, h], [head, h - t], [w, h - t]]);
      break;
    }
    case 'upArrow': {
      const head = Math.min(h, w * 0.5), t = w * 0.25;
      poly(p, [[t, h], [t, head], [0, head], [w / 2, 0], [w, head], [w - t, head], [w - t, h]]);
      break;
    }
    case 'downArrow': {
      const head = Math.min(h, w * 0.5), t = w * 0.25;
      poly(p, [[t, 0], [t, h - head], [0, h - head], [w / 2, h], [w, h - head], [w - t, h - head], [w - t, 0]]);
      break;
    }
    case 'leftRightArrow': {
      const head = Math.min(w / 2, h * 0.5), t = h * 0.25;
      poly(p, [[0, h / 2], [head, 0], [head, t], [w - head, t], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h - t], [head, h - t], [head, h]]);
      break;
    }
    case 'chevron': { const o = m * 0.5; poly(p, [[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h], [o, h / 2]]); break; }
    case 'homePlate': { const o = m * 0.5; poly(p, [[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h]]); break; }
    case 'wedgeRectCallout':
      poly(p, [[0, 0], [w, 0], [w, h], [w * 0.42, h], [w * 0.2, h * 1.3], [w * 0.25, h], [0, h]]);
      break;
    case 'wedgeEllipseCallout': {
      const a1 = (110 * Math.PI) / 180, a2 = (135 * Math.PI) / 180;
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, a2, a1 + Math.PI * 2);
      p.lineTo(w * 0.1, h * 1.25);
      p.closePath();
      break;
    }
    case 'cloud': {
      const n = 11, cx = w / 2, cy = h / 2;
      const pt = (i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * w * 0.42, cy + Math.sin(a) * h * 0.4]; };
      p.moveTo(...pt(0));
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * Math.PI * 2;
        const [x2, y2] = pt(i + 1);
        p.quadraticCurveTo(cx + Math.cos(a) * w * 0.62, cy + Math.sin(a) * h * 0.6, x2, y2);
      }
      p.closePath();
      break;
    }
    case 'can': {
      const ry = Math.min(h / 2, m * 0.125);
      p.moveTo(0, ry);
      p.lineTo(0, h - ry);
      p.ellipse(w / 2, h - ry, w / 2, ry, 0, Math.PI, 0, true);
      p.lineTo(w, ry);
      p.ellipse(w / 2, ry, w / 2, ry, 0, 0, Math.PI, true);
      p.closePath();
      break;
    }
    case 'cube': { const d = m * 0.25; poly(p, [[0, d], [d, 0], [w, 0], [w, h - d], [w - d, h], [0, h]]); break; }
    case 'smileyFace': p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'lightningBolt':
      poly(p, [[0.39, 0], [0.61, 0.29], [0.52, 0.33], [0.77, 0.58], [0.69, 0.62], [1, 1], [0.45, 0.7], [0.55, 0.66], [0.2, 0.44], [0.3, 0.39], [0, 0.18]].map(([x, y]) => [x * w, y * h]));
      break;
    case 'line':
    case 'arrow':
    case 'doubleArrow':
      p.moveTo(0, 0);
      p.lineTo(w, h);
      break;
    default:
      p.rect(0, 0, w, h);
  }
}

/** 外形の上に線だけで描く細部（直方体の稜線・円柱の上面・スマイルの顔） */
export function buildDetail(p, type, w, h) {
  const m = Math.min(w, h);
  switch (type) {
    case 'cube': {
      const d = m * 0.25;
      p.moveTo(0, d); p.lineTo(w - d, d); p.lineTo(w, 0);
      p.moveTo(w - d, d); p.lineTo(w - d, h);
      return true;
    }
    case 'can': {
      const ry = Math.min(h / 2, m * 0.125);
      p.moveTo(w, ry);
      p.ellipse(w / 2, ry, w / 2, ry, 0, 0, Math.PI);
      return true;
    }
    case 'smileyFace':
      p.moveTo(w * 0.38, h * 0.36);
      p.ellipse(w * 0.35, h * 0.36, w * 0.03, h * 0.05, 0, 0, Math.PI * 2);
      p.moveTo(w * 0.68, h * 0.36);
      p.ellipse(w * 0.65, h * 0.36, w * 0.03, h * 0.05, 0, 0, Math.PI * 2);
      p.moveTo(w * 0.28, h * 0.66);
      p.quadraticCurveTo(w / 2, h * 0.86, w * 0.72, h * 0.66);
      return true;
    default:
      return false;
  }
}

/** 図形に文字を入れるときの文字領域（外形の内側）。{ x, y, w, h } の比率ではなく実寸 */
export function textRect(type, w, h) {
  const m = Math.min(w, h);
  switch (type) {
    case 'ellipse': case 'smileyFace': case 'wedgeEllipseCallout':
      return { x: w * 0.146, y: h * 0.146, w: w * 0.708, h: h * 0.708 };
    case 'triangle': return { x: w * 0.25, y: h * 0.5, w: w * 0.5, h: h * 0.5 };
    case 'diamond': return { x: w * 0.25, y: h * 0.25, w: w * 0.5, h: h * 0.5 };
    case 'can': { const ry = Math.min(h / 2, m * 0.125); return { x: 0, y: ry * 2, w, h: Math.max(0, h - ry * 3) }; }
    case 'cube': { const d = m * 0.25; return { x: 0, y: d, w: w - d, h: h - d }; }
    default: return { x: 0, y: 0, w, h };
  }
}
