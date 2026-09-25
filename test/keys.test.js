import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyCandidates, findBinding, prettyKey } from '../src/core/keys.js';
import { BINDINGS } from '../src/core/shortcuts.js';
import { KEYTIPS, KeyTipSession, keyTipPaths } from '../src/core/keytips.js';

const ev = (key, code, mods = {}) => ({ key, code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });
const action = (e, ctx = 'editor') => findBinding(BINDINGS, keyCandidates(e), ctx)?.action ?? null;

test('英字キーは大文字で正規化される', () => {
  assert.deepEqual(keyCandidates(ev('b', 'KeyB', { ctrlKey: true })), ['Ctrl+B']);
  assert.deepEqual(keyCandidates(ev('B', 'KeyB', { ctrlKey: true, shiftKey: true })), ['Ctrl+Shift+B']);
});

test('修飾キー単独は候補なし', () => {
  assert.deepEqual(keyCandidates(ev('Control', 'ControlLeft', { ctrlKey: true })), []);
  assert.deepEqual(keyCandidates(ev('Alt', 'AltLeft', { altKey: true })), []);
});

test('Mac の Command は Ctrl 扱い', () => {
  assert.equal(action(ev('z', 'KeyZ', { metaKey: true })), 'undo');
});

test('US 配列の Ctrl+Shift+> / Ctrl+] でフォント拡大', () => {
  assert.equal(action(ev('>', 'Period', { ctrlKey: true, shiftKey: true })), 'fontGrow');
  assert.equal(action(ev(']', 'BracketRight', { ctrlKey: true })), 'fontGrow');
  assert.equal(action(ev('<', 'Comma', { ctrlKey: true, shiftKey: true })), 'fontShrink');
  assert.equal(action(ev('[', 'BracketLeft', { ctrlKey: true })), 'fontShrink');
});

test('JIS 配列の ] キー（code=Backslash）でもフォント拡大', () => {
  assert.equal(action(ev(']', 'Backslash', { ctrlKey: true })), 'fontGrow');
  // JIS の [ キーは code=BracketRight だが key='['
  assert.equal(action(ev('[', 'BracketRight', { ctrlKey: true })), 'fontShrink');
});

test('JIS で Ctrl+Shift+] （key="}", code=Backslash）は最前面へ', () => {
  assert.equal(action(ev('}', 'Backslash', { ctrlKey: true, shiftKey: true })), 'bringToFront');

  assert.equal(action(ev('}', 'BracketRight', { ctrlKey: true, shiftKey: true })), 'bringToFront');
  assert.equal(action(ev('{', 'BracketLeft', { ctrlKey: true, shiftKey: true })), 'sendToBack');
});

test('IME 変換中 (key=Process) でも物理キーで判定', () => {
  assert.deepEqual(keyCandidates(ev('Process', 'KeyB', { ctrlKey: true })), ['Ctrl+B']);
});

test('非ラテン配列（キリル文字など）でも物理キーで判定', () => {
  assert.equal(action(ev('и', 'KeyB', { ctrlKey: true })), 'bold');
});

test('コンテキストで同じキーの意味が変わる', () => {
  const down = ev('ArrowDown', 'ArrowDown');
  assert.equal(action(down, 'editor'), 'moveDown');
  assert.equal(action(down, 'slides'), 'nextSlide');
  assert.equal(action(down, 'show'), 'showNext');
  assert.equal(action(ev('Escape', 'Escape'), 'text'), 'endEdit');
  assert.equal(action(ev('Enter', 'Enter'), 'editor'), 'startEdit');
  assert.equal(action(ev('Enter', 'Enter'), 'slides'), 'focusEditor');
});

test('テキスト編集中は通常の文字入力を奪わない', () => {
  assert.equal(action(ev('a', 'KeyA'), 'text'), null);
  assert.equal(action(ev('ArrowLeft', 'ArrowLeft'), 'text'), null);
  assert.equal(action(ev('Enter', 'Enter'), 'text'), null);
  assert.equal(action(ev('Backspace', 'Backspace'), 'text'), null);
  assert.equal(action(ev('a', 'KeyA', { ctrlKey: true }), 'text'), null, 'Ctrl+A はテキスト全選択に任せる');
  assert.equal(action(ev('z', 'KeyZ', { ctrlKey: true }), 'text'), null, 'Ctrl+Z はテキスト Undo に任せる');
});

test('Shift+Tab と Tab、Ctrl+Shift+矢印の区別', () => {
  assert.equal(action(ev('Tab', 'Tab')), 'selectNext');
  assert.equal(action(ev('Tab', 'Tab', { shiftKey: true })), 'selectPrev');
  assert.equal(action(ev('ArrowRight', 'ArrowRight', { shiftKey: true })), 'growW');
  assert.equal(action(ev('ArrowRight', 'ArrowRight', { ctrlKey: true, shiftKey: true })), 'growWFine');
  assert.equal(action(ev('ArrowRight', 'ArrowRight', { ctrlKey: true, altKey: true })), 'rotateRightFine');
});

test('同じコンテキストでキーが重複していない', () => {
  const seen = new Map();
  for (const b of BINDINGS) {
    for (const ctx of b.contexts) {
      for (const k of b.keys) {
        const id = `${ctx}:${k}`;
        assert.ok(!seen.has(id), `${id} が ${seen.get(id)} と ${b.action} で重複`);
        seen.set(id, b.action);
      }
    }
  }
});

test('prettyKey の表示', () => {
  assert.equal(prettyKey('Ctrl+Shift+ArrowUp'), 'Ctrl + Shift + ↑');
  assert.equal(prettyKey('Escape'), 'Esc');
});

test('KeyTips: Alt,H,F,S でフォントサイズ', () => {
  const s = new KeyTipSession();
  assert.equal(s.press('h').type, 'node');
  assert.equal(s.press('F').type, 'pending');
  assert.deepEqual(s.visibleTips().map((t) => t.key), ['FP', 'FF', 'FS', 'FG', 'FK', 'FC']);
  const r = s.press('S');
  assert.equal(r.type, 'action');
  assert.equal(r.action, 'input:fontSize');
  assert.deepEqual(r.path, ['H', 'FS']);
});

test('KeyTips: Alt,H,G,A,C で左右中央揃え', () => {
  const s = new KeyTipSession();
  s.press('H'); s.press('G'); s.press('A');
  const r = s.press('C');
  assert.deepEqual([r.action, r.args], ['arrangeAlign', 'center']);
});

test('KeyTips: 該当なしは invalid で入力がリセットされる', () => {
  const s = new KeyTipSession();
  s.press('H');
  s.press('F');
  assert.equal(s.press('Z').type, 'invalid');
  assert.equal(s.buffer, '');
  assert.equal(s.press('1').action, 'bold');
});

test('KeyTips: Esc で入力途中→クリア、階層→戻る、ルート→終了', () => {
  const s = new KeyTipSession();
  s.press('H');
  s.press('F');
  assert.equal(s.back(), true);
  assert.equal(s.buffer, '');
  assert.equal(s.node.label, 'ホーム');
  assert.equal(s.back(), true);
  assert.equal(s.node.label, 'リボン');
  assert.equal(s.back(), false);
});

test('KeyTips: 同じ階層でキーが別のキーの接頭辞になっていない', () => {
  const walk = (node) => {
    const keys = node.children.map((c) => c.key);
    for (const a of keys) {
      for (const b of keys) {
        if (a !== b) assert.ok(!b.startsWith(a), `${node.label}: ${a} は ${b} の接頭辞`);
      }
      assert.equal(keys.filter((k) => k === a).length, 1, `${node.label}: ${a} が重複`);
    }
    node.children.filter((c) => c.children).forEach(walk);
  };
  walk(KEYTIPS);
});

test('keyTipPaths で全アクションを列挙', () => {
  const paths = keyTipPaths();
  const tb = paths.find((p) => p.action === 'insertTextBox');
  assert.deepEqual(tb.keys, ['Alt', 'N', 'X']);
});

test('KeyTips: Alt,J,D,W で幅の入力', () => {
  const s = new KeyTipSession();
  assert.equal(s.press('J').type, 'pending');
  assert.equal(s.press('D').type, 'node');
  assert.equal(s.press('W').action, 'input:width');
});
