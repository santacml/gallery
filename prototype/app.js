/* Standalone design study. No selectors, scripts, or styles from the live site. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const main = $('#main');
  const dialog = $('.viewer');
  const defaultTags = {
    'postcard-one': ['birds'], 'postcard-two': ['birds'], 'postcard-three': ['birds'],
    'little-bords': ['birds'], 'crows': ['birds'], 'cincy-2020': ['birds'],
    'film': ['film'], 'film-revival': ['film'], 'golden-hour': ['light'], 'aurora': ['light']
  };
  let projects = [], photos = [], base = '', renderedRoute = '', viewerPhotos = [], viewerIndex = 0;
  let returnFocus = null;
  const scrollPositions = new Map();
  const state = { filter: 'all', order: [], limit: 18, projectFilter: 'all' };
  const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const url = path => base + path;
  const imageURL = (photo, thumb = false) => url(thumb && photo.thumbnail ? photo.thumbnail : photo.path);
  const projectURL = project => '#/project/' + encodeURIComponent(project.id);
  const shuffle = list => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  function saveState() {
    try { sessionStorage.setItem('field-notes-wander', JSON.stringify(state)); } catch (_) { /* Private mode is fine. */ }
  }
  function imageMarkup(photo, eager = false) {
    const dimensions = photo.width && photo.height ? ` width="${photo.width}" height="${photo.height}"` : '';
    return `<img src="${esc(imageURL(photo, true))}" alt="${esc(photo.caption || 'Photograph from ' + photo.project.title)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}${dimensions}>`;
  }
  function projectCard(project, index) {
    const cover = project.images.find(image => image.path.toLowerCase() === project.cover.toLowerCase()) || project.images[0];
    return `<article class="project-card"><a class="cover" href="${projectURL(project)}" aria-label="${esc(project.title)}">${imageMarkup(cover)}</a><h3 class="project-name"><a href="${projectURL(project)}">${esc(project.title)} <span aria-hidden="true">↗</span></a></h3></article>`;
  }
  function photoCard(photo, index, series = false) {
    return `<figure class="photo-card"><button class="photo-open" data-photo="${esc(photo.id)}" aria-label="View ${esc(photo.caption || 'photograph ' + (index + 1))} from ${esc(photo.project.title)}">${imageMarkup(photo, series && index === 0)}</button></figure>`;
  }
  function home() {
    const heroProject = projects.find(p => p.id === 'postcard-one') || projects[0];
    const hero = heroProject.images[0];
    const featured = ['little-bords', 'film-revival', 'crows', 'aurora'].map(id => projects.find(p => p.id === id)).filter(Boolean);
    if (!featured.length) featured.push(...projects.slice(0,4));
    main.innerHTML = `<div class="page home-page"><h1 class="sr-only">Birds & Buildings</h1><figure class="hero"><button class="hero-photo photo-open" data-photo="${esc(hero.id)}" aria-label="View ${esc(hero.caption || heroProject.title)}">${imageMarkup(hero,true)}</button></figure><section class="home-projects" aria-label="Projects"><div class="project-grid">${featured.map(projectCard).join('')}</div><a class="text-link all-projects" href="#/projects">Projects ↗</a></section></div>`;
  }
  function projectIndex() {
    const filtered = projects.filter(project => state.projectFilter === 'all' || project.tags.includes(state.projectFilter));
    main.innerHTML = `<div class="page gallery-page"><h1 class="sr-only">Projects</h1><div class="project-grid">${filtered.map(projectCard).join('') || '<p class="empty">No projects.</p>'}</div></div>`;
  }
  function wanderPhotos() {
    const byID = new Map(photos.map(photo => [photo.id,photo]));
    return state.order.map(id => byID.get(id)).filter(photo => photo && (state.filter === 'all' || photo.project.tags.includes(state.filter)));
  }
  function trailColumns() { return window.innerWidth <= 900 ? 2 : 3; }
  function trailMarkup(pool) {
    const columns = Array.from({length:trailColumns()}, () => []);
    pool.slice(0,state.limit).forEach((photo,index) => columns[index % columns.length].push(photoCard(photo,index)));
    return columns.map(column => `<div class="photo-column">${column.join('')}</div>`).join('');
  }
  function wander() {
    const pool = wanderPhotos();
    main.innerHTML = `<div class="page wander-page"><h1 class="sr-only">Wander</h1><div class="toolbar"><button class="shuffle" data-shuffle>↻ &nbsp; Shuffle</button></div><div class="photo-grid" id="wander-grid">${pool.length ? trailMarkup(pool) : '<p class="empty">No photos.</p>'}</div>${pool.length > state.limit ? '<button class="load-more" data-more aria-label="Load more photographs">↓</button>' : ''}</div>`;
  }
  function projectPage(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return notFound();
    const related = projects.find(p => p.id !== id && p.tags.some(tag => project.tags.includes(tag))) || projects.find(p => p.id !== id);
    const contrast = projects.find(p => p.id !== id && p.id !== related?.id && !p.tags.some(tag => project.tags.includes(tag))) || projects.find(p => p.id !== id && p.id !== related?.id);
    main.innerHTML = `<div class="page"><header class="project-heading"><a class="breadcrumb" href="#/projects" aria-label="All projects">←</a><h1>${esc(project.title)}</h1></header><div class="series-gallery">${project.images.map((p,i) => photoCard(p,i,true)).join('')}</div><div class="related-grid" aria-label="Other projects">${related ? projectCard(related,0) : ''}${contrast ? projectCard(contrast,1) : ''}</div></div>`;
  }
  function notFound() {
    main.innerHTML = '<div class="page"><header class="page-intro"><h1>Not found</h1><a href="#/projects">Projects ↗</a></header></div>';
  }
  function currentRoute() {
    const [path,query = ''] = (location.hash.slice(1) || '/').split('?');
    return { path, params: new URLSearchParams(query) };
  }
  function route() {
    const {path,params} = currentRoute();
    if (renderedRoute !== path) {
      if (renderedRoute) scrollPositions.set(renderedRoute,window.scrollY);
      hideViewer(false);
      renderedRoute = path;
      document.querySelectorAll('[data-nav]').forEach(link => {
        const active = path === '/' + link.dataset.nav || (link.dataset.nav === 'projects' && path.startsWith('/project/'));
        if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
      });
      let title = '';
      if (path === '/') home();
      else if (path === '/projects') { projectIndex(); title = 'Projects'; }
      else if (path === '/wander') { wander(); title = 'Wander'; }
      else if (path.startsWith('/project/')) {
        const id = decodeURIComponent(path.slice(9));
        projectPage(id); title = projects.find(p => p.id === id)?.title || 'Not found';
      } else notFound();
      document.title = title ? title + ' — Birds & Buildings' : 'Birds & Buildings';
      window.scrollTo({top:scrollPositions.get(path) || 0,behavior:'instant'});
      main.focus({preventScroll:true});
    }
    const photo = photos.find(p => p.id === params.get('photo'));
    if (photo) openViewer(photo,false);
    else hideViewer(false);
  }
  function setPhotoURL(photo) {
    const {path} = currentRoute();
    history.replaceState(null,'', '#' + path + (photo ? '?photo=' + encodeURIComponent(photo.id) : ''));
  }
  function openViewer(photo, updateURL = true) {
    const {path} = currentRoute();
    viewerPhotos = path === '/wander' ? wanderPhotos() : photo.project.images;
    viewerIndex = viewerPhotos.indexOf(photo);
    if (viewerIndex < 0) { viewerPhotos = photo.project.images; viewerIndex = viewerPhotos.indexOf(photo); }
    if (!dialog.open) { returnFocus = document.activeElement; dialog.showModal(); }
    showPhoto();
    if (updateURL) setPhotoURL(photo);
  }
  function showPhoto() {
    const photo = viewerPhotos[viewerIndex];
    const image = $('#viewer-image');
    $('#viewer-error').hidden = true;
    image.alt = photo.caption || 'Photograph from ' + photo.project.title;
    image.src = imageURL(photo);
    $('#viewer-project').textContent = photo.project.title;
    $('#viewer-caption').textContent = '';
    $('#viewer-series').textContent = photo.project.title + ' ↗';
    $('#viewer-series').href = projectURL(photo.project);
    $('#viewer-original').href = url(photo.xl || photo.path);
    $('#viewer-counter').textContent = '';
    $('#viewer-prev').disabled = viewerIndex === 0;
    $('#viewer-next').disabled = viewerIndex === viewerPhotos.length - 1;
    if (viewerPhotos[viewerIndex + 1]) { const preload = new Image(); preload.src = imageURL(viewerPhotos[viewerIndex + 1]); }
  }
  function step(direction) {
    const next = viewerIndex + direction;
    if (next < 0 || next >= viewerPhotos.length) return;
    viewerIndex = next; showPhoto(); setPhotoURL(viewerPhotos[viewerIndex]);
  }
  function hideViewer(updateURL = true) {
    if (dialog.open) { dialog.close(); if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true}); }
    if (updateURL) setPhotoURL(null);
  }
  main.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.photo) {
      const photo = photos.find(p => p.id === button.dataset.photo);
      if (photo) openViewer(photo);
    } else if (button.dataset.filter) {
      const isWander = button.dataset.scope === 'wander';
      if (isWander) { state.filter = button.dataset.filter; state.limit = 18; wander(); }
      else { state.projectFilter = button.dataset.filter; projectIndex(); }
      saveState();
      main.querySelector(`[data-filter="${button.dataset.filter}"]`)?.focus({preventScroll:true});
      $('#announcements').textContent = isWander ? `${wanderPhotos().length} photographs` : 'Project filter updated';
    } else if (button.hasAttribute('data-shuffle')) {
      state.order = shuffle(photos).map(p => p.id); state.limit = 18; saveState(); wander();
      $('[data-shuffle]').focus({preventScroll:true}); $('#announcements').textContent = 'Shuffled.';
    } else if (button.hasAttribute('data-more')) {
      const pool = wanderPhotos(), before = state.limit;
      state.limit += 18; saveState();
      const columns = $('#wander-grid').querySelectorAll('.photo-column');
      pool.slice(before,state.limit).forEach((photo,index) => {
        const position = before + index;
        columns[position % columns.length].insertAdjacentHTML('beforeend',photoCard(photo,position));
      });
      if (pool.length <= state.limit) button.remove();
      else button.textContent = '↓';
      $('#wander-grid').querySelector(`[data-photo="${CSS.escape(pool[before].id)}"]`)?.focus({preventScroll:true});
      $('#announcements').textContent = `${Math.min(state.limit,pool.length)} of ${pool.length} photographs shown`;
    }
  });
  $('#viewer-close').addEventListener('click', () => hideViewer());
  dialog.addEventListener('cancel', event => { event.preventDefault(); hideViewer(); });
  $('#viewer-prev').addEventListener('click', () => step(-1));
  $('#viewer-next').addEventListener('click', () => step(1));
  $('#viewer-image').addEventListener('error', () => { $('#viewer-error').hidden = false; });
  document.addEventListener('keydown', event => {
    if (!dialog.open) return;
    if (event.key === 'Escape') { event.preventDefault(); hideViewer(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });
  let touchX = null;
  $('.viewer-stage').addEventListener('touchstart', event => { touchX = event.touches.length === 1 ? event.touches[0].clientX : null; },{passive:true});
  $('.viewer-stage').addEventListener('touchend', event => {
    if (touchX === null) return;
    const delta = event.changedTouches[0].clientX - touchX;
    if (Math.abs(delta) > 60) step(delta < 0 ? 1 : -1);
    touchX = null;
  },{passive:true});
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('.theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'paper' ? 'charcoal' : 'paper'} theme`);
    $('meta[name="theme-color"]').content = theme === 'paper' ? '#f2f0e9' : '#191d19';
    try { localStorage.setItem('field-notes-theme',theme); } catch (_) { /* Optional preference. */ }
  }
  try { setTheme(localStorage.getItem('field-notes-theme') || 'paper'); } catch (_) { setTheme('paper'); }
  $('.theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'paper' ? 'charcoal' : 'paper'));
  window.addEventListener('hashchange',route);
  window.addEventListener('resize', () => {
    const grid = $('#wander-grid');
    if (grid && grid.querySelectorAll('.photo-column').length !== trailColumns()) grid.innerHTML = trailMarkup(wanderPhotos());
  });
  $('.skip-link').addEventListener('click', event => {
    event.preventDefault(); main.focus(); main.scrollIntoView();
  });
  fetch('./data.json').then(response => {
    if (!response.ok) throw new Error('Catalog unavailable');
    return response.json();
  }).then(data => {
    base = data.baseurl || '';
    projects = data.projects.filter(p => p.images?.length).map(project => {
      project.tags = Array.isArray(project.tags) && project.tags.length ? project.tags : defaultTags[project.id] || [];
      project.cover = project.cover || project.images[0].path;
      const seen = new Set();
      project.images = project.images.filter(image => {
        const key = image.path.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).map(image => ({ ...image, id: image.path, project }));
      return project;
    });
    // Recently expanded work first. Unknown future projects remain discoverable.
    projects.sort((a,b) => Number(b.updated) - Number(a.updated) || a.title.localeCompare(b.title));
    photos = projects.flatMap(project => project.images);
    try { const saved = JSON.parse(sessionStorage.getItem('field-notes-wander')); if (saved) Object.assign(state,saved); } catch (_) { /* Start fresh. */ }
    const known = new Set(photos.map(p => p.id));
    state.order = Array.isArray(state.order) ? state.order.filter(id => known.has(id)) : [];
    const existing = new Set(state.order);
    const newcomers = shuffle(photos.filter(p => !existing.has(p.id))).map(p => p.id);
    state.order = [...newcomers,...state.order];
    // Clear saved filters from the earlier, text-heavy prototype.
    state.filter = 'all';
    state.projectFilter = 'all';
    state.limit = Number.isFinite(state.limit) ? Math.max(18,state.limit) : 18;
    saveState();
    if (!projects.length) throw new Error('No projects found');
    route();
  }).catch(error => {
    console.error(error);
    main.innerHTML = '<div class="page"><p class="loading" role="alert">Photos couldn’t load. <a href="">Retry ↗</a></p></div>';
  });
})();