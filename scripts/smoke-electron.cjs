// Electron 実機の起動確認（xvfb-run 上で実行）: ページが読み込まれ window.pmg と __pmg があるか。
// ビルドしたアプリを確かめるときは PMG_APP_PATH に実行ファイルを指定する
const { _electron } = require('playwright-core');
(async () => {
  // PMG_APP_PATH を指定すると、ビルドしたアプリ（実行ファイル）を起動して確かめる
  const exe = process.env.PMG_APP_PATH;
  const app = await _electron.launch(exe
    ? { executablePath: exe, args: ['--no-sandbox'], env: { ...process.env } }
    : { args: ['.', '--no-sandbox'], cwd: require('path').resolve(__dirname, '..'), env: { ...process.env } });
  const win = await app.firstWindow();
  const errors = [];
  const consoleLog = [];
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
  // CI の初回起動は遅いことがあるので長めに待つ。起動できなければ原因がわかるよう状態を出してから失敗する
  try {
    await win.waitForFunction(() => globalThis.__pmg, null, { timeout: 60000 });
  } catch (e) {
    const state = await win.evaluate(() => ({ url: location.href, ready: document.readyState, title: document.title })).catch((x) => String(x));
    console.error(JSON.stringify({ startupFailed: String(e.message).split('\n')[0], state, errors, console: consoleLog.slice(-30) }, null, 1));
    await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.pmgForceClose = true; }).catch(() => {});
    await app.close().catch(() => {});
    process.exit(1);
  }
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
