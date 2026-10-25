/* Shared photo-first gallery for the main site and design preview. */
(() => {
  'use strict';
  const catalogURL = new URL('data.json', document.currentScript.src);
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
    const destination = project.destination || projectURL(project);
    return `<article class="project-card"><a class="cover" href="${destination}" aria-label="${esc(project.title)}">${imageMarkup(cover)}</a><h3 class="project-name"><a href="${destination}">${esc(project.title)} <span aria-hidden="true">↗</span></a></h3></article>`;
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
  function galleryMetrics(grid, count) {
    const gap = parseFloat(getComputedStyle(grid).columnGap);
    return { gap, width: (grid.clientWidth - gap * (count - 1)) / count };
  }
  function photoRatio(photo) {
    return photo.width > 0 && photo.height > 0 ? photo.height / photo.width : 2 / 3;
  }
  // Balance count as well as height. Only new items are assigned: existing
  // photographs never move when another Wander batch is appended.
  function balancedPhotos(items, count, width, gap, initial = Array(count).fill(0)) {
    const columns = Array.from({length:count}, () => []);
    const heights = [...initial];
    const capacity = Math.ceil(items.length / count);
    const entries = items.map((photo,index) => ({photo,index,height:Math.max(130,width * photoRatio(photo)) + gap}));
    const anchored = initial.every(height => height === 0) ? Math.min(count,items.length) : 0;
    const pending = [...entries.slice(0,anchored),...entries.slice(anchored).sort((a,b) => b.height - a.height || a.index - b.index)];
    pending.forEach(entry => {
      const choices = heights.map((height,index) => ({height,index})).filter(choice => columns[choice.index].length < capacity);
      const target = entry.index < anchored ? entry.index : choices.reduce((best,choice) => choice.height < best.height ? choice : best).index;
      columns[target].push(entry);
      heights[target] += entry.height;
    });
    // Small pair exchanges refine the ending without changing column counts.
    // Preserve the first row, then preserve source order within each column.
    for (let pass = 0; pass < 12; pass++) {
      let best = null, improvement = 0;
      for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
        columns[a].forEach((left,i) => columns[b].forEach((right,j) => {
          if (left.index < anchored || right.index < anchored) return;
          const delta = right.height - left.height;
          const gain = heights[a] ** 2 + heights[b] ** 2 - (heights[a] + delta) ** 2 - (heights[b] - delta) ** 2;
          if (gain > improvement + 0.01) { improvement = gain; best = {a,b,i,j,delta}; }
        }));
      }
      if (!best) break;
      const {a,b,i,j,delta} = best;
      [columns[a][i],columns[b][j]] = [columns[b][j],columns[a][i]];
      heights[a] += delta; heights[b] -= delta;
    }
    return columns.map(column => column.sort((a,b) => a.index - b.index));
  }
  function trailMarkup(pool) {
    const count = trailColumns();
    const {width,gap} = galleryMetrics($('#wander-grid'),count);
    return balancedPhotos(pool.slice(0,state.limit),count,width,gap)
      .map(column => `<div class="photo-column">${column.map(({photo,index}) => photoCard(photo,index)).join('')}</div>`).join('');
  }
  function wander() {
    const pool = wanderPhotos();
    main.innerHTML = `<div class="page wander-page"><h1 class="sr-only">Wander</h1><div class="toolbar"><button class="shuffle" data-shuffle><span aria-hidden="true">↻</span> &nbsp; Shuffle</button></div><div class="photo-grid" id="wander-grid"></div>${pool.length > state.limit ? '<button class="load-more" data-more aria-label="Load more photographs">↓</button>' : ''}</div>`;
    $('#wander-grid').innerHTML = pool.length ? trailMarkup(pool) : '<p class="empty">No photos.</p>';
  }
  function layoutSeries() {
    const grid = main.querySelector('.series-gallery');
    if (!grid) return;
    const {width,gap} = galleryMetrics(grid,2);
    const heights = [0,0];
    // DOM and viewer sequence stay unchanged; only physical placement changes.
    grid.classList.add('packed-gallery');
    Array.from(grid.children).forEach(card => {
      const target = heights[0] <= heights[1] ? 0 : 1;
      card.style.width = width + 'px';
      card.style.left = target * (width + gap) + 'px';
      card.style.top = heights[target] + 'px';
      heights[target] += card.getBoundingClientRect().height + gap;
    });
    grid.style.height = Math.max(0,...heights) - gap + 'px';
  }
  function projectPage(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return notFound();
    // Follow the authored projects-index order, never point back into the trail.
    // New, unindexed projects follow the existing sequence alphabetically.
    const sequence = [...projects].sort((a,b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title));
    const following = sequence.slice(sequence.findIndex(p => p.id === id) + 1);
    const exits = [
      {...sequence[0], title:'Projects', destination:'#/projects'},
      {...sequence[sequence.length - 1], title:'Wander', destination:'#/wander'}
    ];
    const nextLinks = [...following.slice(0,2), ...exits].slice(0,2);
    // HTML is generated from the site's own authored Markdown, never user input.
    const story = project.blurb_html || (project.blurb ? `<p>${esc(project.blurb)}</p>` : '');
    const description = project.description || story ? `<section class="project-description" aria-label="Project description">${project.description ? `<p class="project-date">${esc(project.description)}</p>` : ''}${story ? `<div class="project-prose">${story}</div>` : ''}</section>` : '';
    main.innerHTML = `<div class="page"><header class="project-heading"><a class="breadcrumb" href="#/projects" aria-label="All projects">←</a><h1>${esc(project.title)}</h1></header><div class="series-gallery">${project.images.map((p,i) => photoCard(p,i,true)).join('')}</div>${description}<div class="related-grid" aria-label="Other projects">${nextLinks.map(projectCard).join('')}</div></div>`;
    layoutSeries();
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
      const {width,gap} = galleryMetrics($('#wander-grid'),columns.length);
      const heights = Array.from(columns,column => column.getBoundingClientRect().height + gap);
      balancedPhotos(pool.slice(before,state.limit),columns.length,width,gap,heights).forEach((batch,index) => {
        columns[index].insertAdjacentHTML('beforeend',batch.map(({photo,index:offset}) => photoCard(photo,before + offset)).join(''));
      });
      if (pool.length <= state.limit) button.remove();
      else button.textContent = '↓';
      $('#wander-grid').querySelector(`[data-photo="${CSS.escape(pool[before].id)}"]`)?.focus({preventScroll:true});
      $('#announcements').textContent = `${Math.min(state.limit,pool.length)} of ${pool.length} photographs shown`;
    }
  });
  $('#viewer-close').addEventListener('click', () => hideViewer());
  dialog.addEventListener('click', event => {
    if (event.target.closest('button,a')) return;
    const image = $('#viewer-image');
    if (event.target === image) {
      if (!image.naturalWidth || !image.naturalHeight) return;
      // object-fit: contain leaves black space inside the image element too.
      // Only the visible photograph, not that letterboxing, should stay open.
      const box = image.getBoundingClientRect();
      const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      const left = box.left + (box.width - width) / 2;
      const top = box.top + (box.height - height) / 2;
      if (event.clientX >= left && event.clientX <= left + width && event.clientY >= top && event.clientY <= top + height) return;
    }
    hideViewer();
  });
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
    layoutSeries();
  });
  // Covers without explicit dimensions (Jekyll catalog) get packed again when
  // their intrinsic dimensions arrive. Local preview reserves these upfront.
  main.addEventListener('load', event => {
    if (event.target.matches('.series-gallery img')) layoutSeries();
  },true);
  $('.skip-link').addEventListener('click', event => {
    event.preventDefault(); main.focus(); main.scrollIntoView();
  });
  fetch(catalogURL).then(response => {
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