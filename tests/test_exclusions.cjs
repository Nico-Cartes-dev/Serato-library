const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const group = { children: [], replaceChildren() { this.children = []; }, append(node) { this.children.push(node); } };
const progress = {};
const inputs = () => group.children.map(label => label.children[0]);
const document = {
  getElementById: id => id === 'exclusions' ? group : progress,
  createElement: () => ({ dataset: {}, children: [], append(...nodes) { this.children.push(...nodes); } }),
  createTextNode: text => text,
  querySelectorAll: selector => selector === '#exclusions input:checked' ? inputs().filter(input => input.checked) : inputs()
};
const context = vm.createContext({ document, window: { addEventListener() {} } });
const source = fs.readFileSync('electron/renderer.js', 'utf8').split('function count()')[0];
vm.runInContext(source + `
renderExclusions(['cosas', '_serato_', '_serato_backup']);
`, context);
assert.equal(inputs().length, 3);
assert.equal(inputs()[0].disabled, false);
assert.equal(inputs()[1].disabled, true);
inputs()[0].checked = false;
assert.deepEqual(Array.from(vm.runInContext('exclusions()', context)), ['_serato_', '_serato_backup']);
vm.runInContext('lock(true); lock(false);', context);
assert.equal(inputs()[0].disabled, false);
assert.equal(inputs()[1].disabled, true);
assert.equal(inputs()[2].disabled, true);
console.log('OK: casillas, exclusiones seleccionadas y bloqueo permanente de Serato.');
