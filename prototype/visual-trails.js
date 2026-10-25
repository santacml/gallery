/* Preview-only visual trails. Rankings are computed offline, never from browser pixels. */
(() => {
  'use strict';
  const indexURL = new URL('visual-index.json', document.currentScript.src);
  const dialog = document.querySelector('.viewer');
  const footer = dialog.querySelector('.viewer-bottom');
  const toggle = document.createElement('button');
  toggle.className = 'visual-trail-toggle';
  toggle.type = 'button';
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 16H3V3h15v2"/><rect x="7" y="7" width="14" height="14" rx="1"/><path d="m7 17 4-4 3 3 2-2 5 5"/><circle cx="16.5" cy="11" r="1"/></svg>';
  toggle.title = 'Explore visually related photographs';
  toggle.setAttribute('aria-label', 'Explore visually related photographs');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'visual-trail-panel');
  toggle.hidden = true;
  const original = document.querySelector('#viewer-original');
  const actions = document.createElement('div');
  actions.className = 'viewer-actions';
  footer.insertBefore(actions, original);
  actions.append(toggle, original);
  const panel = document.createElement('section');
  panel.id = 'visual-trail-panel';
  panel.className = 'visual-trail-panel';
  panel.setAttribute('aria-label', 'Visually related photographs');
  panel.hidden = true;
  dialog.append(panel);
  let index = null, pending = null, current = null, allPhotos = new Map();
  const seenPaths = new Set(), seenGroups = new Set(), history = [];
  let pathIndices = new Map(), goingBack = false;

  function remember(path) {
    seenPaths.add(path);
    const position = pathIndices.get(path);
    if (position !== undefined) seenGroups.add(index.groups[position]);
  }
  function choices() {
    const position = pathIndices.get(current?.id);
    if (position === undefined) return [];
    const ranks = index.matches[position];
    const selected = [], groups = new Set(), projects = new Set();
    function pick(list, crossProject = false) {
      const available = list.filter(i => {
        const photo = allPhotos.get(index.paths[i]);
        return photo && !seenPaths.has(photo.id) && !seenGroups.has(index.groups[i]) &&
          !groups.has(index.groups[i]) && (!crossProject || photo.project.id !== current.project.id);
      });
      const next = available.find(i => !projects.has(allPhotos.get(index.paths[i]).project.id)) ?? available[0];
      if (next === undefined) return null;
      const photo = allPhotos.get(index.paths[next]);
      selected.push(next); groups.add(index.groups[next]); projects.add(photo.project.id);
      return next;
    }
    // Reserve a genuine cross-project connection; fill the other two by palette
    // and light/composition, preferring a different project in each slot.
    const bridge = pick(ranks.bridge, true);
    const palette = pick(ranks.palette);
    const structure = pick(ranks.structure);
    const ordered = [palette, structure, bridge].filter(i => i !== null);
    while (ordered.length < 3) {
      const extra = pick([...ranks.bridge, ...ranks.palette, ...ranks.structure]);
      if (extra === null) break;
      ordered.push(extra);
    }
    return ordered.map(i => allPhotos.get(index.paths[i]));
  }
  function open(path, back = false) {
    goingBack = back;
    document.dispatchEvent(new CustomEvent('gallery:open-photo', {detail:{path}}));
    if (!panel.hidden) toggle.focus({preventScroll:true});
  }
  function render() {
    if (!index || !current) return;
    const suggestions = choices();
    panel.replaceChildren();
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'visual-trail-back'; back.textContent = '←';
    back.title = 'Previous photograph in your trail';
    back.setAttribute('aria-label', back.title);
    back.disabled = history.length < 2;
    back.addEventListener('click', () => {
      history.pop();
      open(history[history.length - 1], true);
    });
    panel.append(back);
    suggestions.forEach(photo => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'visual-trail-photo';
      button.setAttribute('aria-label', `Explore ${photo.caption || 'a photograph'} from ${photo.project.title}`);
      button.title = photo.project.title;
      const image = document.createElement('img');
      // Reuse the gallery's own resolved URL, including local thumbnails/baseurl.
      const original = new URL(document.querySelector('#viewer-original').href);
      const base = original.pathname.slice(0, original.pathname.indexOf('/projects/'));
      image.src = base + (photo.thumbnail || photo.path);
      image.alt = photo.caption || 'Photograph from ' + photo.project.title;
      image.decoding = 'async';
      button.append(image);
      button.addEventListener('click', () => open(photo.id));
      panel.append(button);
    });
    if (!suggestions.length) {
      const finished = document.createElement('span');
      finished.className = 'visual-trail-end'; finished.textContent = '✓';
      finished.setAttribute('role', 'status');
      finished.setAttribute('aria-label', 'You have explored the available visual connections');
      panel.append(finished);
    }
  }
  function setExpanded(expanded) {
    panel.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    if (expanded) render();
  }
  toggle.addEventListener('click', () => setExpanded(panel.hidden));
  // The tray is a control surface, not black backdrop to dismiss the viewer.
  panel.addEventListener('click', event => event.stopPropagation());
  dialog.addEventListener('close', () => setExpanded(false));
  document.addEventListener('gallery:photo', event => {
    current = event.detail.photo;
    allPhotos = new Map(event.detail.photos.map(photo => [photo.id, photo]));
    if (!goingBack && history[history.length - 1] !== current.id) history.push(current.id);
    goingBack = false;
    remember(current.id);
    if (index) {
      toggle.hidden = !pathIndices.has(current.id);
      if (!panel.hidden) render();
      return;
    }
    // Optional enhancement: a missing index never blocks the normal gallery.
    if (!pending) pending = fetch(indexURL).then(response => {
      if (!response.ok) throw new Error('Visual index unavailable');
      return response.json();
    }).then(data => {
      if (data.version !== 1 || !Array.isArray(data.paths) || data.paths.length !== data.groups?.length || data.paths.length !== data.matches?.length) throw new Error('Unsupported visual index');
      index = data;
      pathIndices = new Map(index.paths.map((path,i) => [path,i]));
      seenPaths.forEach(remember);
      toggle.hidden = !pathIndices.has(current.id);
    }).catch(() => { toggle.hidden = true; });
  });
})();