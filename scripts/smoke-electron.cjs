// Electron 実機の起動確認（xvfb-run 上で実行）: ページが読み込まれ window.pmg と __pmg があるか
const { _electron } = require('playwright-core');
(async () => {
  const app = await _electron.launch({ args: ['.', '--no-sandbox'], cwd: require('path').resolve(__dirname, '..'), env: { ...process.env } });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForFunction(() => globalThis.__pmg, null, { timeout: 15000 });
  const info = await win.evaluate(() => ({ api: typeof window.pmg?.openFile, slides: __pmg.editor.pres.slides.length, title: document.title }));
  await win.keyboard.press('Enter');
  await win.keyboard.press('Alt');
  await win.keyboard.press('n');
  await win.keyboard.press('x');
  await win.keyboard.type('Electron OK');
  await win.keyboard.press('Escape');
  info.text = await win.evaluate(() => __pmg.text(__pmg.editor.slide.objects.at(-1)));
  // PDF 出力（PMG_TEST_PDF_PATH が指定されていればダイアログなしで保存）
  if (process.env.PMG_TEST_PDF_PATH) {
    await win.keyboard.press('Control+m');
    await win.keyboard.press('Control+p');
    await win.keyboard.press('Enter'); // PDF として保存
    await win.waitForFunction(() => document.getElementById('status-message').textContent.includes('PDF'), null, { timeout: 15000 });
    info.pdf = await win.evaluate(() => document.getElementById('status-message').textContent);
  }
  await win.screenshot({ path: process.env.SHOT || 'electron-smoke.png' });
  console.log(JSON.stringify({ ...info, errors }));
  await app.close();
  if (errors.length || info.api !== 'function' || info.text !== 'Electron OK') process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
