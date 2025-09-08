//-----Odoo Helper v1.5-----
//- Pencarian produk with suggestion list
//- Buat daftar produk & download ke CSV or Copy to Clipboard
//- Chosen Fields & Dynamic Fields
//- Draggable & Resize panel
//- Minimize & Restore panel
//- Offline mode (download & save data produk in IndexedDB)
//- Download data IndexedDB to CSV
//- Superfast Suggestion list in Offline Mode with tokens multiEntry index, worker-based in-memory search
//- Fixed Pencarian produk with settings debounce ms & Stop search if keyword empty
//- add Button gear for UI Offline Control
//- Close panel with CleanUp (removes listeners, worker, globals, style)

(() => {
  if (window.__odoo_tool_injected_v1_5) { console.log('Odoo Helper: already injected (v1.5)'); return; }
  window.__odoo_tool_injected_v1_5 = true;

  const ORIGIN = location.origin;
  const MODEL = 'product.template';
  const SEARCH_ENDPOINT = `${ORIGIN}/web/dataset/call_kw/${MODEL}/web_search_read`;
  const GETVIEWS_ENDPOINT = `${ORIGIN}/web/dataset/call_kw/${MODEL}/get_views`;
  const PRESET_KEY = 'odoo_helper_fields_v2';
  const MIN_KEY = 'odoo_helper_minimized_v2';
  const DB_NAME = 'odoo_helper_db_v4';
  const DB_STORE = 'products';
  const DB_VERSION = 3; // bumped to add 'tokens' multiEntry index

  // keep references we will need to remove listeners later
  const refs = {};
  const handlers = {}; // store handler function refs to remove later
  const styleId = 'odoo-helper-style-v1-5';

  // small helper
  const el = (tag, attrs = {}, ...children) => {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'style' && v && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') { e[k] = !!v; if (v) e.setAttribute(k, ''); else e.removeAttribute(k); }
      else if (k === 'value') { try { e.value = v; } catch { e.setAttribute(k, String(v)); } }
      else if (k in e && typeof e[k] !== 'function') { try { e[k] = v; } catch { e.setAttribute(k, String(v)); } }
      else { if (v !== false && v != null) e.setAttribute(k, String(v)); }
    });
    children.flat().forEach(c => { if (c == null) return; e.append(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  };

  // --- styles (override blur + UI)
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
/* main container */
#odoo-helper-root { position: fixed; right: 12px; top: 80px; width: 520px; height: 580px; z-index: 2147483647; font-family: Inter, Roboto, Arial, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.18); overflow: auto; border-radius: 8px; background: #fff; border:1px solid #ddd; touch-action: none; -webkit-user-select: none; user-select: none; max-width:95vw; max-height:95vh; }
/* force no blur even if page has backdrop-filter on parents */
#odoo-helper-root, #odoo-helper-root * { filter: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; -webkit-filter: none !important; background-clip: padding-box !important; }
#odoo-helper-root.minimized { height: auto !important; width: 260px !important; }
#odoo-helper-root.minimized .body { display: none !important; }
#odoo-helper-root .hdr { cursor: grab; padding:8px 10px; background:#6c5ce7; color:#fff; display:flex; align-items:center; justify-content:space-between; border-radius:8px 8px 0 0; touch-action: none; }
#odoo-helper-root .hdr:active { cursor: grabbing; }
#odoo-helper-root .hdr .title { font-weight:600; font-size:14px; -webkit-user-select: none; user-select: none; }
.hdr-btn { margin-left:6px; background:transparent; border:0; color:#fff; font-size:14px; padding:6px 8px; border-radius:4px; cursor:pointer; pointer-events:auto; }
.hdr-btn:active { transform: translateY(1px); }
#odoo-helper-root .body { display:flex; gap:8px; padding:10px; box-sizing:border-box; }
#odoo-helper-left { width:54%; min-width:290px; background:#fafafa; border:1px solid #eee; border-radius:6px; padding:8px; height:460px; overflow:auto; }
#odoo-helper-right { width:46%; min-width:220px; padding:8px; }
.odoo-suggest-list { margin-top:6px; max-height:260px; overflow:auto; border:1px solid #eee; border-radius:4px; background:#fff; -webkit-overflow-scrolling: touch; }
.odoo-suggest-item { padding:6px 8px; border-bottom:1px solid #f1f1f1; cursor:pointer; display:flex; gap:8px; align-items:center; user-select:none; }
.odoo-suggest-item.active { background:#e6efff; }
.odoo-suggest-item:hover { background:#f4f6ff; }
.odoo-table { width:100%; border-collapse:collapse; }
.odoo-table th, .odoo-table td { border-bottom:1px solid #eee; padding:6px 8px; font-size:13px; text-align:left; vertical-align: middle; }
.odoo-actions { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
.odoo-btn { padding:6px 8px; border-radius:4px; border:1px solid #ddd; background:#fff; cursor:pointer; font-size:13px; }
.odoo-btn.primary { background:#6c5ce7; color:#fff; border-color:#5b4fde; }
.odoo-small { font-size:12px; color:#555; }
#odoo-helper-settings { margin-top:8px; border-top:1px dashed #eee; padding-top:8px; display:none; }
#odoo-helper-settings.visible { display:block; }
#settings-row { display:flex; gap:6px; align-items:center; margin-top:8px; }
.setting-field { display:flex; flex-direction:column; gap:4px; }
#db-count { margin-left:8px; font-weight:700; }
#worker-status { font-size:12px; color:#333; margin-top:6px; }
#odoo-log { max-height:120px; overflow:auto; border:1px solid #eee; background:#fafafa; padding:6px; font-size:12px; }
#odoo-offline-controls { margin-top:8px; border-top:1px dashed #eee; padding-top:8px; }
.resize-handle { position: absolute; right: 6px; bottom: 6px; width: 28px; height: 28px; cursor: se-resize; border-radius:6px; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.04); }
.resize-handle:after { content: "▾▴"; font-size:12px; color:#666; transform: rotate(45deg); }
.progress-wrap { margin-top:8px; border-radius:6px; background:#fff; padding:6px; border:1px solid #eee; }
.progress-bar { width: 100%; height: 10px; background: #f3f3f3; border-radius:6px; overflow: hidden; }
.progress-bar > .bar { height: 100%; width: 0%; background: linear-gradient(90deg, #6c5ce7, #5b4fde); transition: width .2s linear; }
@media (max-width:720px) { #odoo-helper-root { left: 8px !important; right: auto !important; width: calc(100% - 16px); } }
    `;
    document.head.appendChild(s);
  }

  // --- UI root
  const root = el('div', { id: 'odoo-helper-root', role: 'dialog', 'aria-label': 'Odoo Helper' });
  refs.root = root;

  const btnMin = el('button', { class: 'hdr-btn', title: 'Minimize' }, '▁');
  const btnMax = el('button', { class: 'hdr-btn', title: 'Maximize' }, '⬜');
  // create Close button but call cleanup (instead of naive remove)
  const btnClose = el('button', { class: 'hdr-btn', title: 'Close' }, '✕');
  const btnGear = el('button', { class: 'hdr-btn', title: 'Settings' }, '⚙');
  const hdr = el('div', { class: 'hdr', tabindex: 0 }, el('div', { class: 'title' }, 'Odoo Helper (v1.5)'), el('div', {}, btnGear, btnMin, btnMax, btnClose));
  refs.hdr = hdr;
  root.appendChild(hdr);

  const body = el('div', { class: 'body' });
  const left = el('div', { id: 'odoo-helper-left' }, el('div', { class: 'odoo-small' }, 'Daftar Produk Terpilih'), el('div', { id: 'selected-container' }));
  const right = el('div', { id: 'odoo-helper-right' });
  body.appendChild(left);
  body.appendChild(right);
  root.appendChild(body);

  const resizeHandle = el('div', { class: 'resize-handle', title: 'Geser untuk ubah ukuran' });
  refs.resizeHandle = resizeHandle;
  root.appendChild(resizeHandle);
  document.body.appendChild(root);

  // left table area
  const selectedContainer = left.querySelector('#selected-container');
  const table = el('table', { class: 'odoo-table', id: 'selected-table' });
  const thead = el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Produk'), el('th', {}, 'Fields...'), el('th', {}, 'Qty'), el('th', {}, 'Keterangan'), el('th', {}, 'Aksi')));
  table.appendChild(thead);
  const tbody = el('tbody');
  table.appendChild(tbody);
  selectedContainer.appendChild(table);

  const actionsRow = el('div', { class: 'odoo-actions' },
    el('button', { class: 'odoo-btn primary', onclick: downloadCSV }, 'Download CSV'),
    el('button', { class: 'odoo-btn', onclick: copyClipboard }, 'Copy To Clipboard'),
    el('button', { class: 'odoo-btn', onclick: clearAll }, 'Hapus Semua')
  );
  selectedContainer.appendChild(actionsRow);

  // right content
  const searchInput = el('input', { placeholder: 'Ketik untuk mencari (kode / nama / barcode)...', style: { width: '100%', padding: '8px', boxSizing: 'border-box' } });
  const suggestList = el('div', { class: 'odoo-suggest-list', id: 'suggest-list' }, 'Ketik untuk mencari...');
  // settings panel (hidden until gear pressed)
  const settingsBox = el('div', { id: 'odoo-helper-settings' },
    el('div', { class: 'odoo-small' }, 'Pengaturan Fields:'),
    el('div', { id: 'fields-checkboxes', style: { maxHeight: '110px', overflow: 'auto', marginTop: '6px' } }),
    el('div', { id: 'settings-row' },
      el('div', { class: 'setting-field' }, el('label', {}, 'Suggestion limit'), el('input', { type: 'number', id: 'suggest-limit', value: 200, style: { width: '120px' } })),
      el('div', { class: 'setting-field' }, el('label', {}, 'Debounce (ms)'), el('input', { type: 'number', id: 'debounce-ms', value: 160, style: { width: '120px' } })),
      el('div', { class: 'setting-field' }, el('label', {}, 'Mode Offline'), el('input', { type: 'checkbox', id: 'offline-mode' })),
      el('div', { class: 'setting-field' }, el('label', {}, 'Rebuild Worker'), el('button', { class: 'odoo-btn', onclick: rebuildWorkerFromDB }, 'Build'))
    ),
    el('div', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, el('div', { class: 'odoo-small' }, 'Products in DB: '), el('div', { id: 'db-count' }, '?')),
    el('div', { id: 'worker-status' }, 'Worker: not ready')
  );

  right.appendChild(searchInput);
  right.appendChild(suggestList);
  right.appendChild(settingsBox);

  // offline controls + progress UI
  const progressWrap = el('div', { class: 'progress-wrap', style: { display: 'none' } }, el('div', { class: 'odoo-small' }, 'Progres Import JSON:'), el('div', { class: 'progress-bar' }, el('div', { class: 'bar' })));
  const offlineBox = el('div', { id: 'odoo-offline-controls' },
    el('div', { class: 'odoo-small' }, 'Offline Controls:'),
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
      el('input', { type: 'number', id: 'batch-size', value: 200, style: { width: '84px' }, title: 'Jumlah per batch' }),
      el('button', { class: 'odoo-btn primary', onclick: startFetchAll }, 'Ambil Data Produk'),
      el('button', { class: 'odoo-btn', onclick: stopFetch }, 'Hentikan'),
      el('button', { class: 'odoo-btn', onclick: resumeFetch }, 'Lanjutkan')
    ),
    el('div', { style: { marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      el('button', { class: 'odoo-btn', onclick: clearAllProducts }, 'Hapus Data Produk'),
      el('button', { class: 'odoo-btn', onclick: exportCSVDialog }, 'Unduh CSV'),
      el('button', { class: 'odoo-btn', onclick: downloadJSONBackup }, 'Download JSON'),
      el('button', { class: 'odoo-btn', onclick: triggerLoadJSON }, 'Load JSON (Restore)')
    ),
    el('div', { style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' } }, el('div', { id: 'search-count', style: { marginLeft: 'auto', fontSize: '12px', color: '#333' } }, 'SEARCH_COUNT: ?')),
    el('div', { style: { marginTop: '8px' } }, el('div', { class: 'odoo-small' }, 'Log Proses:'), el('div', { id: 'odoo-log' }))
  );
  right.appendChild(progressWrap);
  right.appendChild(offlineBox);

  // file input for load JSON (hidden)
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: handleLoadJSON });
  refs.fileInput = fileInput;
  document.body.appendChild(fileInput);

  // portable helpers for touch/pointer
  function getPointerClient(e) {
    if (!e) return { x: 0, y: 0 };
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  // --- make draggable but IGNORE clicks on header buttons (fix Android)
  (function makeDraggable(headerEl, containerEl) {
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    function start(e) {
      const tgt = e.target || e.srcElement;
      if (tgt && (tgt.closest && tgt.closest('.hdr-btn'))) { return; }
      const rect = containerEl.getBoundingClientRect();
      if (!containerEl.style.left) { containerEl.style.left = `${rect.left}px`; containerEl.style.top = `${rect.top}px`; containerEl.style.right = 'auto'; }
      const p = getPointerClient(e);
      dragging = true; startX = p.x; startY = p.y;
      const r2 = containerEl.getBoundingClientRect(); startLeft = r2.left; startTop = r2.top;
      document.body.style.userSelect = 'none'; document.body.style.touchAction = 'none';
      if (e.preventDefault) e.preventDefault();
    }
    function move(e) {
      if (!dragging) return;
      const p = getPointerClient(e);
      const dx = p.x - startX, dy = p.y - startY;
      const newLeft = Math.max(6, startLeft + dx);
      const newTop = Math.max(6, startTop + dy);
      const maxLeft = Math.max(6, window.innerWidth - 32);
      containerEl.style.left = Math.min(newLeft, maxLeft) + 'px';
      containerEl.style.top = Math.min(newTop, window.innerHeight - 44) + 'px';
      containerEl.style.right = 'auto';
      if (e.preventDefault) e.preventDefault();
    }
    function end(e) {
      if (!dragging) return;
      dragging = false; document.body.style.userSelect = ''; document.body.style.touchAction = '';
      if (e.preventDefault) e.preventDefault();
    }
    // store handlers so they can be removed later
    handlers.dragStart = start;
    handlers.dragMove = move;
    handlers.dragEnd = end;

    headerEl.addEventListener('pointerdown', handlers.dragStart, { passive: false });
    window.addEventListener('pointermove', handlers.dragMove, { passive: false });
    window.addEventListener('pointerup', handlers.dragEnd, { passive: false });
    headerEl.addEventListener('touchstart', handlers.dragStart, { passive: false });
    window.addEventListener('touchmove', handlers.dragMove, { passive: false });
    window.addEventListener('touchend', handlers.dragEnd, { passive: false });

    headerEl.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 10 : 2;
      const rect = containerEl.getBoundingClientRect();
      if (!containerEl.style.left) containerEl.style.left = `${rect.left}px`;
      if (!containerEl.style.top) containerEl.style.top = `${rect.top}px`;
      if (ev.key === 'ArrowLeft') { containerEl.style.left = (parseFloat(containerEl.style.left) - step) + 'px'; ev.preventDefault(); }
      if (ev.key === 'ArrowRight') { containerEl.style.left = (parseFloat(containerEl.style.left) + step) + 'px'; ev.preventDefault(); }
      if (ev.key === 'ArrowUp') { containerEl.style.top = (parseFloat(containerEl.style.top) - step) + 'px'; ev.preventDefault(); }
      if (ev.key === 'ArrowDown') { containerEl.style.top = (parseFloat(containerEl.style.top) + step) + 'px'; ev.preventDefault(); }
    });
    [btnMin, btnMax, btnClose, btnGear].forEach(b => {
      b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); }, { passive: false });
      b.addEventListener('touchstart', (ev) => { ev.stopPropagation(); }, { passive: false });
    });
  })(hdr, root);

  // --- resize handle
  (function makeResizable(handleEl, containerEl) {
    let resizing = false, startX = 0, startY = 0, startW = 0, startH = 0;
    const minW = 340, minH = 260;
    function start(e) {
      const rect = containerEl.getBoundingClientRect();
      startW = rect.width; startH = rect.height;
      const p = getPointerClient(e); startX = p.x; startY = p.y;
      resizing = true; document.body.style.userSelect = 'none'; document.body.style.touchAction = 'none';
      if (e.preventDefault) e.preventDefault();
    }
    function move(e) {
      if (!resizing) return;
      const p = getPointerClient(e);
      const dx = p.x - startX, dy = p.y - startY;
      const maxW = Math.min(window.innerWidth - 12, Math.max(minW, startW + dx));
      const maxH = Math.min(window.innerHeight - 12, Math.max(minH, startH + dy));
      containerEl.style.width = Math.min(maxW, window.innerWidth - 12) + 'px';
      containerEl.style.height = Math.min(maxH, window.innerHeight - 12) + 'px';
      containerEl.style.right = 'auto';
      if (e.preventDefault) e.preventDefault();
    }
    function end(e) { if (!resizing) return; resizing = false; document.body.style.userSelect = ''; document.body.style.touchAction = ''; if (e.preventDefault) e.preventDefault(); }
    // store handlers so they can be removed later
    handlers.resizeStart = start;
    handlers.resizeMove = move;
    handlers.resizeEnd = end;

    handleEl.addEventListener('pointerdown', handlers.resizeStart, { passive: false });
    window.addEventListener('pointermove', handlers.resizeMove, { passive: false });
    window.addEventListener('pointerup', handlers.resizeEnd, { passive: false });
    handleEl.addEventListener('touchstart', handlers.resizeStart, { passive: false });
    window.addEventListener('touchmove', handlers.resizeMove, { passive: false });
    window.addEventListener('touchend', handlers.resizeEnd, { passive: false });
  })(resizeHandle, root);

  // maximize / restore
  let prevBounds = null;
  function toggleMaximize() {
    const isMax = root.classList.contains('odoo-helper-maximized');
    if (!isMax) {
      prevBounds = { left: root.style.left || '', top: root.style.top || '', width: root.style.width || '', height: root.style.height || '', right: root.style.right || '' };
      root.classList.add('odoo-helper-maximized');
      root.style.left = '8px'; root.style.top = '8px';
      root.style.width = (window.innerWidth - 16) + 'px'; root.style.height = (window.innerHeight - 16) + 'px';
      root.style.right = 'auto'; btnMax.textContent = '🗗';
    } else {
      root.classList.remove('odoo-helper-maximized');
      if (prevBounds) { root.style.left = prevBounds.left; root.style.top = prevBounds.top; root.style.width = prevBounds.width; root.style.height = prevBounds.height; root.style.right = prevBounds.right; } else { root.style.width = ''; root.style.height = ''; }
      btnMax.textContent = '⬜';
    }
  }
  function toggleMinimize() {
    const minimized = root.classList.toggle('minimized');
    btnMin.textContent = minimized ? '▢' : '▁';
    if (minimized) { root.style.width = '260px'; root.style.height = 'auto'; } else { root.style.width = ''; root.style.height = ''; }
    try { localStorage.setItem(MIN_KEY, minimized ? '1' : '0'); } catch {}
  }
  function toggleSettings() {
    settingsBox.classList.toggle('visible');
  }

  // bind header buttons
  btnMin.addEventListener('click', toggleMinimize);
  btnMax.addEventListener('click', toggleMaximize);
  btnGear.addEventListener('click', toggleSettings);

  // IMPORTANT: override default close to perform full cleanup
  btnClose.addEventListener('click', () => {
    cleanupOdooHelper();
  });

  // state
  let availableFields = {};
  let chosenFields = ['default_code', 'name'];
  let suggestions = [];
  let selected = [];
  let activeIndex = -1;
  let fetchController = { running: false, stopRequested: false, offset: 0, limit: 200 };

  // search cache & worker
  let searchCache = null; // array of products for worker build (if we keep copy)
  const CACHE_THRESHOLD = 200000; // very permissive — memory depends on environment
  let cacheBuilding = false;
  let worker = null;
  let workerReady = false;
  let workerBuilding = false;

  // load preset if exists
  try {
    const saved = localStorage.getItem(PRESET_KEY);
    if (saved) { const arr = JSON.parse(saved); if (Array.isArray(arr) && arr.length) chosenFields = arr; }
    const minSaved = localStorage.getItem(MIN_KEY); if (minSaved === '1') { root.classList.add('minimized'); btnMin.textContent = '▢'; root.style.width = '260px'; root.style.height = 'auto'; }
  } catch (e) { /* ignore */ }

  // render field checkboxes
  function renderFieldCheckboxes() {
    const box = document.getElementById('fields-checkboxes'); if (!box) return; box.innerHTML = '';
    Object.keys(availableFields || {}).sort((a,b)=>( (availableFields[a]?.string||a).localeCompare(availableFields[b]?.string||b) ))
      .forEach(fn=>{
        const label = availableFields[fn]?.string || fn;
        const cb = el('div', {}, el('label', {}, el('input', { type: 'checkbox', checked: chosenFields.includes(fn), onchange: (e) => {
          if (e.target.checked) { if (!chosenFields.includes(fn)) chosenFields.push(fn); } else { chosenFields = chosenFields.filter(x => x !== fn); }
          renderSuggestions(); renderSelectedTable();
        } }), ' ', `${label} (${fn})`));
        box.appendChild(cb);
      });
  }

  function savePreset() { try { localStorage.setItem(PRESET_KEY, JSON.stringify(chosenFields)); alert('Preset fields disimpan'); } catch (e) { console.error(e); alert('Gagal menyimpan preset'); } }
  function resetPreset() { chosenFields = ['default_code','name']; try { localStorage.removeItem(PRESET_KEY); } catch {} renderFieldCheckboxes(); renderSuggestions(); renderSelectedTable(); }

  // fetch available fields
  async function fetchAvailableFields() {
    try {
      const payload = { id: 999, jsonrpc: '2.0', method: 'call', params: { model: MODEL, method: 'get_views', args: [], kwargs: { context: { lang: 'id_ID' }, views: [[false,'kanban'],[false,'list'],[false,'form'],[false,'search']], options: {} } } };
      const r = await fetch(GETVIEWS_ENDPOINT, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      const models = j?.result?.models;
      if (models && models[MODEL]) { availableFields = models[MODEL]; renderFieldCheckboxes(); return; }
    } catch (e) { console.warn('get_views failed', e); }
    try {
      const payload2 = { id: 998, jsonrpc: '2.0', method: 'call', params: { model: MODEL, method: 'fields_get', args: [], kwargs: { attributes: ['string','type','help','required','readonly'] } } };
      const r2 = await fetch(`${ORIGIN}/web/dataset/call_kw`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload2) });
      const j2 = await r2.json();
      if (j2 && j2.result) { availableFields = j2.result; renderFieldCheckboxes(); }
    } catch (e) { console.error('fields_get failed', e); }
  }

  // --- search (debounced) + keyboard nav (use configurable debounce)
  let debounceTimer = null;
  searchInput.addEventListener('input', (e)=>{
    const debounceMsEl = document.getElementById('debounce-ms');
    const debounceMs = (debounceMsEl && parseInt(debounceMsEl.value,10)) || 160;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(()=>{
      activeIndex = -1;
      const q = (e.target.value || '').trim();
      if (!q) { suggestions = []; renderEmptyHint(); return; }
      doSearch(q);
    }, debounceMs);
  });
  searchInput.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!suggestions.length) return; activeIndex = Math.min(activeIndex+1, suggestions.length-1); renderSuggestions(); scrollSuggestionIntoView(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (!suggestions.length) return; activeIndex = Math.max(activeIndex-1,0); renderSuggestions(); scrollSuggestionIntoView(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!suggestions.length) return; if (activeIndex < 0) activeIndex = 0; const rec = suggestions[activeIndex]; if (rec) { addSelected(rec, true); activeIndex = -1; renderSuggestions(); } }
    else if (e.key === 'Escape') { activeIndex = -1; renderSuggestions(); }
  });

  function renderEmptyHint() { suggestList.innerHTML = ''; suggestList.textContent = 'Ketik untuk mencari...'; }

  // --- doSearch: online/offline; uses worker when available
  async function doSearch(q) {
    suggestList.innerHTML = 'Mencari...';
    try {
      const offlineMode = document.getElementById('offline-mode').checked;
      const limit = parseInt(document.getElementById('suggest-limit').value,10) || 200;

      if (offlineMode) {
        // Prefer worker
        if (workerReady && !workerBuilding) {
          worker.postMessage({ type: 'search', q: q, limit: limit });
          return;
        }
        // If no worker, try in-memory cache
        if (searchCache && !cacheBuilding) {
          const lower = (q||'').toLowerCase();
          const out = lower ? searchCache.filter(x => (x.search_text || '').includes(lower)).map(x => x) : searchCache.slice(0, limit);
          suggestions = out.slice(0, limit);
          activeIndex = -1; renderSuggestions(); return;
        }
        // Fallback to IndexedDB scan using search_text/index tokens
        const rows = await searchIndexedDB(q, limit);
        suggestions = rows;
        activeIndex = -1; renderSuggestions();
        return;
      }

      // Online search
      let domain = ["&", ["available_in_pos","=",true]];
      if (q) domain = ["&", ["available_in_pos","=",true], "|", "|", "|", ["default_code","ilike", q], ["product_variant_ids.default_code","ilike", q], ["name","ilike", q], ["barcode","ilike", q]];
      const body = { id: 21, jsonrpc: '2.0', method: 'call', params: { model: MODEL, method: 'web_search_read', args: [], kwargs: { limit, offset: 0, order: '', context: { lang: 'id_ID' }, count_limit: 10001, domain, fields: chosenFields.length ? chosenFields : ['id','default_code','name'] } } };
      const r = await fetch(SEARCH_ENDPOINT, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      suggestions = (j && j.result && (j.result.records || j.result)) ? (j.result.records || j.result) : [];
      activeIndex = -1; renderSuggestions();
    } catch (err) {
      console.error(err);
      suggestList.innerHTML = 'Gagal mencari (lihat console)';
    }
  }

  function scrollSuggestionIntoView() {
    const item = suggestList.querySelector('.odoo-suggest-item.active'); if (item) item.scrollIntoView({ block: 'nearest' });
  }

  // render suggestions
  function renderSuggestions() {
    suggestList.innerHTML = '';
    if (!suggestions || suggestions.length === 0) { suggestList.textContent = 'Tidak ada hasil'; return; }
    suggestions.forEach((rec, idx) => {
      const title = rec.name || rec.default_code || `#${rec.id}`;
      const subtitle = chosenFields.filter(f => !['default_code','name'].includes(f)).map(f => {
        const v = rec[f];
        if (Array.isArray(v)) return `${availableFields[f]?.string || f}: ${v[1]}`;
        return (v === 0 || v) ? `${availableFields[f]?.string || f}: ${v}` : null;
      }).filter(Boolean).slice(0,2).join(' • ');
      const item = el('div', { class: 'odoo-suggest-item' + (idx===activeIndex ? ' active' : '') },
        el('div', { style: { flex: '1' } }, el('div', { style: { fontWeight: 600 } }, title), el('div', { class: 'odoo-small' }, subtitle || 'Klik untuk tambahkan'))
      );
      item.addEventListener('click', (ev)=>{ ev.stopPropagation(); addSelected(rec, true); activeIndex = -1; renderSuggestions(); });
      item.addEventListener('touchend', (ev)=>{ ev.stopPropagation(); addSelected(rec, true); activeIndex = -1; renderSuggestions(); });
      item.addEventListener('mouseover', ()=>{ activeIndex = idx; renderSuggestions(); });
      suggestList.appendChild(item);
    });
  }

  // selected list handling
  function addSelected(rec, focusQty=false) {
    if (selected.find(s=>s.record.id===rec.id)) {
      const row = tbody.querySelector(`[data-id="${rec.id}"]`);
      if (row) { row.style.background = '#fffbdd'; setTimeout(()=>row.style.background='',400); }
      return;
    }
    selected.push({ record: rec, qty: '', note: '' });
    renderSelectedTable();
    setTimeout(()=>{
      const row = tbody.querySelector(`[data-id="${rec.id}"]`);
      if (row && focusQty) { const qtyInput = row.querySelector('input[type="number"]'); if (qtyInput) qtyInput.focus(); }
      scrollSelectedToBottom();
    }, 60);
  }

  function renderSelectedTable() {
    tbody.innerHTML = '';
    selected.forEach((s, idx) => {
      const rec = s.record;
      const qtyInput = el('input', { type: 'number', value: s.qty, style: { width: '72px' } });
      qtyInput.addEventListener('change', (e)=>{ s.qty = e.target.value; });
      qtyInput.addEventListener('keydown', (e)=>{ if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const noteEl = tbody.querySelector(`[data-id="${rec.id}"] input[data-role="note"]`); if (noteEl) noteEl.focus(); else searchInput.focus(); } else if (e.key === 'Enter') { e.preventDefault(); const noteEl = tbody.querySelector(`[data-id="${rec.id}"] input[data-role="note"]`); if (noteEl) noteEl.focus(); } });
      const noteInput = el('input', { type: 'text', value: s.note, style: { width: '120px' }, 'data-role': 'note' });
      noteInput.addEventListener('change', (e)=>{ s.note = e.target.value; });
      noteInput.addEventListener('keydown', (e)=>{ if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); searchInput.focus(); } else if (e.key === 'Enter') { e.preventDefault(); searchInput.focus(); } });
      const otherFields = chosenFields.filter(f=>!['default_code','name'].includes(f)).map(f=>{ const v = rec[f]; if (v == null) return ''; if (Array.isArray(v)) return `${availableFields[f]?.string || f}: ${v[1]}`; return `${availableFields[f]?.string || f}: ${v}`; }).join(' • ');
      const tr = el('tr', { 'data-id': rec.id }, el('td', {}, String(idx+1)), el('td', {}, rec.default_code ? `[${rec.default_code}] ${rec.name || ''}` : (rec.name || `#${rec.id}`)), el('td', {}, otherFields), el('td', {}, qtyInput), el('td', {}, noteInput), el('td', {}, el('button', { class: 'odoo-btn', onclick: ()=>{ selected = selected.filter(x=>x.record.id!==rec.id); renderSelectedTable(); } }, 'Hapus')) );
      tbody.appendChild(tr);
    });
  }

  function scrollSelectedToBottom() {
    try { selectedContainer.scrollTop = selectedContainer.scrollHeight; if (tbody.scrollHeight > tbody.clientHeight) tbody.scrollTop = tbody.scrollHeight; } catch (e) {}
  }

  // CSV escape utils
  function csvEscape(v) { if (v == null) return '""'; return `"${String(v).replace(/"/g, '""')}"`; }

  // actions: downloadCSV / copyClipboard / clearAll
  function downloadCSV() {
    if (!selected.length) return alert('Daftar kosong');
    const headers = ['id', ...chosenFields, 'qty', 'keterangan'];
    const rows = [headers.join(',')];
    selected.forEach(s=>{
      const rec = s.record;
      const line = headers.map(h=>{
        if (h === 'id') return rec.id;
        if (h === 'qty') return s.qty || '';
        if (h === 'keterangan') return (s.note||'');
        const v = rec[h];
        if (Array.isArray(v)) return v[1] || '';
        return (v == null) ? '' : String(v);
      }).map(csvEscape).join(',');
      rows.push(line);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `odoo_selected_${(new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function copyClipboard() {
    if (!selected.length) return alert('Daftar kosong');
    const headers = ['id', ...chosenFields, 'qty', 'keterangan'];
    const lines = [headers.join('\t')];
    selected.forEach(s=>{
      const rec = s.record;
      const line = headers.map(h=>{
        if (h === 'id') return rec.id;
        if (h === 'qty') return s.qty || '';
        if (h === 'keterangan') return s.note || '';
        const v = rec[h];
        if (Array.isArray(v)) return v[1] || '';
        return (v == null) ? '' : String(v);
      }).join('\t');
      lines.push(line);
    });
    navigator.clipboard.writeText(lines.join('\n')).then(()=>alert('Disalin ke clipboard. Paste di Excel.'), (err)=>{ console.error(err); alert('Gagal copy clipboard'); });
  }

  function clearAll() { if (!confirm('Hapus semua produk terpilih?')) return; selected = []; renderSelectedTable(); }

  // --- IndexedDB helpers (with tokens multiEntry index)
  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          const store = db.createObjectStore(DB_STORE, { keyPath: 'id' });
          try {
            store.createIndex('search_text', 'search_text', { unique: false });
            store.createIndex('default_code', 'default_code', { unique: false });
            store.createIndex('name', 'name', { unique: false });
            store.createIndex('barcode', 'barcode', { unique: false });
            // tokens index as multiEntry for fast token intersection queries
            store.createIndex('tokens', 'tokens', { unique: false, multiEntry: true });
          } catch(e){}
        } else {
          const txn = ev.target.transaction;
          try {
            const store = txn.objectStore(DB_STORE);
            if (!store.indexNames.contains('search_text')) store.createIndex('search_text', 'search_text', { unique: false });
            if (!store.indexNames.contains('tokens')) store.createIndex('tokens', 'tokens', { unique: false, multiEntry: true });
            if (!store.indexNames.contains('default_code')) store.createIndex('default_code', 'default_code', { unique: false });
            if (!store.indexNames.contains('name')) store.createIndex('name', 'name', { unique: false });
            if (!store.indexNames.contains('barcode')) store.createIndex('barcode', 'barcode', { unique: false });
          } catch(e) { console.warn('upgrade index create failed', e); }
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  // tokenization helpers
  function makeTokensFromText(txt) {
    if (!txt) return [];
    const base = String(txt).toLowerCase();
    const raw = base.split(/[^a-z0-9]+/).filter(Boolean);
    const out = new Set();
    for (const t of raw) {
      out.add(t);
      // add prefixes to help prefix-ish fuzzy search (limit lengths)
      for (let L = 3; L <= Math.min(6, t.length); L++) { out.add(t.slice(0, L)); }
    }
    return Array.from(out);
  }
  function withSearchTextAndTokens(prod) {
    const txt = [ (prod.default_code || ''), (prod.name || ''), (prod.barcode || '') ].join(' ').toLowerCase();
    const tokens = makeTokensFromText(txt);
    return Object.assign({}, prod, { search_text: txt, tokens });
  }

  async function saveProductsBatch(products) {
    if (!products || !products.length) return;
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction([DB_STORE], 'readwrite');
      const st = tx.objectStore(DB_STORE);
      products.forEach(p => {
        try { st.put(withSearchTextAndTokens(p)); } catch (e) { console.warn('put error', e); }
      });
      tx.oncomplete = async () => {
        db.close();
        // update cache if exists
        if (searchCache) {
          products.forEach(p => {
            const p2 = withSearchTextAndTokens(p);
            searchCache.push(p2);
          });
        }
        try { const cnt = await getProductsCount(); document.getElementById('db-count').textContent = cnt; } catch(e){}
        res(true);
      };
      tx.onerror = (e) => { console.error('tx error', e); rej(e); };
    });
  }

  async function clearAllProducts() {
    if (!confirm('Hapus semua data produk di IndexedDB?')) return;
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction([DB_STORE], 'readwrite');
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = () => { db.close(); searchCache = null; log('IndexedDB: dihapus semua'); document.getElementById('db-count').textContent = '0'; res(true); };
      tx.onerror = (e) => { console.error(e); rej(e); };
    });
  }

  async function getProductsCount() {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction([DB_STORE], 'readonly');
      const st = tx.objectStore(DB_STORE);
      const req = st.count();
      req.onsuccess = () => { db.close(); res(req.result); };
      req.onerror = () => { db.close(); rej(req.error); };
    });
  }

  async function getAllProductsGenerator() {
    const db = await openDB();
    const tx = db.transaction([DB_STORE], 'readonly');
    const st = tx.objectStore(DB_STORE);
    const req = st.openCursor();
    return new Promise((res, rej) => {
      const arr = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { arr.push(cursor.value); cursor.continue(); } else { db.close(); res(arr); }
      };
      req.onerror = (e) => { db.close(); rej(e); };
    });
  }

  // Use search_text index — openCursor on index and match includes - fallback
  async function searchIndexedDB(q, limit = 200) {
    const db = await openDB();
    const tx = db.transaction([DB_STORE], 'readonly');
    const st = tx.objectStore(DB_STORE);
    let idxStore;
    try { idxStore = st.index('search_text'); } catch (e) { idxStore = null; }
    const lower = (q || '').toLowerCase();
    return new Promise((res, rej) => {
      const out = [];
      const req = (idxStore ? idxStore.openCursor() : st.openCursor());
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const v = cursor.value;
          const hay = v.search_text || (((v.name||'') + ' ' + (v.default_code||'') + ' ' + (v.barcode||'')).toLowerCase());
          if (!lower || (hay && hay.includes(lower))) out.push(v);
          if (out.length >= limit) { db.close(); res(out.slice(0, limit)); return; }
          cursor.continue();
        } else { db.close(); res(out); }
      };
      req.onerror = (e) => { db.close(); rej(e); };
    });
  }

  // Fetch all data from server (batch)
  async function startFetchAll() {
    if (fetchController.running) { alert('Proses pengambilan sedang berjalan'); return; }
    const batchSizeEl = document.getElementById('batch-size');
    const limit = parseInt(batchSizeEl.value) || 200;
    fetchController.limit = limit; fetchController.stopRequested = false; fetchController.running = true; fetchController.offset = 0;
    log('Mulai mengambil data produk...');
    try {
      const count = await fetchSearchCount();
      document.getElementById('search-count').textContent = `SEARCH_COUNT: ${count}`;
      let total = count; let offset = 0; let chunkNo = 0;
      while (!fetchController.stopRequested && offset < total) {
        chunkNo++; log(`Mengambil batch ${chunkNo} (offset ${offset})`);
        const rows = await fetchChunk(offset, fetchController.limit);
        if (!rows || rows.length === 0) { log('Tidak ada data di batch ini, berhenti.'); break; }
        await saveProductsBatch(rows);
        offset += rows.length; fetchController.offset = offset;
        const savedCount = await getProductsCount();
        log(`Batch ${chunkNo} selesai — disimpan ${rows.length} baris. Total tersimpan: ${savedCount}`);
        await new Promise(r => setTimeout(r, 80));
        if (rows.length < fetchController.limit) break;
      }
      log('Proses ambil data selesai / dihentikan.');
    } catch (e) { console.error(e); log('Error saat mengambil data: ' + (e && e.message)); }
    fetchController.running = false; fetchController.stopRequested = false;
    const finalCount = await getProductsCount(); document.getElementById('search-count').textContent = `SEARCH_COUNT: ${finalCount}`; document.getElementById('db-count').textContent = finalCount;
    // rebuild worker with new DB content
    rebuildWorkerFromDB();
  }

  function stopFetch() { if (!fetchController.running) return log('Tidak ada proses yang berjalan'); fetchController.stopRequested = true; log('Permintaan hentikan dikirim. Menunggu batch berjalan selesai...'); }
  function resumeFetch() { if (fetchController.running && !fetchController.stopRequested) return log('Sudah berjalan'); if (!fetchController.running && fetchController.offset) { fetchController.stopRequested = false; fetchController.running = true; log('Melanjutkan dari offset ' + fetchController.offset); resumeLoop(); } else if (!fetchController.running && !fetchController.offset) { startFetchAll(); } }

  async function resumeLoop() {
    try {
      const total = await fetchSearchCount();
      let offset = fetchController.offset || 0; let chunkNo = Math.floor(offset / fetchController.limit) + 1;
      while (!fetchController.stopRequested && offset < total) {
        chunkNo++; log(`Melanjutkan batch ${chunkNo} (offset ${offset})`);
        const rows = await fetchChunk(offset, fetchController.limit);
        if (!rows || rows.length === 0) { log('Tidak ada data di batch ini, berhenti.'); break; }
        await saveProductsBatch(rows);
        offset += rows.length; fetchController.offset = offset;
        const savedCount = await getProductsCount();
        log(`Batch ${chunkNo} selesai — disimpan ${rows.length} baris. Total tersimpan: ${savedCount}`);
        await new Promise(r => setTimeout(r, 80));
        if (rows.length < fetchController.limit) break;
      }
      log('Resume: selesai / dihentikan.');
    } catch (e) { console.error(e); log('Error resume: ' + (e && e.message)); }
    fetchController.running = false; fetchController.stopRequested = false;
    const finalCount = await getProductsCount(); document.getElementById('search-count').textContent = `SEARCH_COUNT: ${finalCount}`; document.getElementById('db-count').textContent = finalCount;
    rebuildWorkerFromDB();
  }

  async function fetchSearchCount() {
    try {
      const payload = { id: 1, jsonrpc: '2.0', method: 'call', params: { model: MODEL, method: 'search_count', args: [], kwargs: { domain: [], context: { lang: 'id_ID' } } } };
      const r = await fetch('/web/dataset/call_kw', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      const v = j && j.result;
      return (typeof v === 'number') ? v : (j && j.result && j.result.length) || 0;
    } catch (e) { console.warn('search_count failed', e); return 0; }
  }

  async function fetchChunk(offset, limit) {
    try {
      const body = { id: 2, jsonrpc: '2.0', method: 'call', params: { model: MODEL, method: 'web_search_read', args: [], kwargs: { fields: chosenFields.length ? chosenFields : ['id','default_code','name','barcode','list_price'], limit, offset, domain: [], context: { lang: 'id_ID' } } } };
      const r = await fetch(SEARCH_ENDPOINT, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j) return [];
      if (j.result && j.result.records) return j.result.records;
      if (Array.isArray(j.result)) return j.result; return [];
    } catch (e) { console.error('fetchChunk error', e); return []; }
  }

  function log(msg) {
    const box = document.getElementById('odoo-log'); if (!box) return;
    const now = new Date(); const line = document.createElement('div'); line.textContent = `${now.toLocaleTimeString()} — ${msg}`; box.appendChild(line); box.scrollTop = box.scrollHeight;
  }

  // --- IndexedDB export/import utilities (unchanged)
  function exportCSVDialog() {
    const defaultFields = chosenFields.slice();
    const fieldsText = defaultFields.join(', ');
    const segPrompt = `Pilih opsi export:\n1) ketik 0 untuk single file\n2) ketik angka >0 untuk ukuran segment (baris per file)\n\nCurrent fields: ${fieldsText}\nMasukkan segment size (contoh 0 atau 10000):`;
    const seg = prompt(segPrompt, '0'); if (seg == null) return; const segSize = parseInt(seg,10) || 0;
    exportCSVFromIndexedDB({ fields: defaultFields, segmentSize: segSize });
  }

  async function exportCSVFromIndexedDB({ fields = null, segmentSize = 0 } = {}) {
    const dbCount = await getProductsCount(); if (!dbCount) return alert('Tidak ada data di IndexedDB');
    fields = (fields && fields.length) ? fields : await getAllFieldKeys();
    const headers = ['id', ...fields];
    if (!segmentSize || segmentSize <= 0) {
      const all = await getAllProductsGenerator();
      const rows = [headers.join(',')];
      all.forEach(p => {
        const line = headers.map(h => {
          const v = p[h];
          if (Array.isArray(v)) return v[1] || ''; return (v == null) ? '' : String(v);
        }).map(csvEscape).join(',');
        rows.push(line);
      });
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `odoo_offline_all_${(new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      return;
    }
    // segmented export (unchanged)
    const total = dbCount; const parts = Math.ceil(total / segmentSize);
    log(`Export segmented: ${total} rows → ${parts} file(s) of ${segmentSize}`);
    const db = await openDB();
    const tx = db.transaction([DB_STORE], 'readonly');
    const st = tx.objectStore(DB_STORE);
    const req = st.openCursor();
    let buffer = []; let idx = 0; let partNo = 1;
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const v = cursor.value; idx++; buffer.push(v);
        if (buffer.length >= segmentSize) {
          const csvRows = [headers.join(',')];
          buffer.forEach(p => { const row = headers.map(h => { const vv = p[h]; if (Array.isArray(vv)) return vv[1] || ''; return (vv == null) ? '' : String(vv); }).map(csvEscape).join(','); csvRows.push(row); });
          const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `odoo_offline_part_${partNo}_${(new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
          log(`Dibuat file part ${partNo} (${buffer.length} baris)`); partNo++; buffer = [];
        }
        cursor.continue();
      } else {
        if (buffer.length) {
          const csvRows = [headers.join(',')];
          buffer.forEach(p => { const row = headers.map(h => { const vv = p[h]; if (Array.isArray(vv)) return vv[1] || ''; return (vv == null) ? '' : String(vv); }).map(csvEscape).join(','); csvRows.push(row); });
          const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `odoo_offline_part_${partNo}_${(new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
          log(`Dibuat file part ${partNo} (${buffer.length} baris)`);
        }
        db.close();
      }
    };
    req.onerror = (e) => { console.error('cursor error', e); db.close(); };
  }

  async function getAllFieldKeys() {
    const keys = Object.keys(availableFields || {});
    if (keys && keys.length) return keys.filter(k=>k!=='__last_update');
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction([DB_STORE], 'readonly'); const st = tx.objectStore(DB_STORE); const req = st.openCursor();
      req.onsuccess = (e)=>{ const cursor = e.target.result; if (cursor) { const keys = Object.keys(cursor.value); db.close(); res(keys); } else { db.close(); res(['id','default_code','name','barcode']); } };
      req.onerror = (e)=>{ db.close(); res(['id','default_code','name','barcode']); };
    });
  }

  // JSON backup / restore with progress (ensure tokens exist)
  async function downloadJSONBackup() {
    const all = await getAllProductsGenerator(); if (!all || !all.length) return alert('Tidak ada data untuk backup');
    const data = JSON.stringify(all);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `odoo_offline_backup_${(new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function triggerLoadJSON() { fileInput.click(); }

  async function handleLoadJSON(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const progressEl = progressWrap; const barEl = progressWrap.querySelector('.bar'); progressWrap.style.display = 'block'; barEl.style.width = '0%';
    try {
      const txt = await f.text(); const arr = JSON.parse(txt);
      if (!Array.isArray(arr)) return alert('Format file tidak valid (harus array JSON)');
      const arr2 = arr.map(p => withSearchTextAndTokens(p));
      await saveProductsBatchWithProgress(arr2, (progressPct, doneCount, total) => {
        barEl.style.width = `${progressPct}%`; log(`Restore JSON: ${doneCount}/${total} (${Math.floor(progressPct)}%)`);
      });
      alert('Restore JSON selesai');
      const cnt = await getProductsCount(); document.getElementById('search-count').textContent = `SEARCH_COUNT: ${cnt}`; document.getElementById('db-count').textContent = cnt;
      if (searchCache) { arr2.forEach(p => { searchCache.push(p); }); }
      rebuildWorkerFromDB();
    } catch (err) { console.error(err); alert('Gagal memproses file JSON'); } finally { fileInput.value = ''; progressWrap.style.display = 'none'; }
  }

  async function saveProductsBatchWithProgress(items, onProgress) {
    if (!items || !items.length) return;
    const CHUNK = 500;
    let done = 0;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      await saveProductsBatch(chunk);
      done += chunk.length;
      const pct = Math.min(100, (done / items.length) * 100);
      try { if (typeof onProgress === 'function') onProgress(pct, done, items.length); } catch(e){}
      await new Promise(r => setTimeout(r, 50));
    }
  }

  // -----------------------
  // WEB WORKER: build inverted index (token -> ids) + search
  // -----------------------
  function createWorker() {
    // worker code as string
    const workerCode = `
      let index = {}; // token -> Set of ids (represented as Array for postMessage)
      let products = {}; // id -> product
      function tokenize(txt) {
        if (!txt) return [];
        const base = String(txt).toLowerCase();
        const raw = base.split(/[^a-z0-9]+/).filter(Boolean);
        const out = new Set();
        for (const t of raw) {
          out.add(t);
          for (let L = 3; L <= Math.min(6, t.length); L++) out.add(t.slice(0, L));
        }
        return Array.from(out);
      }
      function addProduct(p) {
        const id = p.id;
        products[id] = p;
        const tokens = p.tokens && p.tokens.length ? p.tokens : tokenize((p.default_code||'')+' '+(p.name||'')+' '+(p.barcode||''));
        for (const t of tokens) {
          if (!index[t]) index[t] = new Set();
          index[t].add(id);
        }
      }
      function build(all) {
        index = {}; products = {};
        for (const p of all) addProduct(p);
        return { count: Object.keys(products).length, tokens: Object.keys(index).length };
      }
      function intersectArrays(arrays) {
        if (!arrays || arrays.length === 0) return [];
        arrays.sort((a,b)=>a.length - b.length);
        const small = arrays[0];
        const setB = new Set(arrays.slice(1).flat());
        return small.filter(id => setB.has(id));
      }
      function search(q, limit) {
        const qs = String(q).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        if (!qs.length) { return []; }
        const tokenMatches = [];
        for (const part of qs) {
          const matchedIds = [];
          for (const tk in index) {
            if (tk.indexOf(part) === 0 || tk.includes(part)) {
              for (const id of index[tk]) matchedIds.push(id);
            }
          }
          tokenMatches.push(Array.from(new Set(matchedIds)));
        }
        let ids = [];
        if (tokenMatches.length === 1) ids = tokenMatches[0];
        else ids = intersectArrays(tokenMatches);
        const scored = ids.map(id => {
          const p = products[id];
          const txt = p.search_text || ((p.name||'')+' '+(p.default_code||'')+' '+(p.barcode||''));
          let score = 0;
          for (const part of qs) if (txt && txt.indexOf(part) !== -1) score++;
          return { id, score };
        }).sort((a,b)=>b.score - a.score);
        const out = scored.slice(0, limit).map(s => products[s.id]);
        return out;
      }

      self.onmessage = (ev) => {
        const data = ev.data;
        if (!data || !data.type) return;
        if (data.type === 'build') {
          try {
            const stats = build(data.products || []);
            self.postMessage({ type: 'built', stats });
          } catch (e) { self.postMessage({ type: 'error', message: String(e) }); }
        } else if (data.type === 'search') {
          try {
            const res = search(data.q || '', data.limit || 200);
            self.postMessage({ type: 'result', results: res });
          } catch (e) { self.postMessage({ type: 'error', message: String(e) }); }
        } else if (data.type === 'clear') {
          index = {}; products = {}; self.postMessage({ type: 'cleared' });
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    return w;
  }

  function setupWorker() {
    if (worker) try { worker.terminate(); } catch(e){}
    worker = createWorker();
    workerReady = false; workerBuilding = false;
    document.getElementById('worker-status').textContent = 'Worker: initializing...';
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (!d) return;
      if (d.type === 'built') {
        workerReady = true; workerBuilding = false;
        document.getElementById('worker-status').textContent = `Worker: ready — products ${d.stats.count}, tokens ${d.stats.tokens}`;
        log(`Worker built: products ${d.stats.count}, tokens ${d.stats.tokens}`);
      } else if (d.type === 'result') {
        suggestions = d.results || [];
        activeIndex = -1; renderSuggestions();
      } else if (d.type === 'error') {
        workerReady = false; workerBuilding = false;
        document.getElementById('worker-status').textContent = `Worker: error`;
        console.error('Worker error:', d.message);
      } else if (d.type === 'cleared') {
        workerReady = false; document.getElementById('worker-status').textContent = 'Worker: cleared';
      }
    };
  }

  async function rebuildWorkerFromDB() {
    if (workerBuilding) return;
    workerBuilding = true;
    document.getElementById('worker-status').textContent = 'Worker: building...';
    setupWorker();
    try {
      const all = await getAllProductsGenerator();
      if (!all || !all.length) { document.getElementById('worker-status').textContent = 'Worker: no data'; workerReady = false; workerBuilding = false; return; }
      const arr = all.map(p => {
        if (!p.tokens || !p.tokens.length) return withSearchTextAndTokens(p);
        if (!p.search_text) p.search_text = ((p.default_code||'')+' '+(p.name||'')+' '+(p.barcode||'')).toLowerCase();
        return p;
      });
      searchCache = arr.slice(0, 200000);
      worker.postMessage({ type: 'build', products: arr });
    } catch (e) {
      console.error('rebuildWorkerFromDB error', e); document.getElementById('worker-status').textContent = 'Worker: build failed'; workerReady = false; workerBuilding = false;
    }
  }

  // quick helper to search by worker
  function workerSearch(q, limit=200) {
    if (!worker || !workerReady) return;
    worker.postMessage({ type: 'search', q, limit });
  }

  // init (async)
  (async function init() {
    const rect = root.getBoundingClientRect();
    if (!root.style.left) {
      if (window.innerWidth < 900) { root.style.left = '8px'; root.style.right = 'auto'; root.style.top = '60px'; root.style.width = Math.min(window.innerWidth - 16, 720) + 'px'; root.style.height = Math.min(window.innerHeight - 120, 520) + 'px'; }
      else { root.style.left = `${Math.max(8, rect.left)}px`; root.style.top = `${Math.max(8, rect.top)}px`; }
    }
    await fetchAvailableFields();
    try {
      const sc = await fetchSearchCount();
      document.getElementById('search-count').textContent = `SEARCH_COUNT: ${sc}`;
    } catch(e) {}
    try { const count = await getProductsCount(); document.getElementById('db-count').textContent = count; if (count && count > 0) { // build worker in background
        rebuildWorkerFromDB();
      } } catch(e){}
  })();

  // JSON load helper: expose minimal API
  window.OdooProductHelper = { addSelected, doSearch, getSuggestions: () => suggestions, getSelected: () => selected, setChosenFields: (arr) => { if (Array.isArray(arr)) { chosenFields = arr; renderFieldCheckboxes(); renderSuggestions(); renderSelectedTable(); } }, openDB, saveProductsBatch, getProductsCount, rebuildWorkerFromDB };

  console.log('Odoo Helper injected (v1.5) - tokens index + worker search + settings UI added.');

  // -----------------------
  // CLEANUP: remove DOM, listeners, worker, global variables
  // -----------------------
  function cleanupOdooHelper() {
    try {
      // stop ongoing fetch loop politely
      try { fetchController.stopRequested = true; fetchController.running = false; } catch(e){}

      // terminate worker
      try { if (worker) { worker.terminate(); worker = null; } } catch(e){}

      // remove event listeners we attached (drag/resize)
      try {
        if (handlers.dragStart && refs.hdr) refs.hdr.removeEventListener('pointerdown', handlers.dragStart);
        if (handlers.dragMove) window.removeEventListener('pointermove', handlers.dragMove);
        if (handlers.dragEnd) window.removeEventListener('pointerup', handlers.dragEnd);
        if (handlers.dragStart && refs.hdr) refs.hdr.removeEventListener('touchstart', handlers.dragStart);
        if (handlers.dragMove) window.removeEventListener('touchmove', handlers.dragMove);
        if (handlers.dragEnd) window.removeEventListener('touchend', handlers.dragEnd);

        if (handlers.resizeStart && refs.resizeHandle) refs.resizeHandle.removeEventListener('pointerdown', handlers.resizeStart);
        if (handlers.resizeMove) window.removeEventListener('pointermove', handlers.resizeMove);
        if (handlers.resizeEnd) window.removeEventListener('pointerup', handlers.resizeEnd);
        if (handlers.resizeStart && refs.resizeHandle) refs.resizeHandle.removeEventListener('touchstart', handlers.resizeStart);
        if (handlers.resizeMove) window.removeEventListener('touchmove', handlers.resizeMove);
        if (handlers.resizeEnd) window.removeEventListener('touchend', handlers.resizeEnd);
      } catch (e) { /* ignore */ }

      // remove UI root
      try { if (refs.root && refs.root.parentNode) refs.root.parentNode.removeChild(refs.root); } catch (e) {}

      // remove style
      try { const s = document.getElementById(styleId); if (s && s.parentNode) s.parentNode.removeChild(s); } catch(e){}

      // remove file input
      try { if (refs.fileInput && refs.fileInput.parentNode) refs.fileInput.parentNode.removeChild(refs.fileInput); } catch(e){}

      // clear timers if any we can control
      try { if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; } } catch (e){}

      // clear caches and large objects
      try {
        availableFields = null;
        chosenFields = null;
        suggestions = null;
        selected = null;
        searchCache = null;
        cacheBuilding = false;
        workerReady = false;
        workerBuilding = false;
        fetchController = { running: false, stopRequested: false, offset: 0, limit: 200 };
      } catch (e){}

      // remove public API
      try { delete window.OdooProductHelper; } catch(e){ window.OdooProductHelper = undefined; }

      // remove injected flag
      try { delete window.__odoo_tool_injected_v1_5; } catch(e){ window.__odoo_tool_injected_v1_5 = false; }

      console.log('Odoo Helper: cleaned up and removed.');
    } catch (err) {
      console.error('cleanup error', err);
    }
  }

  // expose cleanup on window too, so user can call manually if needed
  try { window.cleanupOdooHelper = cleanupOdooHelper; } catch(e){}

})();