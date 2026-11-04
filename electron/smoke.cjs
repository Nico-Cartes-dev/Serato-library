const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const fixture = fs.mkdtempSync(path.join(__dirname, '..', 'test_wizard_'));
fs.mkdirSync(path.join(fixture, 'Musica'));
fs.writeFileSync(path.join(fixture, 'Musica', 'tema.mp3'), 'fixture');
app.on('will-quit', () => fs.rmSync(fixture, { recursive: true, force: true }));
require('./main');
app.whenReady().then(() => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.once('did-finish-load', async () => {
    try {
      if (process.argv.includes('--dev') && !win.webContents.isDevToolsOpened()) {
        await new Promise(resolve => win.webContents.once('devtools-opened', resolve));
      }
      const result = await win.webContents.executeJavaScript(`(async () => {
        const drives = await window.serato.drives();
        return { title: document.title, bridge: !!window.serato, drives: drives.drives.length, controls: !!document.getElementById('generate') };
      })()`);
      result.wizard = await win.webContents.executeJavaScript(`(async () => {
        const $ = id => document.getElementById(id);
        const deadline = Date.now() + 10000;
        while ($('next').disabled) {
          if (Date.now() > deadline) throw new Error('Inicio no terminó');
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        if ($('guide').hidden || !$('step-1').hidden) throw new Error('Falta guía inicial');
        $('start').onclick();
        if (!$('guide').hidden) throw new Error('Guía no se cerró');
        if ($('step-1').hidden || !$('step-2').hidden || !$('step-3').hidden) throw new Error('Paso inicial incorrecto');
        $('root').value = ${JSON.stringify(fixture)};
        await $('next').onclick();
        if ($('step-2').hidden || $('count').textContent !== '1 seleccionadas') throw new Error('No cargó las carpetas');
        $('none').onclick();
        await $('next').onclick();
        if ($('step-2').hidden) throw new Error('Aceptó selección vacía');
        $('all').onclick();
        await $('next').onclick();
        if ($('step-3').hidden || $('summary').children.length !== 6) throw new Error('Falta resumen');
        if ($('summary').children[1].querySelector('strong').textContent !== '1') throw new Error('Conteo incorrecto');
        if ($('generate').hidden) throw new Error('Falta confirmar');
        if ($('completion').hidden || $('completion-title').textContent !== 'Resumen listo') throw new Error('Falta aviso visual');
        $('back').onclick();
        if ($('step-2').hidden) throw new Error('Atrás no funciona');
        return true;
      })()`);
      if (fs.existsSync(path.join(fixture, '_Serato_'))) throw new Error('La revisión escribió archivos');
      result.devTools = win.webContents.isDevToolsOpened();
      if (process.argv.includes('--dev') && !result.devTools) throw new Error('DevTools no se abrió.');
      if (!result.bridge || !result.drives || !result.controls) throw new Error(JSON.stringify(result));
      require('node:fs').writeFileSync(require('node:path').join(__dirname, 'smoke-result.json'), JSON.stringify(result)); console.log('SMOKE_OK ' + JSON.stringify(result));
      fs.rmSync(fixture, { recursive: true, force: true });
      app.exit(0);
    } catch (error) { console.error(error); fs.rmSync(fixture, { recursive: true, force: true }); app.exit(1); }
  });
});
setTimeout(() => { console.error('Tiempo agotado'); app.exit(1); }, 20000).unref();
