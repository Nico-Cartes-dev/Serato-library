const $ = id => document.getElementById(id);
let locked = false;
let step = 0;
let audio = null;
let reviewed = null;
window.serato.onDiagnostic(entry => console[entry.level === 'error' ? 'error' : 'info'](`[${entry.time}] ${entry.message}`, entry.details));
window.addEventListener('error', event => console.error('[Interfaz] Error no controlado', event.error || event.message));
window.addEventListener('unhandledrejection', event => console.error('[Interfaz] Promesa rechazada', event.reason));
const exclusions = () => [...document.querySelectorAll('#exclusions input:checked')].map(input => input.value);
function renderExclusions(names) {
  $('exclusions').replaceChildren();
  for (const name of names) {
    const label = document.createElement('label'); label.className = 'folder';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = name; input.checked = true;
    input.dataset.required = String(['_serato_', '_serato_backup'].includes(name.toLowerCase()));
    input.disabled = input.dataset.required === 'true';
    label.append(input, document.createTextNode(name)); $('exclusions').append(label);
  }
}
function status(text, error = false) { if (error) console.error('[Serato]', text); $('status').textContent = text; $('status').classList.toggle('error', error); }
function lock(value) { locked = value; document.querySelectorAll('button,input,select,textarea').forEach(x => x.disabled = value || x.dataset.required === 'true'); $('progress').hidden = !value; }
function prepareSound() {
  if (!$('sound').checked) return;
  try {
    audio ??= new AudioContext();
    audio.resume().catch(error => console.warn('[Sonido] No se pudo activar', error));
  } catch (error) { console.warn('[Sonido] No disponible', error); }
}
function notifyCompletion(title, message, error = false) {
  $('completion').hidden = false;
  $('completion').classList.toggle('failure', error);
  $('completion-icon').textContent = error ? '!' : '✓';
  $('completion-title').textContent = title;
  $('completion-message').textContent = message;
  $('completion-title').focus();
  if (!$('sound').checked || !audio || audio.state !== 'running') return;
  try {
    const notes = error ? [330, 220] : [523.25, 659.25, 783.99];
    notes.forEach((frequency, i) => {
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      const time = audio.currentTime + i * 0.18;
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0, time);
      volume.gain.linearRampToValueAtTime(0.12, time + 0.015);
      volume.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
      oscillator.connect(volume); volume.connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
      oscillator.start(time); oscillator.stop(time + 0.17);
    });
  } catch (soundError) { console.warn('[Sonido] No se pudo reproducir', soundError); }
}
function count() { $('count').textContent = `${document.querySelectorAll('#folders input:checked').length} seleccionadas`; }
function showStep(value) {
  step = value;
  $('guide').hidden = step !== 0;
  $('stepper').hidden = step === 0;
  $('wizard-actions').hidden = step === 0;
  $('completion').hidden = true;
  for (let i = 1; i <= 3; i++) {
    $(`step-${i}`).hidden = i !== step;
    if (i === step) $(`step-label-${i}`).setAttribute('aria-current', 'step');
    else $(`step-label-${i}`).removeAttribute('aria-current');
  }
  $('back').hidden = step === 1;
  $('next').hidden = step === 3;
  $('generate').hidden = step !== 3;
  $('next').textContent = step === 1 ? 'Continuar →' : 'Revisar resumen →';
  document.querySelector(step === 0 ? '#guide h2' : `#step-${step} h2`).focus();
}
async function loadFolders() {
  if (locked) return false;
  reviewed = null;
  lock(true);
  $('folders').replaceChildren(); count();
  try {
    const { folders } = await window.serato.folders({ root: $('root').value.trim(), exclusions: exclusions() });
    console.info('[Carpetas] Origen cargado', { root: $('root').value.trim(), available: folders.length });
    for (const name of folders) {
      const label = document.createElement('label'); label.className = 'folder';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.value = name; input.addEventListener('change', count);
      label.append(input, document.createTextNode(name)); $('folders').append(label);
    }
    count(); status(folders.length ? 'Selecciona las carpetas que quieres agregar.' : 'No hay carpetas disponibles en este origen.');
    return folders.length > 0;
  } catch (error) { status(error.message, true); return false; }
  finally { lock(false); }
}
$('browse').onclick = async () => {
  try { const root = await window.serato.browse(); if (root) { $('root').value = root; reviewed = null; } }
  catch (error) { status(error.message, true); }
};
$('refresh').onclick = () => loadDrives(false);
$('reload-folders').onclick = loadFolders;
$('root').onchange = () => { reviewed = null; };
$('drives').onchange = () => { $('root').value = $('drives').value; reviewed = null; };
$('all').onclick = () => { document.querySelectorAll('#folders input').forEach(x => x.checked = true); count(); };
$('none').onclick = () => { document.querySelectorAll('#folders input').forEach(x => x.checked = false); count(); };
window.serato.onProgress(message => { console.info(`[${new Date().toISOString()}] [Serato]`, message); $('output').append(document.createTextNode(message + '\n')); $('output').scrollTop = $('output').scrollHeight; });
function selection() {
  const excluded = exclusions();
  return { root: $('root').value.trim(), folders: [...document.querySelectorAll('#folders input:checked')].map(x => x.value).filter(name => !excluded.includes(name.toLowerCase())), exclusions: excluded, audio: $('audio').checked, video: $('video').checked };
}
function renderSummary(summary) {
  $('summary').replaceChildren();
  for (const [key, label] of [['found_tracks', 'Canciones encontradas'], ['new_tracks', 'Pistas nuevas'], ['existing_tracks', 'Pistas existentes conservadas'], ['new_crates', 'Crates nuevos'], ['crates', 'Crates a procesar'], ['crate_entries', 'Entradas nuevas en crates']]) {
    const box = document.createElement('div'); box.className = 'metric';
    const number = document.createElement('strong'); number.textContent = summary[key].toLocaleString('es-CL');
    const caption = document.createElement('span'); caption.textContent = label;
    box.append(number, caption); $('summary').append(box);
  }
}
async function review() {
  prepareSound();
  $('completion').hidden = true;
  const config = selection();
  reviewed = null;
  if (!config.folders.length || (!config.audio && !config.video)) { status('Selecciona al menos una carpeta y un tipo de archivo.', true); return; }
  lock(true); $('output').textContent = ''; status('Analizando tu selección sin modificar archivos…');
  try {
    console.info('[Biblioteca] Revisar selección', config);
    const result = await window.serato.run({ ...config, simulate: true });
    renderSummary(result.summary);
    reviewed = config;
    $('review-origin').textContent = `Origen: ${config.root}`;
    $('review-folders').textContent = `Carpetas: ${config.folders.join(' · ')}`;
    showStep(3);
    status('Resumen listo. Todavía no se ha modificado ningún archivo.');
    notifyCompletion('Resumen listo', 'La revisión terminó sin modificar archivos. Revisa los conteos antes de confirmar.');
  } catch (error) { status(error.message, true); notifyCompletion('No se pudo completar la revisión', error.message, true); }
  finally { lock(false); }
}
$('start').onclick = () => { if (!locked) { prepareSound(); showStep(1); status('Elige el disco para comenzar.'); } };
$('help').onclick = () => { if (!locked) showStep(0); };
$('next').onclick = async () => {
  if (locked) return;
  if (step === 1) { if (await loadFolders()) showStep(2); }
  else if (step === 2) await review();
};
$('back').onclick = () => { if (!locked) { reviewed = null; showStep(step - 1); status('Ajusta tu selección y continúa para revisar el resumen.'); } };
$('generate').onclick = async () => {
  if (locked || !reviewed) return;
  prepareSound();
  $('completion').hidden = true;
  lock(true); status('Preparando la generación…');
  try {
    const result = await window.serato.run({ ...reviewed, simulate: false });
    if (result.canceled) { status('Generación cancelada. No se inició la escritura.'); return; }
    renderSummary(result.summary);
    reviewed = null;
    $('generate').hidden = true;
    status('Biblioteca generada con respaldo. Ya puedes abrir Serato.');
    notifyCompletion('¡Biblioteca lista!', 'La generación terminó y el respaldo quedó guardado. Ya puedes abrir Serato y revisar tus crates.');
  } catch (error) { reviewed = null; $('generate').hidden = true; status(error.message + ' Vuelve atrás para revisar otra vez.', true); notifyCompletion('La generación no se completó', error.message + ' Revisa el registro antes de volver a intentarlo.', true); }
  finally { lock(false); }
};
async function loadDrives(initial) {
  if (locked) return;
  lock(true);
  try {
    const data = await window.serato.drives();
    console.info('[Discos] Disponibles', data.drives);
    const current = $('root').value;
    $('drives').replaceChildren();
    for (const drive of data.drives) { const option = document.createElement('option'); option.value = drive; option.textContent = drive; $('drives').append(option); }
    if (initial) { renderExclusions(data.exclusions); $('root').value = data.drives[0] || ''; }
    else if (data.drives.includes(current)) $('drives').value = current;
  } catch (error) { status(error.message, true); }
  finally { lock(false); }
}
loadDrives(true);
