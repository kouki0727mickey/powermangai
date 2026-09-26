// Electron（window.pmg）とブラウザ（開発・テスト用）の差異を吸収する

const api = globalThis.pmg || null;
export const isElectron = !!api;

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files[0] || null);
      input.remove();
    });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

function readAs(file, method) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r[method](file);
  });
}

/** @returns {Promise<{ path: string, data: Uint8Array } | null>} */
export async function openPresentationFile() {
  if (api) return api.openFile();
  const file = await pickFile('.pptx,.json,application/json,application/vnd.openxmlformats-officedocument.presentationml.presentation');
  if (!file) return null;
  return { path: file.name, data: new Uint8Array(await readAs(file, 'readAsArrayBuffer')) };
}

/** 保存先のパス（形式は拡張子で決まる）。キャンセルなら null */
export async function chooseSavePath(current, saveAs, defaultName) {
  if (api) return api.chooseSavePath(current, saveAs, defaultName);
  if (current && !saveAs) return current;
  // ブラウザでは名前を聞いてダウンロードする
  // eslint-disable-next-line no-alert
  return prompt('ファイル名（.pptx または .json）', current || defaultName || 'presentation.pptx');
}

export async function writePresentationFile(path, content) {
  if (api) return api.writeFile(path, content);
  const a = document.createElement('a');
  const type = typeof content === 'string' ? 'application/json' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = path.split(/[\\/]/).pop();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { path };
}

/** 保存していない変更の有無を伝える（ウィンドウを閉じるときの確認用） */
let lastDirty = null;
export function reportDirty(dirty) {
  if (dirty === lastDirty) return;
  lastDirty = dirty;
  if (api) api.setDirty(dirty);
}

export function closeWindow(force = false) {
  if (api) api.closeWindow(force);
  else window.close();
}

export function onSaveAndClose(fn) {
  if (api) api.onSaveAndClose(fn);
}

/** @returns {Promise<{name: string, dataUrl: string} | null>} */
export async function openImageFile() {
  if (api) return api.openImage();
  const file = await pickFile('image/*');
  if (!file) return null;
  return { name: file.name, dataUrl: await readAs(file, 'readAsDataURL') };
}

export async function setFullScreen(flag) {
  try {
    if (api) await api.setFullScreen(flag);
    else if (flag && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    else if (!flag && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // 全画面にできなくてもスライドショーは続行する
  }
}

/** システムのクリップボード: { text, image（dataURL）} */
export async function readSystemClipboard() {
  if (api) return api.readClipboard();
  const out = { text: '', image: null };
  try { out.text = await navigator.clipboard.readText(); } catch { /* 読めない環境では空 */ }
  return out;
}

/** dataURL の画像の元のサイズ */
export function imageSize(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
    img.onerror = () => reject(new Error('画像を読み込めません'));
    img.src = src;
  });
}

/** システムのクリップボードに文字を書き込む（空文字なら何もしない） */
export async function writeSystemClipboardText(text) {
  if (!text) return;
  try {
    if (api) await api.writeClipboardText(text);
    else await navigator.clipboard.writeText(text);
  } catch { /* 書き込めない環境では無視 */ }
}

/** 印刷用の要素を表示した状態で PDF 保存 / 印刷する */
export async function printDocument(kind, defaultName) {
  if (api) return kind === 'pdf' ? api.printToPDF(defaultName) : api.printPaper();
  window.print();
  return { path: null };
}
