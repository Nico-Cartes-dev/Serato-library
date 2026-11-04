const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('serato', {
  drives: () => ipcRenderer.invoke('drives'),
  browse: () => ipcRenderer.invoke('browse'),
  folders: data => ipcRenderer.invoke('folders', data),
  run: data => ipcRenderer.invoke('run', data),
  onDiagnostic: callback => { ipcRenderer.on('diagnostic', (_, entry) => callback(entry)); },
  onProgress: callback => { ipcRenderer.on('progress', (_, message) => callback(message)); }
});
