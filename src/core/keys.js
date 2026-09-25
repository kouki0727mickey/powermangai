// キーイベントの正規化と、ショートカット表の検索

const CODE_MAP = {
  Period: '.', Comma: ',', BracketLeft: '[', BracketRight: ']', Slash: '/', Backslash: '\\',
  Semicolon: ';', Quote: "'", Equal: '=', Minus: '-', Backquote: '`', Space: 'Space',
  IntlRo: '\\', IntlYen: '¥',
};
const SHIFT_SYMBOLS = { '.': '>', ',': '<' };
// Shift で入力される記号 → そのキーの Shift なしの記号（US / JIS 共通のもの）
const SHIFTED_TO_BASE = { '}': ']', '{': '[' };
const KEY_ALIAS = { ' ': 'Space', Esc: 'Escape', Del: 'Delete', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown' };
export const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

function baseFromCode(code) {
  if (!code) return null;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (code === 'NumpadEnter') return 'Enter';
  if (code === 'NumpadAdd') return '+';
  if (code === 'NumpadSubtract') return '-';
  return CODE_MAP[code] ?? null;
}

function baseFromKey(key) {
  if (!key) return null;
  if (KEY_ALIAS[key]) return KEY_ALIAS[key];
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function combo(mods, base) {
  const parts = [];
  if (mods.ctrl) parts.push('Ctrl');
  if (mods.alt) parts.push('Alt');
  if (mods.shift) parts.push('Shift');
  parts.push(base);
  return parts.join('+');
}

/**
 * KeyboardEvent 風オブジェクトから、照合用のキー文字列候補を返す。
 * 物理キー（code）と入力文字（key）の両方を候補にすることで、
 * JIS / US 配列のどちらでも「Ctrl+Shift+>」「Ctrl+]」などが一致する。
 * Mac の Command キーは Ctrl として扱う。
 */
export function keyCandidates(e) {
  if (MODIFIER_KEYS.has(e.key)) return [];
  const mods = { ctrl: !!(e.ctrlKey || e.metaKey), alt: !!e.altKey, shift: !!e.shiftKey };
  const out = [];
  const add = (c) => { if (c && !out.includes(c)) out.push(c); };
  const fromCode = baseFromCode(e.code);
  const fromKey = baseFromKey(e.key);
  // 名前付きキー（Enter, ArrowUp, F5…）は key を優先
  if (fromKey && fromKey.length > 1 && fromKey !== 'Dead' && fromKey !== 'Process' && fromKey !== 'Unidentified') {
    add(combo(mods, fromKey));
  }
  // 入力文字（配列に依存）を優先し、物理キーは IME 変換中や非ラテン配列用のフォールバック
  if (fromKey && fromKey.length === 1) {
    add(combo(mods, fromKey));
    if (mods.shift && SHIFTED_TO_BASE[fromKey]) add(combo(mods, SHIFTED_TO_BASE[fromKey]));
    // Shift で入力される記号（例: > ）は Shift なしの表記でも照合する
    if (mods.shift && !/[A-Z0-9]/.test(fromKey)) add(combo({ ...mods, shift: false }, fromKey));
  }
  if (fromCode) {
    add(combo(mods, fromCode));
    if (mods.shift && SHIFT_SYMBOLS[fromCode]) add(combo(mods, SHIFT_SYMBOLS[fromCode]));
  }
  return out;
}

/** 表示用: 'Ctrl+Shift+.' → 'Ctrl + Shift + >' のような人に読みやすい表記 */
export function prettyKey(k) {
  const names = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Delete: 'Delete',
    Backspace: 'BackSpace', PageUp: 'PageUp', PageDown: 'PageDown', Space: 'Space',
  };
  // 末尾が「++」のときは + キーそのもの
  const plusKey = k === '+' || k.endsWith('++');
  const parts = plusKey ? [...k.slice(0, -1).split('+').filter(Boolean), '+'] : k.split('+');
  return parts.map((p) => names[p] ?? p).join(' + ');
}

export function findBinding(bindings, candidates, context) {
  for (const c of candidates) {
    for (const b of bindings) {
      if (b.contexts.includes(context) && b.keys.includes(c)) return b;
    }
  }
  return null;
}
