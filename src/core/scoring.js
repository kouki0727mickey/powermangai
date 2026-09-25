// 作成したスライドと完成形（お手本）の比較・採点
import { SHAPE_LABELS, hasText } from './model.js';
import { colorName, sameColor } from './colors.js';

export const POS_TOLERANCE = 10;
export const SIZE_TOLERANCE = 10;
export const ROT_TOLERANCE = 3;

const normText = (t) => String(t ?? '').replace(/\r/g, '').replace(/[ \t　]+/g, ' ').trim();

function describe(o) {
  const label = SHAPE_LABELS[o.type] || o.type;
  const text = normText(o.text);
  return text ? `${label}「${text.length > 12 ? `${text.slice(0, 12)}…` : text}」` : label;
}

function matchCost(t, u) {
  let cost = 0;
  if (t.type !== u.type) cost += 1000;
  if (normText(t.text) !== normText(u.text)) cost += normText(t.text) && normText(u.text) ? 300 : 500;
  const dx = t.x + t.w / 2 - (u.x + u.w / 2);
  const dy = t.y + t.h / 2 - (u.y + u.h / 2);
  cost += Math.hypot(dx, dy) / 4;
  return cost;
}

/** お手本の各オブジェクトに、作成側のオブジェクトを 1 対 1 で割り当てる（コストの小さい順に貪欲法） */
export function matchObjects(targets, users) {
  const pairs = [];
  targets.forEach((t, ti) => users.forEach((u, ui) => pairs.push({ ti, ui, cost: matchCost(t, u) })));
  pairs.sort((a, b) => a.cost - b.cost);
  const tUsed = new Set(), uUsed = new Set();
  const map = new Array(targets.length).fill(-1);
  for (const p of pairs) {
    if (tUsed.has(p.ti) || uUsed.has(p.ui)) continue;
    // 種類が違うものは対応付けない
    if (targets[p.ti].type !== users[p.ui].type) continue;
    tUsed.add(p.ti); uUsed.add(p.ui);
    map[p.ti] = p.ui;
  }
  return map;
}

/** 1 つのオブジェクトについてのチェック項目 [{ ok, message, hint }] */
function checkObject(t, u) {
  const checks = [];
  const name = describe(t);
  const add = (ok, message, hint) => checks.push({ ok, message: `${name}: ${message}`, hint });

  if (hasText(t)) {
    add(normText(t.text) === normText(u.text),
      normText(t.text) === normText(u.text) ? '文字 OK' : `文字が違います（「${normText(u.text)}」→「${normText(t.text)}」）`,
      'Enter / F2 で編集、Esc で終了');
  }
  const posOk = Math.abs(t.x - u.x) <= POS_TOLERANCE && Math.abs(t.y - u.y) <= POS_TOLERANCE;
  add(posOk, posOk ? '位置 OK' : `位置が違います（x ${Math.round(u.x)}→${t.x}, y ${Math.round(u.y)}→${t.y}）`,
    '矢印キーで移動（Ctrl+矢印で微調整）、Alt → H → G → A で配置');
  const sizeOk = Math.abs(t.w - u.w) <= SIZE_TOLERANCE && Math.abs(t.h - u.h) <= SIZE_TOLERANCE;
  add(sizeOk, sizeOk ? 'サイズ OK' : `サイズが違います（幅 ${Math.round(u.w)}→${t.w}, 高さ ${Math.round(u.h)}→${t.h}）`,
    'Shift+矢印でサイズ変更、Alt → J → D → W / H で数値指定');
  if (t.rotation || u.rotation) {
    const diff = Math.abs((((t.rotation - u.rotation) % 360) + 540) % 360 - 180);
    const ok = diff <= ROT_TOLERANCE;
    add(ok, ok ? '回転 OK' : `回転が違います（${u.rotation}°→${t.rotation}°）`, 'Alt+← / → で 15° 回転、Alt → H → G → O で 90°');
  }
  if ((t.type !== 'line' && t.type !== 'text') || t.fill || u.fill) {
    const ok = sameColor(t.fill, u.fill);
    add(ok, ok ? '塗りつぶし OK' : `塗りつぶしが違います（${colorName(u.fill)}→${colorName(t.fill)}）`, 'Alt → H → S → F');
  }
  if (t.type === 'line' || t.stroke || u.stroke) {
    const ok = sameColor(t.stroke, u.stroke);
    add(ok, ok ? '枠線 OK' : `枠線の色が違います（${colorName(u.stroke)}→${colorName(t.stroke)}）`, 'Alt → H → S → O');
  }
  if (hasText(t) && normText(t.text)) {
    const f = t.font, g = u.font;
    const sizeOkF = Math.abs(f.size - g.size) < 0.5;
    add(sizeOkF, sizeOkF ? 'フォント サイズ OK' : `フォント サイズが違います（${g.size}→${f.size}）`, 'Ctrl+Shift+> / < 、Alt → H → F → S');
    add(f.bold === g.bold, f.bold === g.bold ? '太字 OK' : `太字を${f.bold ? '設定' : '解除'}してください`, 'Ctrl+B');
    add(f.italic === g.italic, f.italic === g.italic ? '斜体 OK' : `斜体を${f.italic ? '設定' : '解除'}してください`, 'Ctrl+I');
    add(f.underline === g.underline, f.underline === g.underline ? '下線 OK' : `下線を${f.underline ? '設定' : '解除'}してください`, 'Ctrl+U');
    add(sameColor(f.color, g.color), sameColor(f.color, g.color) ? '文字の色 OK' : `文字の色が違います（${colorName(g.color)}→${colorName(f.color)}）`, 'Alt → H → F → C');
    const alignNames = { left: '左揃え', center: '中央揃え', right: '右揃え', justify: '両端揃え' };
    add(t.align === u.align, t.align === u.align ? '文字の配置 OK' : `文字の配置が違います（${alignNames[u.align]}→${alignNames[t.align]}）`, 'Ctrl+L / E / R / J');
  }
  return checks;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function compareSlide(target, user, slideNo) {
  const checks = [];
  const prefix = `スライド ${slideNo}`;
  const tObjs = target.objects;
  const uObjs = user ? user.objects : [];
  // 空のプレースホルダーは採点対象外（PowerPoint でもスライドショーでは表示されない）
  const isEmptyPlaceholder = (o) => o.type === 'text' && !normText(o.text) && !o.fill && !o.stroke;
  const tList = tObjs.filter((o) => !isEmptyPlaceholder(o));
  const uList = uObjs.filter((o) => !isEmptyPlaceholder(o));
  const map = matchObjects(tList, uList);

  tList.forEach((t, i) => {
    if (map[i] === -1) {
      const n = checkObject(t, t).length;
      checks.push({ ok: false, weight: n, message: `${prefix}: ${describe(t)} がありません`, hint: insertHint(t) });
    } else {
      for (const c of checkObject(t, uList[map[i]])) checks.push({ ...c, message: `${prefix}: ${c.message}` });
    }
  });

  const matchedUsers = new Set(map.filter((m) => m !== -1));
  uList.forEach((u, ui) => {
    if (!matchedUsers.has(ui)) {
      checks.push({ ok: false, weight: 2, message: `${prefix}: 不要な ${describe(u)} があります`, hint: 'Tab で選択して Delete' });
    }
  });

  // グループ: お手本で同じグループのものは、作成側でも同じグループであること
  const groups = new Map();
  tList.forEach((t, i) => {
    if (!t.groupId) return;
    if (!groups.has(t.groupId)) groups.set(t.groupId, []);
    groups.get(t.groupId).push(i);
  });
  for (const members of groups.values()) {
    const gids = members.map((i) => (map[i] === -1 ? null : uList[map[i]].groupId));
    const ok = gids.every((g) => g && g === gids[0]) && uList.filter((u) => u.groupId === gids[0]).length === members.length;
    const names = members.map((i) => describe(tList[i])).join('・');
    checks.push({ ok, message: `${prefix}: ${names} のグループ化${ok ? ' OK' : 'ができていません'}`, hint: 'Ctrl+G でグループ化' });
  }
  // 作成側だけでグループ化されている
  const tGrouped = new Set(tList.map((t, i) => (t.groupId ? map[i] : -2)));
  const extraGroups = uList.some((u, ui) => u.groupId && matchedUsers.has(ui) && !tGrouped.has(ui));
  if (extraGroups) checks.push({ ok: false, weight: 1, message: `${prefix}: 不要なグループがあります`, hint: 'Ctrl+Shift+G でグループ解除' });

  // 重なり順: 重なっているオブジェクトの前後関係
  for (let i = 0; i < tList.length; i++) {
    for (let j = i + 1; j < tList.length; j++) {
      if (map[i] === -1 || map[j] === -1 || !overlaps(tList[i], tList[j])) continue;
      const ok = map[i] < map[j];
      checks.push({
        ok,
        message: `${prefix}: ${describe(tList[j])} は ${describe(tList[i])} より前面${ok ? ' OK' : 'にしてください'}`,
        hint: 'Ctrl+Shift+] 最前面へ / Ctrl+Shift+[ 最背面へ',
      });
    }
  }
  return checks;
}

function insertHint(t) {
  if (t.type === 'text') return 'Alt → N → X でテキスト ボックス、またはプレースホルダーに入力';
  return 'Alt → N → S → H で図形を挿入';
}

/**
 * 採点。戻り値: { score: 0-100, passed, total, checks: [{ ok, message, hint, weight }] }
 */
export function scorePresentation(user, target) {
  const checks = [];
  const n = Math.max(target.slides.length, user.slides.length);
  for (let i = 0; i < n; i++) {
    const t = target.slides[i];
    const u = user.slides[i];
    if (!t) {
      checks.push({ ok: false, weight: 2, message: `スライド ${i + 1}: 不要なスライドがあります`, hint: 'F6 でスライド一覧へ移動して Delete' });
      continue;
    }
    if (!u) {
      checks.push({ ok: false, weight: 1, message: `スライド ${i + 1} がありません`, hint: 'Ctrl+M で新しいスライド' });
    }
    checks.push(...compareSlide(t, u, i + 1));
  }
  let passed = 0, total = 0;
  for (const c of checks) {
    const w = c.weight ?? 1;
    total += w;
    if (c.ok) passed += w;
  }
  const score = total === 0 ? 100 : Math.round((passed / total) * 100);
  return { score, passed, total, checks };
}

/**
 * 画像どうしの類似度（0〜100）。a, b は同じサイズの RGBA 配列。
 * 自分で読み込んだお手本画像との比較に使う。
 * 白い背景が一致するだけで高得点にならないよう、白以外（インク）の量で正規化する。
 */
export function imageSimilarity(a, b) {
  if (a.length !== b.length || a.length === 0) throw new Error('画像サイズが一致しません');
  let diff = 0;
  let ink = 0;
  for (let i = 0; i < a.length; i += 4) {
    // 透明部分は白として扱う
    const aa = a[i + 3] / 255, ba = b[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const av = a[i + c] * aa + 255 * (1 - aa);
      const bv = b[i + c] * ba + 255 * (1 - ba);
      diff += Math.abs(av - bv);
      ink += Math.max(255 - av, 255 - bv);
    }
  }
  if (ink === 0) return 100;
  return Math.round(Math.max(0, 1 - diff / ink) * 1000) / 10;
}
