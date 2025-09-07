// db-worker.js
(() => {
  window.__ODH = window.__ODH || {};
  const ns = window.__ODH;
  const DB_NAME = 'odoo_helper_db_v4';
  const DB_STORE = 'products';
  const DB_VERSION = 3;

  ns.openDB = function() {
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
  };

  ns.saveProductsBatch = async function(products) {
    if (!products || !products.length) return;
    const db = await ns.openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction([DB_STORE], 'readwrite');
      const st = tx.objectStore(DB_STORE);
      products.forEach(p => {
        try { st.put(ns.withSearchTextAndTokens(p)); } catch (e) { console.warn('put error', e); }
      });
      tx.oncomplete = async () => {
        db.close();
        try { const cnt = await ns.getProductsCount(); if (document.getElementById('db-count')) document.getElementById('db-count').textContent = cnt; } catch(e){}
        res(true);
      };
      tx.onerror = (e) => { console.error('tx error', e); rej(e); };
    });
  };

  ns.getProductsCount = async function() {
    const db = await ns.openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction([DB_STORE], 'readonly');
      const st = tx.objectStore(DB_STORE);
      const req = st.count();
      req.onsuccess = () => { db.close(); res(req.result); };
      req.onerror = () => { db.close(); rej(req.error); };
    });
  };

  ns.getAllProductsGenerator = async function() {
    const db = await ns.openDB();
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
  };

  ns.clearAllProducts = async function() {
    if (!confirm('Hapus semua data produk di IndexedDB?')) return;
    const db = await ns.openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction([DB_STORE], 'readwrite');
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = () => { db.close(); ns.uiLog('IndexedDB: dihapus semua'); if (document.getElementById('db-count')) document.getElementById('db-count').textContent = '0'; res(true); };
      tx.onerror = (e) => { console.error(e); rej(e); };
    });
  };

  // Worker creation (same algorithm as original)
  ns.createWorker = function() {
    const workerCode = `
      let index = {}; let products = {};
      function tokenize(txt) {
        if (!txt) return [];
        const base = String(txt).toLowerCase();
        const raw = base.split(/[^a-z0-9]+/).filter(Boolean);
        const out = new Set();
        for (const t of raw) { out.add(t); for (let L = 3; L <= Math.min(6, t.length); L++) out.add(t.slice(0, L)); }
        return Array.from(out);
      }
      function addProduct(p) {
        const id = p.id;
        products[id] = p;
        const tokens = p.tokens && p.tokens.length ? p.tokens : tokenize((p.default_code||'')+' '+(p.name||'')+' '+(p.barcode||''));
        for (const t of tokens) { if (!index[t]) index[t] = new Set(); index[t].add(id); }
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
        if (!qs.length) return [];
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
          try { const stats = build(data.products || []); self.postMessage({ type: 'built', stats }); } catch (e) { self.postMessage({ type: 'error', message: String(e) }); }
        } else if (data.type === 'search') {
          try { const res = search(data.q || '', data.limit || 200); self.postMessage({ type: 'result', results: res }); } catch (e) { self.postMessage({ type: 'error', message: String(e) }); }
        } else if (data.type === 'clear') { index = {}; products = {}; self.postMessage({ type: 'cleared' }); }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    return w;
  };

  // worker state on ns
  ns.worker = null;
  ns.workerReady = false;
  ns.workerBuilding = false;

  ns.setupWorker = function() {
    if (ns.worker) try { ns.worker.terminate(); } catch(e){}
    ns.worker = ns.createWorker();
    ns.workerReady = false; ns.workerBuilding = false;
    const statusEl = document.getElementById('worker-status');
    if (statusEl) statusEl.textContent = 'Worker: initializing...';
    ns.worker.onmessage = (ev) => {
      const d = ev.data;
      if (!d) return;
      if (d.type === 'built') {
        ns.workerReady = true; ns.workerBuilding = false;
        if (statusEl) statusEl.textContent = `Worker: ready — products ${d.stats.count}, tokens ${d.stats.tokens}`;
        ns.uiLog(`Worker built: products ${d.stats.count}, tokens ${d.stats.tokens}`);
      } else if (d.type === 'result') {
        window.__ODH.suggestions = d.results || [];
        ns.workerSearchResultHandler && ns.workerSearchResultHandler(d.results || []);
      } else if (d.type === 'error') {
        ns.workerReady = false; ns.workerBuilding = false;
        if (statusEl) statusEl.textContent = `Worker: error`;
        console.error('Worker error:', d.message);
      } else if (d.type === 'cleared') {
        ns.workerReady = false; if (statusEl) statusEl.textContent = 'Worker: cleared';
      }
    };
  };

  ns.rebuildWorkerFromDB = async function() {
    if (ns.workerBuilding) return;
    ns.workerBuilding = true;
    const statusEl = document.getElementById('worker-status');
    if (statusEl) statusEl.textContent = 'Worker: building...';
    ns.setupWorker();
    try {
      const all = await ns.getAllProductsGenerator();
      if (!all || !all.length) { if (statusEl) statusEl.textContent = 'Worker: no data'; ns.workerReady = false; ns.workerBuilding = false; return; }
      const arr = all.map(p => { if (!p.tokens || !p.tokens.length) return ns.withSearchTextAndTokens(p); if (!p.search_text) p.search_text = ((p.default_code||'')+' '+(p.name||'')+' '+(p.barcode||'')).toLowerCase(); return p; });
      // small in-memory cache for fallback
      ns.searchCache = arr.slice(0, 200000);
      ns.worker.postMessage({ type: 'build', products: arr });
    } catch (e) {
      console.error('rebuildWorkerFromDB error', e); if (statusEl) statusEl.textContent = 'Worker: build failed'; ns.workerReady = false; ns.workerBuilding = false;
    }
  };

  ns.workerSearch = function(q, limit=200) { if (!ns.worker || !ns.workerReady) return; ns.worker.postMessage({ type: 'search', q, limit }); };

  console.log('ODH db-worker loaded');
})();