const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const nodes = {};
const $ = id => nodes[id] ??= { checked: true, hidden: true, classList: { toggle(name, value) { this[name] = value; } }, focus() { this.focused = true; } };
const notes = [];
class AudioContext {
  state = 'running'; currentTime = 0; destination = {};
  resume() { return Promise.resolve(); }
  createOscillator() { const frequency = { value: 0 }; return { frequency, connect() {}, disconnect() {}, start() { notes.push(frequency.value); }, stop() { this.onended(); } }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
}
const context = vm.createContext({ $, AudioContext, console });
const source = fs.readFileSync('electron/renderer.js', 'utf8');
vm.runInContext('let audio = null;\n' + source.slice(source.indexOf('function prepareSound()'), source.indexOf('function count()')), context);
vm.runInContext("prepareSound(); notifyCompletion('Listo', 'Terminado');", context);
assert.equal($('completion').hidden, false);
assert.equal($('completion-title').textContent, 'Listo');
assert.equal($('completion-title').focused, true);
assert.equal($('completion').classList.failure, false);
assert.equal(notes.length, 3);
vm.runInContext("notifyCompletion('Error', 'Falló', true);", context);
assert.equal($('completion').classList.failure, true);
assert.deepEqual(notes.slice(3), [330, 220]);
$('sound').checked = false;
vm.runInContext("notifyCompletion('Listo', 'Silenciado');", context);
assert.equal(notes.length, 5);
assert.equal($('completion-message').textContent, 'Silenciado');
$('sound').checked = true;
vm.runInContext("audio.state = 'suspended'; notifyCompletion('Listo', 'Sin audio');", context);
assert.equal($('completion').hidden, false);
console.log('OK: avisos de éxito/error, tonos distintos, silencio y aviso visual sin audio.');
