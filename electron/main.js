const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
let win, busy = false;
function diagnostic(level, message, details = {}) {
  const entry = { time: new Date().toISOString(), level, message, details };
  console[level](`[${entry.time}] ${message}`, details);
  if (win && !win.isDestroyed()) win.webContents.send('diagnostic', entry);
}
function backend(request, logs = false) {
  const started = Date.now();
  diagnostic('info', 'Inicio de Python', { action: request.action, root: request.root, simulate: request.simulate });
  return new Promise((resolve, reject) => {
    const command = app.isPackaged ? path.join(process.resourcesPath, 'backend', 'serato-backend.exe') : 'python';
    const args = app.isPackaged ? [] : ['-u', '-X', 'utf8', path.join(__dirname, '..', 'backend.py')];
    const cwd = app.isPackaged ? path.join(process.resourcesPath, 'backend') : path.join(__dirname, '..');
    const child = spawn(command, args, { windowsHide: true, cwd });
    let result, failure, stderr = '';
    child.on('error', error => { diagnostic('error', 'No se pudo iniciar Python', { action: request.action, error: error.message }); reject(new Error(app.isPackaged ? 'No se pudo iniciar el motor incluido. Reinstala la aplicación y revisa el registro.' : 'No se pudo iniciar Python. Comprueba que esté instalado y disponible en PATH.')); });
    readline.createInterface({ input: child.stdout }).on('line', line => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'log' && logs && !win.isDestroyed()) win.webContents.send('progress', event.message);
        if (event.type === 'result') result = event;
        if (event.type === 'error') { failure = event.message; diagnostic('error', 'Error del motor', { action: request.action, error: event.message }); }
      } catch (error) { failure = 'Respuesta inválida del proceso de biblioteca.'; diagnostic('error', failure, { action: request.action, line, error: error.message }); }
    });
    child.stderr.on('data', chunk => { stderr += chunk; diagnostic('error', 'Diagnóstico de Python', { action: request.action, message: chunk.toString() }); });
    child.on('close', (code, signal) => {
      diagnostic(code === 0 && result ? 'info' : 'error', 'Fin de Python', { action: request.action, code, signal, durationMs: Date.now() - started });
      if (code === 0 && result) resolve(result);
      else reject(new Error(failure || stderr || 'El proceso no se completó.'));
    });
    child.stdin.on('error', error => diagnostic('error', 'Error enviando datos a Python', { action: request.action, error: error.message }));
    child.stdin.end(JSON.stringify(request));
  });
}
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1180, height: 850, minWidth: 850, minHeight: 680, backgroundColor: '#10131b', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('close', event => { if (busy) { event.preventDefault(); dialog.showMessageBox(win, { message: 'Espera a que termine el proceso antes de cerrar.', type: 'info' }); } });
  ipcMain.handle('drives', () => backend({ action: 'drives' }));
  ipcMain.handle('browse', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Selecciona el disco o carpeta' });
    diagnostic('info', result.canceled ? 'Selección de origen cancelada' : 'Origen seleccionado', { root: result.filePaths[0] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('folders', (_, data) => backend({ ...data, action: 'folders' }));
  ipcMain.handle('run', async (_, data) => {
    if (busy) throw new Error('Ya hay un proceso en curso.');
    busy = true;
    try {
      if (data.simulate === false) {
        const answer = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancelar', 'Generar biblioteca'], defaultId: 0, cancelId: 0, message: '¿Generar la biblioteca de Serato?', detail: `Origen: ${data.root}\n\nCierra Serato antes de continuar. Se creará un respaldo y se agregarán pistas y se fusionarán los crates seleccionados. Se conservará la biblioteca existente.` });
        if (answer.response !== 1) { diagnostic('info', 'Generación cancelada por el usuario'); return { canceled: true }; }
      }
      return await backend({ ...data, action: 'run' }, true);
    } finally { busy = false; }
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });
  win.webContents.on('did-fail-load', (_, code, description) => diagnostic('error', 'Falló la carga de la interfaz', { code, description }));
  win.webContents.on('render-process-gone', (_, details) => diagnostic('error', 'El proceso de la interfaz terminó', details));
  win.loadFile(path.join(__dirname, 'index.html'));
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
});
app.on('window-all-closed', () => app.quit());
