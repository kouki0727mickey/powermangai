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
  const texts = await ed(() => __pmg.editor.slide.objects.map((o) => o.text));
  assert.deepEqual(texts, ['ショートカット練習', 'キーボードだけで作る']);
  assert.deepEqual(errors, []);
});

test('KeyTips: Alt → N → X でテキスト ボックス、Ctrl+B / Ctrl+E、Alt → H → F → S', async () => {
  await fresh();
  await alt('n', 'x');
  await page.keyboard.type('重要');
  await keys('Control+b', 'Control+e');
  await keys('Escape');
  await alt('h', 'f', 's');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('32');
  await keys('Enter');
  const o = await ed(() => __pmg.editor.slide.objects.at(-1));
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
  assert.equal(await ed(() => __pmg.editor.selectedObjects()[0].text), 'abc');
  await page.keyboard.type('x');
  await keys('Escape');
  assert.equal(await ed(() => __pmg.editor.selectedObjects()[0].text), 'x');
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
  const f = await ed(() => __pmg.editor.selectedObjects()[0].font);
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
