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
  assert.equal(await ed(() => __pmg.editor.pane), 'notes', '編集領域の次はノート');
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

test('直線だけ選択して Ctrl+T でもエラーにならない', async () => {
  await fresh();
  await alt('n', 's', 'h');
  await keys('End', 'ArrowLeft', 'ArrowLeft', 'Enter'); // 直線
  assert.equal(await ed(() => __pmg.editor.selectedObjects()[0].type), 'line');
  await keys('Control+t');
  assert.equal(await page.$('#fd-size'), null);
  assert.deepEqual(errors, []);
});

test('入力中の Shift+F3 は絵文字の後ろの選択範囲も正しく変換', async () => {
  await fresh();
  await newTextBox('😀 ab cd');
  await keys('Shift+ArrowLeft', 'Shift+ArrowLeft', 'Shift+F3');
  const ps = await runsOf();
  assert.equal(ps[0].runs.map((r) => r.text).join(''), '😀 ab Cd');
});

// ---------------------------------------------------------------- 図形
const selObj = () => ed(() => __pmg.editor.selectedObjects()[0]);
async function insertShape(index) {
  await alt('n', 's', 'h');
  for (let i = 0; i < index; i++) await keys('ArrowRight');
  await keys('Enter');
}

test('図形ギャラリーは 35 種類、矢印キーで選んで挿入', async () => {
  await fresh();
  await alt('n', 's', 'h');
  assert.equal(await page.$$eval('.gallery .item', (els) => els.length), 35);
  await keys('ArrowDown', 'Enter'); // 2 行目の先頭 = 8 番目
  assert.equal((await selObj()).type, 'trapezoid');
});

test('左右反転・上下反転（Alt → H → G → O → H / V）', async () => {
  await fresh();
  await insertShape(0);
  await alt('h', 'g', 'o', 'h');
  await alt('h', 'g', 'o', 'v');
  const o = await selObj();
  assert.deepEqual([o.flipH, o.flipV], [true, true]);
});

test('枠線メニューから太さ・点線・矢印（Alt → H → S → O → W / S / R）', async () => {
  await fresh();
  await insertShape(32); // 直線
  assert.equal((await selObj()).type, 'line');
  await alt('h', 's', 'o'); await keys('w', 'End', 'Enter');
  await alt('h', 's', 'o'); await keys('s', 'ArrowDown', 'ArrowDown', 'Enter');
  await alt('h', 's', 'o'); await keys('r', 'ArrowDown', 'Enter');
  const o = await selObj();
  assert.deepEqual([o.strokeWidth, o.dash, o.type], [6, 'dot', 'arrow']);
});

test('影（Alt → H → S → E）とクイック スタイル（Alt → H → Q）', async () => {
  await fresh();
  await insertShape(0);
  await alt('h', 's', 'e'); await keys('ArrowDown', 'Enter');
  assert.equal((await selObj()).shadow, true);
  await alt('h', 'q'); await keys('ArrowDown', 'ArrowRight', 'Enter'); // 淡色 - アクセント 1
  const o = await selObj();
  assert.deepEqual([o.fill, o.stroke], ['@accent1:0.8', '@accent1']);
});

test('図形の書式設定（Alt → J → D → O）: Tab で移動して数値入力、色ボタンは Space でパレット', async () => {
  await fresh();
  await insertShape(0);
  await alt('j', 'd', 'o');
  await page.waitForSelector('#fs-x');
  await page.keyboard.type('12'); // X（最初の項目は全選択されている）
  await keys('Tab', 'Tab', 'Tab', 'Tab', 'Tab'); // Y → 幅 → 高さ → 回転 → 縦横比を固定
  await keys('Space', 'Tab'); // 固定をオン → 塗りつぶしの色
  await keys('Space');
  await page.waitForSelector('.palette');
  await keys('ArrowUp', 'ArrowUp', 'ArrowRight', 'Enter'); // 赤
  await keys('Tab'); // 透明度
  await page.keyboard.type('25');
  await keys('Enter');
  const o = await selObj();
  assert.deepEqual([o.x, o.fill, o.opacity], [12, '#FF0000', 0.75]);
  assert.deepEqual(errors, []);
});

test('選択ウィンドウ（Alt+F10）: Ctrl+Space で複数選択して Ctrl+G、F2 で名前、Ctrl+Shift+H で非表示', async () => {
  await fresh();
  await keys('F8', '1'); // タイトル スライドの課題（プレースホルダー 2 つ）で開始
  await insertShape(0);
  await keys('Alt+F10');
  await page.waitForSelector('.dialog.side');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('modal-root')).backgroundColor), 'rgba(0, 0, 0, 0)');
  // 一覧は前面から: 四角形, サブタイトル, タイトル
  await keys('Home', 'Space', 'End', 'Control+Space');
  assert.equal(await ed(() => __pmg.editor.selection.length), 2);
  await keys('ArrowUp', 'F2');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('サブ');
  await keys('Enter');
  await keys('Control+Shift+H');
  const s = await ed(() => __pmg.editor.slide.objects.map((o) => [o.name, o.hidden]));
  assert.deepEqual(s[1], ['サブ', true]);
  await keys('Escape', 'Control+g');
  assert.equal(await ed(() => new Set(__pmg.editor.selectedObjects().map((o) => o.groupId)).size), 1);
  assert.deepEqual(errors, []);
});

test('図形の書式設定を複数選択に使うと、変更した項目だけが全部に適用される', async () => {
  await fresh();
  await ed(() => {
    const e = __pmg.editor;
    e.insertObject('rect', { x: 0, fill: '#FF0000', w: 100 });
    e.insertObject('ellipse', { x: 300, fill: '#0070C0', w: 200 });
    e.selectAll();
  });
  await keys('Tab'); // 先頭の図形を選び直さない（全選択のまま）
  await ed(() => __pmg.editor.selectAll());
  await alt('j', 'd', 'o');
  await page.waitForSelector('#fs-shadow');
  await page.focus('#fs-shadow');
  await keys('Space', 'Enter');
  const objs = await ed(() => __pmg.editor.slide.objects.filter((o) => o.type !== 'text').map((o) => [o.fill, o.w, o.shadow]));
  assert.deepEqual(objs, [['#FF0000', 100, true], ['#0070C0', 200, true]]);
});

// ---------------------------------------------------------------- 表と図
const tableTexts = () => ed(() => __pmg.editor.slide.objects.find((o) => o.type === 'table').cells.map((row) => row.map((c) => __pmg.text({ type: 'text', paragraphs: c.paragraphs }))));

test('表の挿入（Alt → N → T、矢印で 3×2）→ Tab でセル移動、最後のセルの Tab で行追加、Esc で表を選択', async () => {
  await fresh();
  await alt('n', 't');
  await page.waitForSelector('.table-picker');
  await keys('ArrowRight', 'Enter'); // 既定の 3×2 → 4×2... 3 列目まで戻す
  await keys('Escape', 'Delete');
  await alt('n', 't');
  await keys('Enter'); // 3 列 × 2 行
  await page.keyboard.type('A');
  await keys('Tab'); await page.keyboard.type('B');
  await keys('Tab'); await page.keyboard.type('C');
  await keys('Tab'); await page.keyboard.type('1');
  await keys('Tab', 'Tab', 'Tab'); // 最後のセルで Tab → 行が増える
  await page.keyboard.type('x');
  await keys('ArrowUp'); await page.keyboard.type('y'); // 1 つ上のセル（2 行目 1 列目）の末尾
  await keys('Escape');
  assert.deepEqual(await tableTexts(), [['A', 'B', 'C'], ['1y', '', ''], ['x', '', '']]);
  assert.equal(await ed(() => __pmg.editor.selectedObjects()[0].type), 'table');
  await keys('Control+z');
  assert.deepEqual(await tableTexts(), [['', '', ''], ['', '', '']], '編集全体（行の追加も含む）を 1 回で戻す');
  assert.deepEqual(errors, []);
});

test('表のレイアウト（Alt → J → L）: セル編集中は、そのセルを基準に行・列を挿入・削除', async () => {
  await fresh();
  await alt('n', 't'); await keys('Enter');
  await keys('Tab'); await page.keyboard.type('B'); // 1 行目 2 列目
  await alt('j', 'l', 'l'); // 左に列を挿入
  assert.deepEqual(await tableTexts(), [['', '', 'B', ''], ['', '', '', '']]);
  assert.deepEqual(await ed(() => __pmg.editor.editingCell), { r: 0, c: 2 }, '同じセルで編集を続ける');
  await keys('Shift+Tab');
  await alt('j', 'l', 'd', 'c'); // 列の削除（挿入した空の列）
  assert.deepEqual(await tableTexts(), [['', 'B', ''], ['', '', '']]);
  await keys('Escape');
  await alt('j', 't', 'h'); // タイトル行をオフ
  assert.equal(await ed(() => __pmg.editor.selectedObjects()[0].headerRow), false);
  await alt('j', 'l', 'd', 't'); // 表の削除
  assert.equal(await ed(() => __pmg.editor.slide.objects.some((o) => o.type === 'table')), false);
});

test('図の挿入（Alt → N → P）と縦横比を保ったサイズ変更', async () => {
  await fresh();
  const dataUrl = await ed(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#0a0'; x.fillRect(0, 0, 400, 200); return c.toDataURL('image/png'); });
  const chooser = page.waitForEvent('filechooser');
  await alt('n', 'p');
  await (await chooser).setFiles({ name: 'g.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.waitForFunction(() => __pmg.editor.selectedObjects()[0]?.type === 'image');
  let o = await selObj();
  assert.deepEqual([o.w, o.h], [400, 200]);
  await keys('Shift+ArrowRight');
  o = await selObj();
  assert.deepEqual([o.w, o.h], [408, 204]);
  // 画面に描画されている（緑の画素がある）
  const green = await ed(() => { const c = document.getElementById('slide-canvas'); const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; return d[1] > 100 && d[0] < 50; });
  assert.ok(green);
});

test('アプリ内でコピーしていないときの Ctrl+V は他のアプリの文字をテキスト ボックスとして貼り付け', async () => {
  await fresh();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await ed(() => navigator.clipboard.writeText('外部の文字'));
  await keys('Control+v');
  await page.waitForFunction(() => __pmg.editor.selectedObjects()[0]?.type === 'text');
  assert.equal(await ed(() => __pmg.text(__pmg.editor.selectedObjects()[0])), '外部の文字');
  await keys('Control+c', 'Control+Alt+v');
  await page.waitForSelector('.list');
  assert.equal(await page.$$eval('.list li', (els) => els.length), 2);
  await keys('Escape');
});

test('表のセル内で折り返した行は ↑ / ↓ で行を移動し、最初の行の ↑ で上のセルへ', async () => {
  await fresh();
  await alt('n', 't'); await keys('ArrowLeft', 'ArrowLeft', 'Enter'); // 1 列 × 2 行
  await page.keyboard.type('上');
  await keys('Tab');
  await page.keyboard.type('とても長い文字を入力して、セルの中で複数の行に折り返されるようにします。とても長い文字を入力して、セルの中で複数の行に折り返されるようにします。');
  await keys('ArrowUp');
  await page.waitForTimeout(50);
  assert.deepEqual(await ed(() => __pmg.editor.editingCell), { r: 1, c: 0 }, '折り返しの 1 行上へ（セル内）');
  await keys('Control+Home', 'ArrowUp');
  await page.waitForFunction(() => __pmg.editor.editingCell?.r === 0);
});

test('アプリ内でコピーした後に他のアプリでコピーしたものは Ctrl+V で貼り付けられる', async () => {
  await fresh();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await keys('Tab', 'Control+c');
  await page.waitForFunction(() => __pmg.app.clipSeq === 1);
  await ed(() => navigator.clipboard.writeText('あとからコピー'));
  await keys('Control+v');
  await page.waitForFunction(() => __pmg.editor.selectedObjects()[0]?.type === 'text' && __pmg.text(__pmg.editor.selectedObjects()[0]) === 'あとからコピー');
  await keys('Tab', 'Control+c');
  await page.waitForFunction(() => __pmg.app.clipSeq === 2);
  const n = await ed(() => __pmg.editor.slide.objects.length);
  await keys('Control+v');
  await page.waitForFunction((k) => __pmg.editor.slide.objects.length === k + 1, n);
  assert.equal(await ed(() => __pmg.editor.selectedObjects()[0].placeholder), 'タイトルを入力', 'アプリ内のコピーが貼り付けられる');
});

test('表を選択して Ctrl+T でフォント ダイアログが開く', async () => {
  await fresh();
  await alt('n', 't'); await keys('Enter', 'Escape', 'Control+t');
  await page.waitForSelector('#fd-size');
  assert.equal(await page.inputValue('#fd-size'), '18');
  await keys('Escape');
});

// ---------------------------------------------------------------- 表示・デザイン
test('ノート: F6 でノート欄へ移動して入力、Esc で戻り、Ctrl+Z で入力全体を戻す', async () => {
  await fresh();
  await keys('F6');
  assert.equal(await ed(() => document.activeElement.id), 'notes');
  await page.keyboard.type('話す内容');
  await keys('Tab');
  await page.keyboard.type('2');
  await keys('Escape');
  assert.equal(await ed(() => __pmg.editor.slide.notes), '話す内容\t2');
  assert.equal(await ed(() => __pmg.editor.pane), 'editor');
  await keys('Control+z');
  assert.equal(await ed(() => __pmg.editor.slide.notes), '');
  await alt('w', 'n'); // ノート欄を隠す
  assert.equal(await page.isVisible('#notes-pane'), false);
  await keys('F6');
  assert.equal(await ed(() => __pmg.editor.pane), 'slides', 'ノート欄が隠れていれば一覧 ↔ 編集');
  await keys('F6');
  assert.equal(await ed(() => __pmg.editor.pane), 'editor');
});

test('スライド一覧表示（Alt → W → I）: 矢印で移動、Ctrl+X / Ctrl+V、Enter で標準表示', async () => {
  await fresh();
  await keys('Control+m', 'Control+m', 'Control+m');
  await alt('w', 'i');
  assert.equal(await page.isVisible('#sorter'), true);
  assert.equal(await page.$$eval('.sorter-item', (els) => els.length), 4);
  await keys('ArrowLeft', 'ArrowLeft');
  assert.equal(await ed(() => __pmg.editor.slideIndex), 1);
  await keys('Home');
  assert.equal(await ed(() => __pmg.editor.slideIndex), 0);
  const firstId = await ed(() => __pmg.editor.slide.id);
  await keys('Control+x', 'ArrowRight', 'ArrowRight', 'Control+v');
  assert.equal(await ed(() => __pmg.editor.pres.slides[3].layout), 'title');
  assert.notEqual(await ed(() => __pmg.editor.pres.slides[3].id), firstId);
  await keys('Enter');
  assert.equal(await page.isVisible('#stage'), true);
  assert.equal(await ed(() => __pmg.editor.pane), 'editor');
});

test('非表示スライド（Alt → S → H）はスライドショーで飛ばされる', async () => {
  await fresh();
  await keys('Control+m', 'Control+m');
  await keys('PageUp');
  await alt('s', 'h');
  assert.equal(await ed(() => __pmg.editor.pres.slides[1].hidden), true);
  await keys('F5', 'ArrowRight');
  assert.equal(await ed(() => __pmg.app.show.index), 2);
  await keys('ArrowLeft');
  assert.equal(await ed(() => __pmg.app.show.index), 0);
  await keys('Escape');
});

test('ズーム（Alt → W → Q）・グリッド（Shift+F9）・ガイド（Alt+F9）', async () => {
  await fresh();
  await alt('w', 'q');
  await keys('ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter'); // 200%
  assert.equal(await ed(() => __pmg.app.zoom), 200);
  assert.equal(await ed(() => Math.round(document.getElementById('canvas-wrap').offsetWidth)), 2560);
  await keys('Shift+F9', 'Alt+F9');
  assert.deepEqual(await ed(() => [__pmg.app.grid, __pmg.app.guides]), [true, true]);
  await alt('w', 'f', 'w');
  assert.equal(await ed(() => __pmg.app.zoom), null);
});

test('検索（Ctrl+F）: Enter で次を検索し、Esc で見つかった文字を選択して編集', async () => {
  await fresh();
  await ed(() => { const e = __pmg.editor; e.setText(e.slide.objects[0].id, 'りんご と みかん'); e.newSlide(); e.setText(e.slide.objects[0].id, 'みかん箱'); e.gotoSlide(0); });
  await keys('Control+f');
  await page.keyboard.type('みかん');
  await keys('Enter');
  assert.match(await page.textContent('.dialog [role=status]'), /1 \/ 2 件目（スライド 1/);
  await keys('Enter');
  assert.match(await page.textContent('.dialog [role=status]'), /2 \/ 2 件目（スライド 2/);
  assert.equal(await ed(() => __pmg.editor.slideIndex), 1);
  await keys('Escape');
  assert.equal(await ed(() => getSelection().toString()), 'みかん');
  await page.keyboard.type('木');
  await keys('Escape');
  assert.equal(await ed(() => __pmg.text(__pmg.editor.selectedObjects()[0])), '木箱');
});

test('置換（Ctrl+H）: Alt+R で 1 つずつ、Alt+A ですべて置換', async () => {
  await fresh();
  await ed(() => { const e = __pmg.editor; e.setText(e.slide.objects[0].id, 'A-A-A'); e.setText(e.slide.objects[1].id, 'A'); });
  await keys('Control+h');
  await page.keyboard.type('A');
  await keys('Tab');
  await page.keyboard.type('B');
  await keys('Enter', 'Alt+r');
  assert.equal(await ed(() => __pmg.text(__pmg.editor.slide.objects[0])), 'B-A-A');
  await keys('Alt+a');
  assert.match(await page.textContent('.dialog [role=status]'), /3 個の項目を置換しました/);
  assert.deepEqual(await ed(() => __pmg.editor.slide.objects.map((o) => __pmg.text(o))), ['B-B-B', 'B']);
  await keys('Escape', 'Escape', 'Control+z');
  assert.deepEqual(await ed(() => __pmg.editor.slide.objects.map((o) => __pmg.text(o))), ['B-A-A', 'A'], 'すべて置換は 1 回で戻る');
});

test('デザイン: テーマ（Alt → G → T → H）・背景（Alt → G → B）・スライドのサイズ（Alt → G → S）', async () => {
  await fresh();
  await alt('g', 't', 'h');
  await keys('ArrowRight', 'Enter'); // 2 番目のテーマ
  assert.equal(await ed(() => __pmg.editor.pres.theme), 'office2023');
  await alt('g', 'b');
  await keys('ArrowDown', 'Enter', 'ArrowDown', 'Enter'); // 背景 1 の 5% 暗い色 → すべてに適用
  assert.equal(await ed(() => __pmg.editor.pres.slides[0].background), '@bg1:-0.05');
  await alt('g', 's');
  await keys('ArrowDown', 'Enter');
  assert.equal(await ed(() => __pmg.editor.pres.width), 720);
  const ratio = await ed(() => document.getElementById('slide-canvas').offsetWidth / document.getElementById('slide-canvas').offsetHeight);
  assert.ok(Math.abs(ratio - 720 / 540) < 0.01, String(ratio));
});

test('ヘッダーとフッター（Alt → N → H）とレイアウトの変更（Alt → H → L）', async () => {
  await fresh();
  await alt('n', 'h');
  await page.waitForSelector('#hf-num');
  await keys('Alt+n', 'Alt+f', 'Tab', 'Tab');
  await page.keyboard.type('社外秘');
  await keys('Alt+s', 'Enter'); // タイトル スライドにも表示
  const hf = await ed(() => __pmg.editor.pres.headerFooter);
  assert.deepEqual([hf.slideNumber, hf.showFooter, hf.footer, hf.hideOnTitle], [true, true, '社外秘', false]);
  await keys('Tab');
  await page.keyboard.type('題');
  await keys('Escape');
  await alt('h', 'l');
  await keys('ArrowRight', 'Enter'); // タイトルとコンテンツ
  assert.equal(await ed(() => __pmg.editor.slide.layout), 'titleContent');
  assert.equal(await ed(() => __pmg.text(__pmg.editor.slide.objects[0])), '題');
  assert.deepEqual(errors, []);
});

test('置換後の文字に検索文字列が含まれていても、同じ箇所を置換し続けない', async () => {
  await fresh();
  await ed(() => { const e = __pmg.editor; e.setText(e.slide.objects[0].id, 'cat cat'); });
  await keys('Control+h');
  await page.keyboard.type('cat');
  await keys('Tab');
  await page.keyboard.type('cats');
  await keys('Enter', 'Alt+r', 'Alt+r', 'Alt+r');
  assert.equal(await ed(() => __pmg.text(__pmg.editor.slide.objects[0])), 'cats cats');
  await keys('Escape');
});

// ---------------------------------------------------------------- 画面切り替え・アニメーション
test('画面切り替え（Alt → K → T）とすべてに適用、スライドショーで再生される', async () => {
  await fresh();
  await keys('Control+m');
  await alt('k', 't');
  await keys('ArrowDown', 'ArrowDown', 'Enter'); // プッシュ
  await alt('k', 'o'); await keys('ArrowDown', 'Enter'); // 左から
  await alt('k', 'l');
  assert.deepEqual(await ed(() => __pmg.editor.pres.slides.map((s) => s.transition && [s.transition.type, s.transition.direction])), [['push', 'fromLeft'], ['push', 'fromLeft']]);
  await keys('F5');
  assert.ok(await ed(() => !!__pmg.app.show.trans), '最初のスライドでも画面切り替え');
  await page.waitForFunction(() => __pmg.app.show && !__pmg.app.show.trans);
  await keys('ArrowRight');
  assert.equal(await ed(() => __pmg.app.show.index), 1);
  assert.ok(await ed(() => !!__pmg.app.show.trans));
  await keys('ArrowRight'); // 画面切り替え中の「次へ」は切り替えを完了させる
  assert.equal(await ed(() => __pmg.app.show.trans), null);
  await keys('Escape');
});

test('アニメーション（Alt → A → S）: クリックごとに表示され、再生中の「次へ」で完了', async () => {
  await fresh();
  await ed(() => { const e = __pmg.editor; e.slide.objects = []; e.emit(); });
  await ed(() => __pmg.editor.insertObject('rect', { x: 400, y: 200, w: 160, h: 140, fill: '#FF0000', stroke: null }));
  await alt('a', 's'); await keys('ArrowDown', 'ArrowDown', 'Enter'); // フェード
  await ed(() => __pmg.editor.insertObject('ellipse', { x: 0, y: 0, w: 100, h: 100 }));
  await alt('a', 's'); await keys('ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter'); // スライドイン
  await alt('a', 't'); await keys('ArrowDown', 'ArrowDown', 'Enter'); // 直前の動作の後
  assert.deepEqual(await ed(() => __pmg.editor.slide.animations.map((a) => [a.effect, a.trigger])), [['fade', 'click'], ['flyIn', 'after']]);
  const red = () => ed(() => { const c = document.getElementById('show-canvas'); const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; return d[0] > 200 && d[1] < 80; });
  await keys('F5');
  assert.equal(await red(), false, 'クリック前は非表示');
  await keys('ArrowRight');
  assert.ok(await ed(() => __pmg.app.show.playing));
  await keys('ArrowRight'); // 再生中 → 完了
  assert.deepEqual(await ed(() => [__pmg.app.show.done, __pmg.app.show.playing]), [1, null]);
  assert.equal(await red(), true);
  await keys('ArrowLeft');
  assert.equal(await ed(() => __pmg.app.show.done), 0, '「前へ」でアニメーションを 1 つ戻す');
  await keys('ArrowRight');
  await page.waitForFunction(() => __pmg.app.show.done === 1 && !__pmg.app.show.playing);
  await keys('ArrowRight');
  assert.equal(await ed(() => __pmg.app.show.index), 1, 'アニメーションが終わったら次へ（最後です画面）');
  await keys('Escape');
});

test('アニメーション ウィンドウ（Alt → A → M）で順番とタイミングを変更、Delete で削除', async () => {
  await fresh();
  await ed(() => {
    const e = __pmg.editor;
    const a = e.insertObject('rect'); e.setAnimation('fade');
    const b = e.insertObject('ellipse'); e.setAnimation('zoom');
    e.setSelection([a.id]);
  });
  await alt('a', 'm');
  await page.waitForSelector('.dialog.side');
  await keys('Control+ArrowDown'); // 1 番目を下へ
  await keys('w'); // 直前の動作と同時
  let list = await ed(() => __pmg.editor.slide.animations.map((a) => [a.effect, a.trigger]));
  assert.deepEqual(list, [['zoom', 'click'], ['fade', 'with']]);
  await keys('ArrowUp', 'Delete', 'Escape');
  list = await ed(() => __pmg.editor.slide.animations.map((a) => a.effect));
  assert.deepEqual(list, ['fade']);
  assert.deepEqual(errors, []);
});

test('スライドショー中の Ctrl+S（すべてのスライド）と H（非表示スライドを表示）', async () => {
  await fresh();
  await keys('Control+m', 'Control+m');
  await ed(() => { __pmg.editor.pres.slides[1].hidden = true; });
  await keys('F5', 'h');
  assert.equal(await ed(() => __pmg.app.show.index), 1, 'H で次の非表示スライドへ');
  await keys('Control+s');
  await page.waitForSelector('.list');
  await keys('End', 'Enter');
  assert.equal(await ed(() => __pmg.app.show.index), 2);
  await keys('Escape');
  assert.equal(await page.isVisible('#slideshow'), false);
});
