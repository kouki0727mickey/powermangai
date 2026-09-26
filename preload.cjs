// レンダラーに公開する最小限の API（ファイルの読み書きのみ）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pmg', {
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (filePath, content, saveAs) => ipcRenderer.invoke('file:save', { filePath, content, saveAs }),
  openImage: () => ipcRenderer.invoke('image:open'),
  setFullScreen: (flag) => ipcRenderer.invoke('window:fullscreen', flag),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
});
