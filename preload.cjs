// レンダラーに公開する最小限の API（ファイル・クリップボード・印刷）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pmg', {
  openFile: () => ipcRenderer.invoke('file:open'),
  chooseSavePath: (current, saveAs, defaultName) => ipcRenderer.invoke('file:savePath', { current, saveAs, defaultName }),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', { filePath, content }),
  setDirty: (dirty) => ipcRenderer.invoke('app:setDirty', dirty),
  closeWindow: (force) => ipcRenderer.invoke('window:close', { force }),
  onSaveAndClose: (fn) => ipcRenderer.on('app:saveAndClose', () => fn()),
  openImage: () => ipcRenderer.invoke('image:open'),
  setFullScreen: (flag) => ipcRenderer.invoke('window:fullscreen', flag),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  printToPDF: (defaultName) => ipcRenderer.invoke('print:pdf', { defaultName }),
  printPaper: () => ipcRenderer.invoke('print:paper'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
});
