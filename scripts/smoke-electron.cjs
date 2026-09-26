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
  // .pptx の書き出しと読み込み（サンドボックスのレンダラーで CompressionStream が使えるか）
  info.pptx = await win.evaluate(async () => {
    const { exportPptx } = await import('./core/pptx-write.js');
    const { importPptx } = await import('./core/pptx-read.js');
    const bytes = await exportPptx(__pmg.editor.pres);
    const { pres } = await importPptx(bytes);
    return `${bytes.length > 1000}:${pres.slides.length}:${typeof window.pmg.chooseSavePath}:${typeof window.pmg.setDirty}`;
  });
  // PDF 出力（PMG_TEST_PDF_PATH が指定されていればダイアログなしで保存）
  if (process.env.PMG_TEST_PDF_PATH) {
    await win.keyboard.press('Control+m');
    await win.keyboard.press('Control+p');
    await win.keyboard.press('Enter'); // PDF として保存
    await win.waitForFunction(() => document.getElementById('status-message').textContent.includes('PDF'), null, { timeout: 15000 });
    info.pdf = await win.evaluate(() => document.getElementById('status-message').textContent);
  }
  await win.screenshot({ path: process.env.SHOT || 'electron-smoke.png' });
  // 保存していない変更があると閉じるときに確認が出る。確認があることを確かめてから、確認を出さずに閉じる
  info.dirty = await win.evaluate(() => document.getElementById('doc-title').textContent.includes('●'));
  info.confirmOnClose = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].pmgDirty === true);
  console.log(JSON.stringify({ ...info, errors }));
  await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.pmgForceClose = true; });
  await app.close();
  if (errors.length || info.api !== 'function' || info.text !== 'Electron OK' || info.pptx !== 'true:1:function:function' || !info.confirmOnClose) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
