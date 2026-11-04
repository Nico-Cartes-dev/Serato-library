const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
let win, busy = false;
function backend(request, logs = false) {
  return new Promise((resolve, reject) => {
    const command = app.isPackaged ? path.join(process.resourcesPath, 'backend', 'serato-backend.exe') : 'python';
    const args = app.isPackaged ? [] : ['-u', '-X', 'utf8', path.join(__dirname, '..', 'backend.py')];
    const cwd = app.isPackaged ? path.join(process.resourcesPath, 'backend') : path.join(__dirname, '..');
    const child = spawn(command, args, { windowsHide: true, cwd });
    let result, failure, stderr = '';
    child.on('error', () => { reject(new Error(app.isPackaged ? 'No se pudo iniciar el motor incluido. Reinstala la aplicación y revisa el registro.' : 'No se pudo iniciar Python. Comprueba que esté instalado y disponible en PATH.')); });
    readline.createInterface({ input: child.stdout }).on('line', line => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'log' && logs && !win.isDestroyed()) win.webContents.send('progress', event.message);
        if (event.type === 'result') result = event;
        if (event.type === 'error') failure = event.message;
      } catch { failure = 'Respuesta inválida del proceso de biblioteca.'; }
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => {
      if (code === 0 && result) resolve(result);
      else reject(new Error(failure || stderr || 'El proceso no se completó.'));
    });
    child.stdin.on('error', error => { failure = `No se pudieron enviar los datos al motor: ${error.message}`; });
    child.stdin.end(JSON.stringify(request));
  });
}
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1180, height: 850, minWidth: 850, minHeight: 680, backgroundColor: '#10131b', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('close', event => { if (busy) { event.preventDefault(); dialog.showMessageBox(win, { message: 'Espera a que termine el proceso antes de cerrar.', type: 'info' }); } });
  ipcMain.handle('drives', () => backend({ action: 'drives' }));
  ipcMain.handle('browse', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Selecciona el disco o carpeta' });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('folders', (_, data) => backend({ ...data, action: 'folders' }));
  ipcMain.handle('run', async (_, data) => {
    if (busy) throw new Error('Ya hay un proceso en curso.');
    busy = true;
    try {
      if (data.simulate === false) {
        const answer = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancelar', 'Generar biblioteca'], defaultId: 0, cancelId: 0, message: '¿Generar la biblioteca de Serato?', detail: `Origen: ${data.root}\n\nCierra Serato antes de continuar. Se creará un respaldo y se agregarán pistas y se fusionarán los crates seleccionados. Se conservará la biblioteca existente.` });
        if (answer.response !== 1) return { canceled: true };
      }
      return await backend({ ...data, action: 'run' }, true);
    } finally { busy = false; }
  });
  win.webContents.on('did-fail-load', () => dialog.showErrorBox('No se pudo abrir la aplicación', 'Cierra y vuelve a abrir Serato Library. Si persiste el error, reinstala la aplicación.'));
  win.webContents.on('render-process-gone', () => dialog.showErrorBox('La interfaz se cerró inesperadamente', 'Reabre la aplicación. Si estabas generando una biblioteca, revisa el respaldo antes de volver a intentarlo.'));
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
