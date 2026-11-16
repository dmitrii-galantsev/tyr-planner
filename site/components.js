import { el } from './dom.js';
import { icon } from './icons.js';

let closeActivePicker = null;

export function componentImage(component, className = '') {
  const image = document.createElement('img');
  image.src = new URL(`./images/components/${component.id}.webp`, import.meta.url).href;
  image.alt = component.name;
  image.width = 256;
  image.height = 256;
  image.decoding = 'async';
  image.className = `component-image${className ? ` ${className}` : ''}`;
  return image;
}

function focusSlot(trigger, slotIndex) {
  const target = trigger.isConnected ? trigger : document.querySelector(`[data-focus="comp${slotIndex}"]`);
  target?.focus({ preventScroll: true });
}

function statusBadge(kind, text, iconName) {
  const badge = el('span', `component-status component-status-${kind}`);
  badge.append(icon(iconName), text);
  return badge;
}

function openComponentPicker({ index, selection, vehicle, nativeIds, slotIndex, trigger, onChange }) {
  closeActivePicker?.();
  const dialog = el('dialog', 'component-picker');
  dialog.id = 'component-picker';
  dialog.dataset.slot = String(slotIndex);
  dialog.setAttribute('aria-labelledby', 'component-picker-title');
  dialog.setAttribute('aria-describedby', 'component-picker-help');

  const header = el('header', 'component-picker-header');
  const heading = el('div', 'component-picker-heading');
  const title = el('h2', 'component-picker-title', `${selection.componentIds?.[slotIndex] ? 'Replace' : 'Choose'} component ${slotIndex + 1}`);
  title.id = 'component-picker-title';
  const help = el('p', 'component-picker-help', vehicle.name);
  help.id = 'component-picker-help';
  heading.append(title, help);
  const cancel = el('button', 'component-picker-cancel');
  cancel.id = 'component-picker-cancel';
  cancel.type = 'button';
  cancel.append(icon('reset'), 'Cancel');
  header.append(heading, cancel);

  const searchLabel = el('label', 'component-picker-search');
  searchLabel.htmlFor = 'component-picker-search';
  const search = el('input', 'component-picker-search-input');
  search.id = 'component-picker-search';
  search.type = 'search';
  search.placeholder = 'Search name, effect or category';
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.autofocus = true;
  searchLabel.append(icon('search'), el('span', 'component-visually-hidden', 'Search components by name, effect or category'), search);

  const results = el('div', 'component-picker-results');
  const list = el('ul', 'component-picker-list');
  list.id = 'component-picker-list';
  list.setAttribute('aria-label', 'All components');
  const entries = [];
  for (const component of index.components) {
    const usedInSlot = (selection.componentIds ?? []).findIndex((id, position) => position !== slotIndex && id === component.id);
    const current = selection.componentIds?.[slotIndex] === component.id;
    const native = nativeIds.has(component.id);
    const item = el('li', 'component-picker-item');
    const button = el('button', 'component-option');
    button.type = 'button';
    button.dataset.componentId = component.id;
    button.dataset.native = String(native);
    button.dataset.current = String(current);
    button.disabled = usedInSlot !== -1;
    if (button.disabled) button.dataset.usedInSlot = String(usedInSlot);
    button.setAttribute('aria-pressed', String(current));
    button.setAttribute('aria-label', `${current ? 'Keep' : 'Equip'} ${component.name} in component slot ${slotIndex + 1}`);

    const image = componentImage(component, 'component-option-image');
    image.loading = 'lazy';
    const info = el('span', 'component-option-info');
    const name = el('span', 'component-option-name', component.name);
    const meta = el('span', 'component-option-meta');
    meta.id = `component-picker-${component.id}-meta`;
    meta.append(el('span', 'component-option-category', component.category));
    if (native) meta.append(statusBadge('native', 'Native', 'star'));
    if (current) meta.append(statusBadge('current', 'Equipped here', 'check'));
    if (usedInSlot !== -1) meta.append(statusBadge('used', `Used in slot ${usedInSlot + 1}`, 'lock'));
    const effect = el('span', 'component-option-effect', component.description);
    effect.id = `component-picker-${component.id}-effect`;
    button.setAttribute('aria-describedby', `${meta.id} ${effect.id}`);
    info.append(name, meta);
    button.append(image, info, effect);
    item.append(button);
    list.append(item);
    entries.push({
      item,
      button,
      searchText: `${component.name} ${component.description} ${component.category} ${component.categoryId}`.toLowerCase(),
    });
  }

  const empty = el('p', 'component-picker-empty', 'No matches');
  empty.id = 'component-picker-empty';
  empty.hidden = true;
  results.append(list, empty);
  const footer = el('footer', 'component-picker-footer');
  const count = el('span', 'component-picker-count', `${entries.length} of ${entries.length} components`);
  count.id = 'component-picker-count';
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  count.setAttribute('aria-atomic', 'true');
  footer.append(count);
  dialog.append(header, searchLabel, results, footer);

  const controller = new AbortController();
  const listenerOptions = { signal: controller.signal };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    if (dialog.open) dialog.close();
    dialog.remove();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls');
    if (closeActivePicker === close) closeActivePicker = null;
    focusSlot(trigger, slotIndex);
    queueMicrotask(() => {
      if (!trigger.isConnected && !closeActivePicker) focusSlot(trigger, slotIndex);
    });
  };

  cancel.addEventListener('click', close, listenerOptions);
  dialog.addEventListener('close', close, listenerOptions);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  }, listenerOptions);
  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-component-id]');
    if (!button || !list.contains(button) || button.disabled) return;
    const componentId = button.dataset.componentId;
    if ((selection.componentIds ?? []).some((id, position) => position !== slotIndex && id === componentId)) return;
    close();
    onChange(slotIndex, componentId);
  }, listenerOptions);
  search.addEventListener('input', () => {
    const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const entry of entries) {
      entry.item.hidden = !terms.every((term) => entry.searchText.includes(term));
      if (!entry.item.hidden) visible += 1;
    }
    empty.hidden = visible !== 0;
    count.textContent = `${visible} of ${entries.length} components`;
    results.scrollTop = 0;
  }, listenerOptions);
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    const first = entries.find((entry) => !entry.item.hidden && !entry.button.disabled);
    if (first) {
      event.preventDefault();
      first.button.focus();
    }
  }, listenerOptions);
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [cancel, search, ...entries.filter((entry) => !entry.item.hidden && !entry.button.disabled).map((entry) => entry.button)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!focusable.includes(document.activeElement)) {
      event.preventDefault();
      search.focus();
    }
  }, listenerOptions);

  closeActivePicker = close;
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', dialog.id);
  document.body.append(dialog);
  try {
    dialog.showModal();
    search.focus({ preventScroll: true });
  } catch (error) {
    close();
    throw error;
  }
}

export function createComponentSlots(index, selection, vehicle, onChange) {
  closeActivePicker?.();
  const fragment = document.createDocumentFragment();
  const nativeIds = new Set((vehicle.nativeComponents ?? []).map((native) => native.componentId));
  for (let slotIndex = 0; slotIndex < 3; slotIndex += 1) {
    const component = index.componentById.get(selection.componentIds?.[slotIndex]);
    const row = el('div', 'cslot' + (component ? '' : ' empty'));
    row.dataset.componentSlot = String(slotIndex);
    row.dataset.native = String(Boolean(component && nativeIds.has(component.id)));
    const trigger = el('button', 'cslot-main');
    trigger.type = 'button';
    trigger.id = `component-${slotIndex}`;
    trigger.dataset.focus = `comp${slotIndex}`;
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', component ? `Replace ${component.name} in slot ${slotIndex + 1}` : `Choose a component for slot ${slotIndex + 1}`);
    if (component) {
      const copy = el('span', 'cslot-copy');
      const name = el('span', 'cslot-name', component.name);
      if (nativeIds.has(component.id)) name.append(el('span', 'cslot-native', 'native'));
      copy.append(name, el('span', 'cslot-effect', component.description));
      trigger.append(componentImage(component, 'cslot-art'), copy);
    } else {
      trigger.append(icon('plus'), el('span', 'cslot-add', 'Add component'));
    }
    trigger.addEventListener('click', () => openComponentPicker({ index, selection, vehicle, nativeIds, slotIndex, trigger, onChange }));
    row.append(trigger);
    if (component) {
      const remove = el('button', 'cslot-remove');
      remove.type = 'button';
      remove.dataset.componentRemove = String(slotIndex);
      remove.title = `Remove ${component.name}`;
      remove.setAttribute('aria-label', remove.title);
      remove.append(icon('x'));
      remove.addEventListener('click', () => {
        focusSlot(trigger, slotIndex);
        onChange(slotIndex, '');
      });
      row.append(remove);
    }
    fragment.append(row);
  }
  return fragment;
}
