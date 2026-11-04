const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('serato', {
  drives: () => ipcRenderer.invoke('drives'),
  browse: () => ipcRenderer.invoke('browse'),
  folders: data => ipcRenderer.invoke('folders', data),
  run: data => ipcRenderer.invoke('run', data),
  onProgress: callback => { ipcRenderer.on('progress', (_, message) => callback(message)); }
});
