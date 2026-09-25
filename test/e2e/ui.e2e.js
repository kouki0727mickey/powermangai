// ブラウザ上で実際のキー操作を再現する E2E テスト（npm run test:e2e）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startServer } from '../../scripts/serve.js';

let server, browser, page, url;
const errors = [];

before(async () => {
  server = await startServer(0);
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => { await browser?.close(); server?.close(); });

async function fresh() {
  page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__pmg);
  await page.keyboard.press('Enter'); // ようこそ画面を閉じる
}
const ed = (fn) => page.evaluate(fn);
const keys = async (...ks) => { for (const k of ks) await page.keyboard.press(k); };
const alt = async (...letters) => { await keys('Alt'); for (const l of letters) await page.keyboard.press(l); };

test('タイトル スライドに Tab → 入力 → Esc で文字を入れる', async () => {
  await fresh();
  await keys('Tab');
  await page.keyboard.type('ショートカット練習');
  await keys('Escape', 'Tab');
  await page.keyboard.type('キーボードだけで作る');
  await keys('Escape');
  const texts = await ed(() => __pmg.editor.slide.objects.map((o) => __pmg.text(o)));
  assert.deepEqual(texts, ['ショートカット練習', 'キーボードだけで作る']);
  assert.deepEqual(errors, []);
});

test('KeyTips: Alt → N → X でテキスト ボックス、Ctrl+B / Ctrl+E、Alt → H → F → S', async () => {
  await fresh();
  await alt('n', 'x');
  await page.keyboard.type('重要');
  await keys('Control+a', 'Control+b', 'Control+e');
  await keys('Escape');
  await alt('h', 'f', 's');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('32');
  await keys('Enter');
  const o = await ed(() => { const x = __pmg.editor.slide.objects.at(-1); return { type: x.type, text: __pmg.text(x), font: __pmg.font(x), align: x.paragraphs[0].align }; });
  assert.equal(o.type, 'text');
  assert.equal(o.text, '重要');
  assert.equal(o.font.bold, true);
  assert.equal(o.align, 'center');
  assert.equal(o.font.size, 32);
  assert.deepEqual(errors, []);
});

test('図形ギャラリー・パレット・配置', async () => {
  await fresh();
  await alt('n', 's', 'h');
  await keys('Enter'); // 先頭 = 四角形
  await alt('h', 's', 'f');
  await keys('ArrowUp', 'ArrowUp', 'ArrowRight', 'Enter'); // 左上から ↑↑（なし → 標準の色）→ 2 列目 = 赤
  await alt('h', 'g', 'a', 'l');
  await alt('h', 'g', 'a', 't');
  const o = await ed(() => __pmg.editor.selectedObjects()[0]);
  assert.equal(o.type, 'rect');
  assert.equal(o.fill, '#FF0000');
  assert.equal(o.x, 0);
  assert.equal(o.y, 0);
});

test('Esc で KeyTips の階層を戻り、Alt で閉じる', async () => {
  await fresh();
  await alt('h');
  assert.equal(await page.isVisible('#keytips'), true);
  await keys('Escape');
  assert.equal(await page.isVisible('#keytips'), false);
  assert.equal(await ed(() => !!__pmg.app.keytips), true, 'ルートに戻っただけ');
  await keys('Alt');
  assert.equal(await ed(() => !!__pmg.app.keytips), false);
});

test('Alt+H（押したまま）でも KeyTips が始まる', async () => {
  await fresh();
  await keys('Alt+h');
  assert.equal(await ed(() => __pmg.app.keytips?.path.join()), 'H');
  await keys('Escape', 'Escape');
});

test('矢印キー移動・Shift+矢印でサイズ・Alt+→ で回転・Undo', async () => {
  await fresh();
  await alt('n', 's', 'h');
  await keys('Enter');
  await keys('ArrowRight', 'ArrowRight', 'Control+ArrowDown', 'Shift+ArrowRight', 'Alt+ArrowRight');
  let o = await ed(() => __pmg.editor.selectedObjects()[0]);
  assert.deepEqual([o.x, o.y, o.w, o.rotation], [416, 211, 168, 15]);
  await keys('Control+z');
  o = await ed(() => __pmg.editor.selectedObjects()[0]);
  assert.equal(o.rotation, 0);
  await keys('Control+y');
  o = await ed(() => __pmg.editor.selectedObjects()[0]);
  assert.equal(o.rotation, 15);
});

test('F4 で直前の操作を繰り返す', async () => {
  await fresh();
  await alt('n', 's', 'h');
  await keys('Enter', 'Control+d', 'F4');
  assert.equal(await ed(() => __pmg.editor.slide.objects.length), 5); // タイトル 2 + 図形 3
});

test('選択中に文字を打つと図形の文字を置き換えて編集開始', async () => {
  await fresh();
  await alt('n', 's', 'h');
  await keys('Enter');
  await page.keyboard.type('abc');
  await keys('Escape');
  assert.equal(await ed(() => __pmg.text(__pmg.editor.selectedObjects()[0])), 'abc');
  await page.keyboard.type('x');
  await keys('Escape');
  assert.equal(await ed(() => __pmg.text(__pmg.editor.selectedObjects()[0])), 'x');
});

test('Ctrl+M / F6 / スライド一覧で Ctrl+↑ 並べ替え / Delete', async () => {
  await fresh();
  await keys('Control+m', 'Control+m');
  assert.equal(await ed(() => __pmg.editor.pres.slides.length), 3);
  await keys('F6');
  assert.equal(await ed(() => __pmg.editor.pane), 'slides');
  const id = await ed(() => __pmg.editor.slide.id);
  await keys('Control+ArrowUp');
  assert.equal(await ed(() => __pmg.editor.pres.slides[1].id), id);
  await keys('Delete');
  assert.equal(await ed(() => __pmg.editor.pres.slides.length), 2);
  await keys('Enter');
  assert.equal(await ed(() => __pmg.editor.pane), 'editor');
});

test('スライドショー: F5 で開始、→ で進み、最後を越えると終了', async () => {
  await fresh();
  await keys('Control+m');
  await keys('F5');
  assert.equal(await page.isVisible('#slideshow'), true);
  await keys('ArrowRight');
  assert.equal(await ed(() => __pmg.app.show.index), 1);
  await keys('b');
  assert.equal(await ed(() => __pmg.app.show.cover), 'black');
  await keys('b', '1', 'Enter');
  assert.equal(await ed(() => __pmg.app.show.index), 0);
  await keys('End', 'Space', 'Space');
  assert.equal(await page.isVisible('#slideshow'), false);
});

test('マウス操作はブロックされ、回数が記録される', async () => {
  await fresh();
  await page.mouse.click(700, 400);
  assert.equal(await ed(() => __pmg.app.practice.mouse), 1);
  assert.equal(await page.isVisible('#toast'), true);
  assert.equal(await ed(() => __pmg.editor.selection.length), 0);
});

test('課題を選んで解き、F9 で 100 点', async () => {
  await fresh();
  await keys('F8');
  await keys('Enter'); // 1 つ目の課題
  assert.equal(await ed(() => __pmg.app.practice.mode), 'challenge');
  assert.ok(await page.getAttribute('#target-image', 'src'));
  await keys('Tab');
  await page.keyboard.type('ショートカット練習');
  await keys('Escape', 'Tab');
  await page.keyboard.type('キーボードだけで作る');
  await keys('Escape', 'F9');
  const title = await page.textContent('.dialog h2');
  assert.match(title, /100 点/);
  await keys('Escape');
  assert.equal(await page.$('.dialog'), null);
});

test('課題 3 をキーボードだけで解く', async () => {
  await fresh();
  await keys('F8', '3');
  await alt('n', 's', 'h'); await keys('Enter');
  await alt('h', 's', 'f'); await keys('ArrowUp', 'ArrowUp', 'ArrowRight', 'Enter');
  await alt('h', 'g', 'a', 'l'); await alt('h', 'g', 'a', 't');
  await alt('n', 's', 'h'); await keys('ArrowRight', 'ArrowRight', 'Enter'); // 楕円
  await alt('h', 's', 'f'); await keys('ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowRight', 'Enter'); // オレンジ
  await alt('h', 'g', 'a', 'r'); await alt('h', 'g', 'a', 'b');
  await keys('F9');
  assert.match(await page.textContent('.dialog h2'), /100 点/);
});

test('フォント ダイアログ（Ctrl+T）で Tab / Space / Enter', async () => {
  await fresh();
  await keys('Tab', 'Control+t');
  await page.waitForSelector('#fd-size');
  await keys('Tab'); // サイズ
  await page.keyboard.type('40');
  await keys('Tab', 'Space', 'Enter'); // 太字をオン
  const f = await ed(() => __pmg.font(__pmg.editor.selectedObjects()[0]));
  assert.equal(f.size, 40);
  assert.equal(f.bold, true);
});

test('ヘルプ（F1）で絞り込みできる', async () => {
  await fresh();
  await keys('F1');
  await page.keyboard.type('グループ');
  const text = await page.textContent('.help-grid');
  assert.match(text, /Ctrl \+ G/);
  assert.doesNotMatch(text, /スライドショー/);
  await keys('Escape');
});

test('割り当てのないキーは記録され、ブラウザ既定動作は起きない', async () => {
  await fresh();
  await keys('Control+k');
  assert.match(await page.textContent('#keylog'), /割り当てられていません/);
});

test('幅・高さの数値指定（Alt → J → D → W / H）', async () => {
  await fresh();
  await alt('n', 's', 'h'); await keys('Enter');
  await alt('j', 'd', 'w'); await page.keyboard.press('Control+a'); await page.keyboard.type('960'); await keys('Enter');
  await alt('j', 'd', 'h'); await page.keyboard.press('Control+a'); await page.keyboard.type('120'); await keys('Enter');
  const o = await ed(() => __pmg.editor.selectedObjects()[0]);
  assert.deepEqual([o.w, o.h], [960, 120]);
  assert.deepEqual(errors, []);
});

test('Alt → H → G → O → R で 90 度回転、F4 で繰り返し', async () => {
  await fresh();
  await alt('n', 's', 'h'); await keys('Enter');
  await alt('h', 'g', 'o', 'r');
  assert.equal(await ed(() => __pmg.editor.selectedObjects()[0].rotation), 90);
  await keys('F4');
  assert.equal(await ed(() => __pmg.editor.selectedObjects()[0].rotation), 180);
});

test('テキスト編集中の Tab はタブ文字を入力し、編集が続く', async () => {
  await fresh();
  await keys('Tab', 'Enter');
  await page.keyboard.type('a');
  await keys('Tab');
  await page.keyboard.type('b');
  await keys('Escape');
  assert.equal(await ed(() => __pmg.text(__pmg.editor.selectedObjects()[0])), 'a\tb');
});

test('不正な URL でも開発サーバーは落ちない', async () => {
  const r1 = await fetch(`${url}%E0`);
  assert.equal(r1.status, 404);
  const r2 = await fetch(url);
  assert.equal(r2.status, 200);
});

test('お手本画像を読み込み（Alt → Y → I）、同じ図形を作ると一致度が上がる', async () => {
  await fresh();
  // お手本: 白地の左上に赤い四角形（アプリの描画で作った PNG）
  const dataUrl = await ed(() => {
    const c = document.createElement('canvas');
    c.width = 960; c.height = 540;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 960, 540);
    x.fillStyle = '#FF0000'; x.fillRect(0, 0, 160, 120);
    return c.toDataURL('image/png');
  });
  const file = { name: 'target.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
  const chooser = page.waitForEvent('filechooser');
  await alt('y', 'i');
  await (await chooser).setFiles(file);
  await page.waitForFunction(() => __pmg.app.practice.mode === 'image');
  assert.equal(await ed(() => __pmg.editor.slide.objects.length), 0, '白紙のスライドから始まる');
  await keys('F9');
  const before = Number((await page.textContent('.dialog h2')).match(/([\d.]+)%/)[1]);
  await keys('Escape');
  await alt('n', 's', 'h'); await keys('Enter');
  await alt('h', 's', 'f'); await keys('ArrowUp', 'ArrowUp', 'ArrowRight', 'Enter');
  await alt('h', 's', 'o'); await keys('n');
  await alt('h', 'g', 'a', 'l'); await alt('h', 'g', 'a', 't');
  await keys('F9');
  const after = Number((await page.textContent('.dialog h2')).match(/([\d.]+)%/)[1]);
  assert.ok(before < 10, `before=${before}`);
  assert.ok(after > 95, `after=${after}`);
});

// ---------------------------------------------------------------- リッチテキスト
const runsOf = () => ed(() => {
  const o = __pmg.editor.editingId ? __pmg.editor.findObject(__pmg.editor.editingId) : __pmg.editor.selectedObjects()[0];
  return o.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ text: r.text, ...r.font })) }));
});
async function newTextBox(text) {
  await alt('n', 'x');
  if (text) await page.keyboard.type(text);
}

test('選択した文字だけ太字にする（Ctrl+Shift+← で単語選択）', async () => {
  await fresh();
  await newTextBox('hello world');
  await keys('Control+Shift+ArrowLeft', 'Control+b');
  const ps = await runsOf();
  assert.deepEqual(ps[0].runs.map((r) => [r.text, r.bold]), [['hello ', false], ['world', true]]);
  // 選択範囲が保たれている
  assert.equal(await ed(() => getSelection().toString()), 'world');
});

test('カーソルが単語の中なら単語全体、単語の後ろなら次に入力する文字に書式', async () => {
  await fresh();
  await newTextBox('abc def');
  await keys('ArrowLeft', 'ArrowLeft', 'Control+i'); // "de|f"
  let ps = await runsOf();
  assert.deepEqual(ps[0].runs.map((r) => [r.text, r.italic]), [['abc ', false], ['def', true]]);
  await keys('End', 'Control+i'); // 斜体を解除して次の入力
  await page.keyboard.type('g');
  ps = await runsOf();
  assert.deepEqual(ps[0].runs.map((r) => [r.text, r.italic]), [['abc ', false], ['def', true], ['g', false]]);
  await keys('Control+b');
  await page.keyboard.type('h');
  ps = await runsOf();
  assert.deepEqual(ps[0].runs.at(-1), { ...ps[0].runs.at(-1), text: 'h', bold: true });
});

test('Enter で段落、Shift+Enter で段落内改行、テキスト ボックスの高さが伸びる', async () => {
  await fresh();
  await newTextBox('a');
  const h1 = await ed(() => __pmg.editor.findObject(__pmg.editor.editingId).h);
  await keys('Enter');
  await page.keyboard.type('b');
  await keys('Shift+Enter');
  await page.keyboard.type('c');
  const ps = await runsOf();
  assert.deepEqual(ps.map((p) => p.runs.map((r) => r.text).join('')), ['a', 'b\nc']);
  const h2 = await ed(() => __pmg.editor.findObject(__pmg.editor.editingId).h);
  assert.ok(h2 > h1 * 2, `${h1} → ${h2}`);
});

test('箇条書き（Alt → H → U）、Tab でレベル下げ、段落先頭の Backspace でレベル → 行頭文字 → 結合', async () => {
  await fresh();
  await newTextBox('one');
  await alt('h', 'u');
  await keys('Enter');
  await keys('Tab');
  await page.keyboard.type('two');
  let ps = await runsOf();
  assert.deepEqual(ps.map((p) => [p.bullet, p.level]), [['bullet', 0], ['bullet', 1]]);
  await keys('Home', 'Backspace');
  ps = await runsOf();
  assert.deepEqual(ps.map((p) => [p.bullet, p.level]), [['bullet', 0], ['bullet', 0]]);
  await keys('Backspace');
  ps = await runsOf();
  assert.equal(ps[1].bullet, 'none');
  await keys('Backspace');
  ps = await runsOf();
  assert.equal(ps.length, 1);
  assert.equal(ps[0].runs.map((r) => r.text).join(''), 'onetwo');
});

test('段落番号（Alt → H → N）と Alt+Shift+→ / ← のレベル変更、Alt+Shift+↑ で段落の移動', async () => {
  await fresh();
  await newTextBox('x');
  await keys('Enter');
  await page.keyboard.type('y');
  await keys('Control+a');
  await alt('h', 'n');
  let ps = await runsOf();
  assert.ok(ps.every((p) => p.bullet === 'number'));
  await keys('Control+End', 'Alt+Shift+ArrowRight');
  ps = await runsOf();
  assert.deepEqual(ps.map((p) => p.level), [0, 1]);
  await keys('Alt+Shift+ArrowLeft', 'Alt+Shift+ArrowUp');
  ps = await runsOf();
  assert.deepEqual(ps.map((p) => p.runs[0].text), ['y', 'x']);
});

test('選択範囲だけフォント サイズ拡大・上付き・行間 2.0', async () => {
  await fresh();
  await newTextBox('x2');
  await keys('Shift+ArrowLeft', 'Control+Shift+=');
  let ps = await runsOf();
  assert.deepEqual(ps[0].runs.map((r) => [r.text, r.baseline]), [['x', 0], ['2', 'super']]);
  await keys('Home', 'Shift+ArrowRight', 'Control+Shift+.');
  ps = await runsOf();
  assert.deepEqual(ps[0].runs.map((r) => [r.text, r.size]), [['x', 20], ['2', 18]]);
  await keys('Control+2');
  ps = await runsOf();
  assert.equal(ps[0].lineSpacing, 2);
});

test('入力中の Ctrl+Z は書式を 1 つ戻し、編集後の Ctrl+Z は編集全体を 1 回で戻す', async () => {
  await fresh();
  await newTextBox('abc');
  await keys('Control+a', 'Control+b', 'Control+i');
  await keys('Control+z');
  let ps = await runsOf();
  assert.deepEqual([ps[0].runs[0].bold, ps[0].runs[0].italic], [true, false]);
  await keys('Escape');
  const before = await ed(() => __pmg.editor.slide.objects.length);
  await keys('Control+z'); // 文字の編集を取り消す
  ps = await runsOf();
  assert.equal(ps[0].runs.map((r) => r.text).join(''), '');
  await keys('Control+z'); // テキスト ボックスの挿入を取り消す
  assert.equal(await ed(() => __pmg.editor.slide.objects.length), before - 1);
});

test('フォント ダイアログ（編集中）は選択した文字だけに適用し、選択を保つ', async () => {
  await fresh();
  await newTextBox('ab');
  await keys('Shift+ArrowLeft', 'Control+t');
  await page.waitForSelector('#fd-size');
  await keys('Alt+k', 'Enter'); // 取り消し線
  const ps = await runsOf();
  assert.deepEqual(ps[0].runs.map((r) => [r.text, r.strike]), [['a', false], ['b', true]]);
  assert.equal(await ed(() => getSelection().toString()), 'b');
});

test('フォントの色（編集中）は選択した文字だけ', async () => {
  await fresh();
  await newTextBox('ab');
  await keys('Shift+ArrowLeft');
  await alt('h', 'f', 'c');
  await keys('ArrowUp', 'ArrowRight', 'Enter'); // 標準の色の赤（「なし」はない）
  const ps = await runsOf();
  assert.deepEqual(ps[0].runs.map((r) => [r.text, r.color]), [['a', '@tx1'], ['b', '#FF0000']]);
});

test('IME の変換（compositionstart → 確定）でも選択中の図形の編集が始まる', async () => {
  await fresh();
  await keys('Tab'); // タイトル
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'にほん', selectionStart: 3, selectionEnd: 3 });
  assert.ok(await ed(() => !!__pmg.editor.editingId), '変換開始で編集が始まる');
  await cdp.send('Input.insertText', { text: '日本' });
  await page.waitForFunction(() => !__pmg.rich.composing);
  await page.keyboard.type('語');
  await keys('Escape');
  assert.equal(await ed(() => __pmg.text(__pmg.editor.selectedObjects()[0])), '日本語');
});

test('図形を選択したまま Ctrl+B / 箇条書き / Ctrl+1 は図形内のすべての文字に適用', async () => {
  await fresh();
  await newTextBox('a');
  await keys('Enter');
  await page.keyboard.type('b');
  await keys('Escape', 'Control+b');
  await alt('h', 'u');
  await keys('Control+5');
  const ps = await runsOf();
  assert.ok(ps.every((p) => p.runs.every((r) => r.bold) && p.bullet === 'bullet' && p.lineSpacing === 1.5));
  assert.deepEqual(errors, []);
});
