import { decodeGameCode } from './sharing.js';
import { el } from './dom.js';
import { icon } from './icons.js';

export function openBuildImport(index, onImport) {
  const existing = document.querySelector('#build-import');
  if (existing) { existing.querySelector('textarea').focus(); return; }
  const opener = document.activeElement;
  const dialog = el('dialog', 'build-import');
  dialog.id = 'build-import';
  dialog.setAttribute('aria-labelledby', 'build-import-title');
  const form = document.createElement('form');
  const header = el('header', 'build-import-header');
  const title = el('h2', null, 'Import build');
  title.id = 'build-import-title';
  const cancel = el('button', null, 'Cancel');
  cancel.type = 'button';
  cancel.id = 'import-cancel';
  header.append(title, cancel);
  const label = el('label', 'build-import-label', 'Paste an export code or build JSON');
  label.htmlFor = 'import-text';
  const text = document.createElement('textarea');
  text.id = 'import-text';
  text.spellcheck = false;
  text.rows = 6;
  text.maxLength = 1500000;
  text.placeholder = 'TYR01_…';
  const fileLabel = el('label', 'build-import-file', 'Or open a file');
  const file = document.createElement('input');
  file.type = 'file';
  file.id = 'import-file';
  file.accept = '.json,.txt,application/json,text/plain';
  fileLabel.append(file);
  const error = el('p', 'build-import-error');
  error.id = 'import-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const footer = el('footer', 'build-import-actions');
  const submit = el('button', 'build-import-submit');
  submit.type = 'submit';
  submit.id = 'import-submit';
  submit.append(icon('import'), document.createTextNode('Import build'));
  footer.append(submit);
  form.append(header, label, text, fileLabel, error, footer);
  dialog.append(form);
  document.body.append(dialog);
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let busy = false;
  const showError = (message) => { error.textContent = message; error.hidden = false; };
  const close = () => dialog.close();
  dialog.addEventListener('close', () => {
    controller.abort();
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  }, { once: true });
  cancel.addEventListener('click', close, options);
  text.addEventListener('input', () => { error.hidden = true; }, options);
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    try {
      if (chosen.size > 1500000) throw new Error('Build files must be smaller than 1.5 MB.');
      const contents = await chosen.text();
      if (!dialog.isConnected) return;
      text.value = contents;
      error.hidden = true;
      submit.focus();
    } catch (failure) {
      if (dialog.isConnected) showError(failure.message);
    }
  }, options);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    error.hidden = true;
    const source = text.value.trim();
    if (!source) { showError('Paste an export code or open a file.'); text.focus(); return; }
    busy = true;
    submit.disabled = true;
    file.disabled = true;
    text.readOnly = true;
    try {
      let imported;
      if (source.startsWith('{')) {
        const raw = JSON.parse(source);
        const selection = raw.selection || raw.sel || raw;
        if (!selection || typeof selection !== 'object' || !index.vehicleById.has(selection.vehicleId)) throw new Error('JSON must contain a build selection with a known vehicleId.');
        imported = { selection, name: raw.title || raw.name || raw.t || '', warnings: [] };
      } else {
        imported = await decodeGameCode(index, source);
      }
      if (!dialog.isConnected || !dialog.open) return;
      close();
      onImport(imported);
    } catch (failure) {
      if (dialog.isConnected) showError(failure.message || 'Could not import this build.');
    } finally {
      busy = false;
      submit.disabled = false;
      file.disabled = false;
      text.readOnly = false;
    }
  }, options);
  dialog.showModal();
  text.focus();
}
