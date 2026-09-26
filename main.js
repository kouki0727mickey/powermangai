// Electron メイン プロセス
import { app, BrowserWindow, Menu, dialog, ipcMain, clipboard } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPEN_FILTERS = [
  { name: 'すべてのプレゼンテーション', extensions: ['pptx', 'json'] },
  { name: 'PowerPoint プレゼンテーション', extensions: ['pptx'] },
  { name: 'PowerMangai プレゼンテーション', extensions: ['json'] },
];
const SAVE_FILTERS = [
  { name: 'PowerPoint プレゼンテーション', extensions: ['pptx'] },
  { name: 'PowerMangai プレゼンテーション（すべての情報を保持）', extensions: ['json'] },
];
const MAX_PRES_BYTES = 500 * 1024 * 1024;
const IMAGE_FILTERS = [{ name: '画像', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }];
const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp' };
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
// レンダラーから上書き保存できるのは、ユーザーがダイアログで選んだパスだけ
const approvedPaths = new Set();

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'PowerMangai - ショートカット練習',
    backgroundColor: '#f3f3f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Alt キーでメニューバーにフォーカスが移ると KeyTips が使えないため、メニューは使わない
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  // 外部ページへの遷移や新しいウィンドウは開かない
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.PMG_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
  win.on('close', async (e) => {
    if (!win.pmgDirty || win.pmgForceClose) return;
    e.preventDefault();
    const r = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['保存する(&S)', '保存しない(&N)', 'キャンセル'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      normalizeAccessKeys: true,
      title: 'PowerMangai',
      message: '変更内容を保存しますか？',
      detail: '保存しない場合、変更内容は失われます。',
    });
    if (r.response === 0) win.webContents.send('app:saveAndClose');
    else if (r.response === 1) { win.pmgForceClose = true; win.close(); }
  });
  return win;
}

ipcMain.handle('file:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: OPEN_FILTERS });
  if (r.canceled || r.filePaths.length === 0) return null;
  const filePath = r.filePaths[0];
  const data = await readFile(filePath);
  if (data.length > MAX_PRES_BYTES) throw new Error('ファイルが大きすぎます');
  approvedPaths.add(filePath);
  return { path: filePath, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
});

/** 保存先を決める（上書き保存でパスが決まっていればそのまま、なければ / 名前を付けて保存ならダイアログ） */
ipcMain.handle('file:savePath', async (e, { current, saveAs, defaultName }) => {
  if (current && approvedPaths.has(current) && !saveAs) return current;
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, {
    defaultPath: current && approvedPaths.has(current) ? current : (defaultName || 'presentation.pptx'),
    filters: SAVE_FILTERS,
  });
  if (r.canceled || !r.filePath) return null;
  approvedPaths.add(r.filePath);
  return r.filePath;
});

ipcMain.handle('file:write', async (e, { filePath, content }) => {
  if (!approvedPaths.has(filePath)) throw new Error('保存先が選ばれていません');
  if (typeof content === 'string') await writeFile(filePath, content, 'utf8');
  else if (content instanceof Uint8Array) await writeFile(filePath, content);
  else throw new Error('invalid content');
  return { path: filePath };
});

// 保存していない変更があるときは、閉じる前に確認する
ipcMain.handle('app:setDirty', (e, dirty) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.pmgDirty = !!dirty;
});
ipcMain.handle('window:close', (e, { force }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (force) win.pmgForceClose = true;
  win.close();
});

ipcMain.handle('image:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: IMAGE_FILTERS });
  if (r.canceled || r.filePaths.length === 0) return null;
  const filePath = r.filePaths[0];
  const mime = IMAGE_MIME[path.extname(filePath).toLowerCase()];
  if (!mime) throw new Error('対応していない画像形式です');
  const buf = await readFile(filePath);
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('画像が大きすぎます（20MB まで）');
  return { name: path.basename(filePath), dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
});

// システムのクリップボード（他のアプリでコピーした文字・画像の貼り付け用）
ipcMain.handle('clipboard:read', () => {
  const img = clipboard.readImage();
  return {
    text: clipboard.readText(),
    image: img.isEmpty() ? null : img.toDataURL(),
  };
});

ipcMain.handle('clipboard:writeText', (e, text) => {
  if (typeof text === 'string') clipboard.writeText(text);
});

// PDF として保存（テスト用に PMG_TEST_PDF_PATH が指定されていればダイアログを出さない）
ipcMain.handle('print:pdf', async (e, { defaultName }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  let target = process.env.PMG_TEST_PDF_PATH;
  if (!target) {
    const r = await dialog.showSaveDialog(win, { defaultPath: defaultName || 'presentation.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  const data = await e.sender.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
  await writeFile(target, data);
  return { path: target };
});

ipcMain.handle('print:paper', (e) => new Promise((resolve) => {
  e.sender.print({ printBackground: true }, (ok, reason) => resolve({ ok, reason }));
}));

ipcMain.handle('window:fullscreen', (e, flag) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  win.setFullScreen(!!flag);
});

Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
