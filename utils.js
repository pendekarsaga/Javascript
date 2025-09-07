// utils.js
(() => {
  window.__ODH = window.__ODH || {};
  const ns = window.__ODH;

  ns.el = (tag, attrs = {}, ...children) => {
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

  ns.csvEscape = (v) => { if (v == null) return '""'; return `"${String(v).replace(/"/g, '""')}"`; };

  ns.getPointerClient = function(e) {
    if (!e) return { x: 0, y: 0 };
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  };

  ns.makeTokensFromText = function(txt) {
    if (!txt) return [];
    const base = String(txt).toLowerCase();
    const raw = base.split(/[^a-z0-9]+/).filter(Boolean);
    const out = new Set();
    for (const t of raw) {
      out.add(t);
      for (let L = 3; L <= Math.min(6, t.length); L++) { out.add(t.slice(0, L)); }
    }
    return Array.from(out);
  };

  ns.withSearchTextAndTokens = function(prod) {
    const txt = [ (prod.default_code || ''), (prod.name || ''), (prod.barcode || '') ].join(' ').toLowerCase();
    const tokens = ns.makeTokensFromText(txt);
    return Object.assign({}, prod, { search_text: txt, tokens });
  };

  ns.uiLog = function(msg) {
    try {
      const box = document.getElementById('odoo-log');
      if (box) { const now = new Date(); const line = document.createElement('div'); line.textContent = `${now.toLocaleTimeString()} — ${msg}`; box.appendChild(line); box.scrollTop = box.scrollHeight; return; }
    } catch(e){}
    console.log('ODH:', msg);
  };

  console.log('ODH utils loaded');
})();