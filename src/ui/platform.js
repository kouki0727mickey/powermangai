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

/** @returns {Promise<{path: string, content: string} | null>} */
export async function openPresentationFile() {
  if (api) return api.openFile();
  const file = await pickFile('.json,application/json');
  if (!file) return null;
  return { path: file.name, content: await readAs(file, 'readAsText') };
}

/** @returns {Promise<{path: string} | null>} */
export async function savePresentationFile(path, content, saveAs) {
  if (api) return api.saveFile(path, content, saveAs);
  const name = (saveAs || !path ? prompt('ファイル名', path || 'presentation.pmg.json') : path);
  if (!name) return null;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { path: name };
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
