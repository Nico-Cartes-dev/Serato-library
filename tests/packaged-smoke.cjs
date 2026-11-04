const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

(async () => {
  const root = path.resolve(__dirname, '..');
  const fixture = fs.mkdtempSync(path.join(root, 'test_installer_ui_'));
  fs.mkdirSync(path.join(fixture, 'Musica'));
  fs.writeFileSync(path.join(fixture, 'Musica', 'tema.mp3'), 'fixture');
  const server = net.createServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const child = spawn(path.join(root, 'dist', 'win-unpacked', 'Serato Library.exe'), [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let page;
    for (let i = 0; i < 80; i++) {
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page'); } catch {}
      if (page) break;
      await delay(250);
    }
    assert.ok(page, 'No abrió la versión empaquetada');
    socket = new WebSocket(page.webSocketDebuggerUrl); await once(socket, 'open');
    let seq = 0;
    function evaluate(expression) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const timeout = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('Evaluación agotada')); }, 30000);
        function listener(event) {
          const data = JSON.parse(event.data);
          if (data.id !== id) return;
          clearTimeout(timeout); socket.removeEventListener('message', listener);
          if (data.error || data.result?.exceptionDetails) reject(new Error(JSON.stringify(data)));
          else resolve(data.result?.result?.value);
        }
        socket.addEventListener('message', listener);
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, userGesture: true } }));
      });
    }
    const result = await evaluate(`(async () => {
      const $ = id => document.getElementById(id);
      const deadline = Date.now() + 15000;
      while (!$('start') || $('start').disabled || !window.serato) {
        if (Date.now() > deadline) throw new Error('La interfaz no está lista');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if ($('guide').hidden) throw new Error('Falta guía');
      $('sound').checked = false;
      $('start').onclick();
      $('root').value = ${JSON.stringify(fixture)};
      await $('next').onclick();
      if ($('step-2').hidden) throw new Error('No se pudieron leer carpetas con el motor incluido');
      await $('next').onclick();
      if ($('step-3').hidden || $('completion').hidden) throw new Error('No terminó la revisión');
      return { title: document.title, newTracks: $('summary').children[1].querySelector('strong').textContent, completion: $('completion-title').textContent };
    })()`);
    assert.equal(result.newTracks, '1');
    assert.equal(result.completion, 'Resumen listo');
    assert.equal(fs.existsSync(path.join(fixture, '_Serato_')), false);
    console.log('PACKAGED_OK', JSON.stringify(result));
    socket.send(JSON.stringify({ id: ++seq, method: 'Runtime.evaluate', params: { expression: 'window.close()' } }));
  } finally {
    socket?.close();
    if (child.exitCode === null) child.kill();
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });


