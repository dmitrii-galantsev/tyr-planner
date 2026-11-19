import { $, $$, el } from './dom.js';
import { buildUrl, decodeShare, encodeShare, PUBLIC_URL } from './sharing.js';

export function bindPublicLoadouts({ base, vehicles, tankChip, openBuild, getDraft, showLibrary }) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const hosted = base === PUBLIC_URL || local;
  const publish = $('#publish-dialog');
  const profileDialog = $('#profile-dialog');
  const library = $('#public-list');
  const search = $('#public-search');
  const tank = $('#public-tank');
  const status = $('#public-status');
  let profile = null;
  let entries = [];
  let posting;
  let fetching;

  const message = (target, text = '') => {
    target.textContent = text;
    target.hidden = !text;
  };
  async function request(path, body) {
    const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const response = await fetch(new URL(`api/${path}`, base), { ...opt, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || 'Public loadouts are unavailable. Try again shortly.');
    return data;
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const rows = entries.filter((row) => (!tank.value || tank.value === row.vehicleId) && `${row.title} ${row.author}`.toLowerCase().includes(query));
    library.replaceChildren();
    $('#public-count').textContent = `${rows.length} loadout${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) {
      library.append(el('li', 'empty-note', entries.length ? 'No loadouts match.' : 'No public loadouts yet. Publish one from the Build tab.'));
      return;
    }
    for (const row of rows) {
      let build;
      try { build = decodeShare(row.code); } catch { continue; }
      const item = el('li', 'public-row');
      const copy = el('div', 'public-row-copy');
      const v = vehicles.get(row.vehicleId);
      const link = el('a', 'public-row-title', row.title);
      link.href = buildUrl(base, build.sel, row.title);
      link.addEventListener('click', (e) => {
        if (e.button || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        e.preventDefault();
        openBuild(build.sel, row.title);
      });
      const author = el('span', 'public-byline', `${row.author || 'Anonymous'} · ${row.verified ? 'Signed-in profile' : 'Guest'}`);
      copy.append(link, author);
      item.append(copy);
      if (v) item.append(tankChip(v));
      library.append(item);
    }
  }

  async function refresh() {
    if (!hosted || fetching) return fetching;
    message(status, 'Loading public loadouts…');
    fetching = request('loadouts').then((data) => {
      if (!Array.isArray(data.loadouts)) throw Error('Public loadouts are unavailable. Try again shortly.');
      entries = data.loadouts;
      message(status);
      render();
    }).catch((error) => message(status, error.message)).finally(() => { fetching = null; });
    return fetching;
  }

  function showProfile(data) {
    profile = data.profile;
    $('#profile-member').hidden = !profile;
    $('#profile-guest').hidden = !!profile;
    $('#profile-new-key').hidden = !data.key;
    $('#profile-issued-key').value = data.key || '';
    $('#profile-user').textContent = profile ? `Signed in as ${profile.name}` : '';
    $('#public-profile').lastChild.textContent = profile ? 'My profile' : 'Profile';
  }

  function handle(form, target, callback) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('[type=submit]');
      const close = $('[data-close-dialog]', form.closest('dialog'));
      if (button.disabled || close.disabled) return;
      button.disabled = close.disabled = true;
      message(target);
      try { await callback(); }
      catch (error) { message(target, error.message); }
      finally { button.disabled = close.disabled = false; }
    });
  }

  for (const button of $$('[data-close-dialog]')) button.addEventListener('click', () => button.closest('dialog').close());
  for (const dialog of [publish, profileDialog]) {
    dialog.addEventListener('cancel', (e) => {
      if ($('[data-close-dialog]', dialog).disabled) e.preventDefault();
    });
  }
  $('#public-host-note').hidden = hosted;
  $('#public-profile').hidden = !hosted;
  $('#public-controls').hidden = !hosted;
  $('#public-list').hidden = !hosted;
  tank.append(new Option('All tanks', ''));
  for (const v of vehicles.values()) tank.append(new Option(v.name, v.id));
  search.addEventListener('input', render);
  tank.addEventListener('change', render);

  $('#act-publish').addEventListener('click', async () => {
    const draft = getDraft();
    if (!hosted) {
      const url = new URL(PUBLIC_URL);
      url.hash = `s=${encodeShare(draft.sel, draft.title)}`;
      location.assign(url);
      return;
    }
    posting = draft.sel;
    const title = $('#publish-title');
    title.value = draft.title || `${vehicles.get(posting.vehicleId)?.name || 'Tank'} build`;
    $('#publish-author').value = '';
    $('#guest-author').hidden = true;
    message($('#publish-by'));
    message($('#publish-error'));
    const button = $('#publish-form button[type=submit]');
    button.disabled = true;
    publish.showModal();
    try {
      const data = await request('profile');
      profile = data.profile;
      $('#guest-author').hidden = !!profile;
      message($('#publish-by'), profile ? `Posting as ${profile.name}` : '');
      button.disabled = false;
    } catch (error) { message($('#publish-error'), error.message); }
  });

  handle($('#publish-form'), $('#publish-error'), async () => {
    const title = $('#publish-title').value.trim();
    if (!title) throw Error('Enter a loadout title.');
    const code = encodeShare(posting, title);
    await request('loadouts', { title, author: profile ? undefined : $('#publish-author').value.trim(), code });
    publish.close();
    showLibrary();
    search.value = tank.value = '';
    await refresh();
  });

  $('#public-profile').addEventListener('click', async () => {
    message($('#profile-error'));
    profileDialog.showModal();
    try { showProfile(await request('profile')); }
    catch (error) { message($('#profile-error'), error.message); }
  });
  handle($('#profile-create'), $('#profile-error'), async () => {
    showProfile(await request('profile', { action: 'create', name: $('#profile-name').value.trim() }));
    $('#profile-create').reset();
  });
  handle($('#profile-login'), $('#profile-error'), async () => {
    try { showProfile(await request('profile', { action: 'login', key: $('#profile-key').value.trim() })); }
    finally { $('#profile-login').reset(); }
  });
  $('#profile-logout').addEventListener('click', async () => {
    message($('#profile-error'));
    try { showProfile(await request('profile', { action: 'logout' })); }
    catch (error) { message($('#profile-error'), error.message); }
  });
  $('#profile-copy-key').addEventListener('click', async () => {
    const field = $('#profile-issued-key');
    try { await navigator.clipboard.writeText(field.value); }
    catch { field.focus(); field.select(); }
  });
  profileDialog.addEventListener('close', () => {
    $('#profile-issued-key').value = '';
    $('#profile-new-key').hidden = true;
    $('#profile-login').reset();
  });
  return refresh;
}
