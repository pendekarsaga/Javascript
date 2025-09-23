(async function saveWithInlineAssetsFixed(opts = {}) {
  // CONFIG
  const BUTTON_SELECTOR = opts.buttonSelector || "button.task__solution";
  const ANSWER_SELECTOR = opts.answerSelector || ".task__answer";
  const CLICK_DELAY = opts.clickDelay || 300;
  const FINAL_WAIT = opts.finalWait || 800;
  const SCROLL_STEP_DELAY = opts.scrollStepDelay || 120;
  const FETCH_TIMEOUT_MS = opts.fetchTimeoutMs || 10000;
  const MAX_INLINE_BYTES = opts.maxInlineBytes || 30 * 1024 * 1024; // 30MB

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  function sanitizeFilename(s){ return s.replace(/[:?<>\\\/\*\|"]/g, '-').slice(0,160); }
  function absUrl(url, base){ try{ return (new URL(url, base)).href }catch(e){ return url } }

  function arrayBufferToBase64(buffer){
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const sub = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, sub);
    }
    return btoa(binary);
  }

  async function fetchArrayBufferWithTimeout(url, timeoutMs){
    const controller = new AbortController();
    const id = setTimeout(()=>controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {signal: controller.signal, credentials: 'omit', mode: 'cors'});
      clearTimeout(id);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const ab = await resp.arrayBuffer();
      return {arrayBuffer: ab, contentType: resp.headers.get('content-type') || ''};
    } catch(err){
      clearTimeout(id);
      throw err;
    }
  }

  async function fetchAsDataUrl(url){
    const abs = absUrl(url, location.href);
    try {
      const {arrayBuffer, contentType} = await fetchArrayBufferWithTimeout(abs, FETCH_TIMEOUT_MS);
      if (arrayBuffer.byteLength > MAX_INLINE_BYTES) throw new Error("Resource too large to inline: " + arrayBuffer.byteLength);
      const b64 = arrayBufferToBase64(arrayBuffer);
      const mime = contentType || guessMimeFromUrl(abs) || 'application/octet-stream';
      return `data:${mime};base64,${b64}`;
    } catch(e){
      throw new Error("Failed to fetch/convert: " + url + " => " + (e && e.message));
    }
  }

  function guessMimeFromUrl(url){
    const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
    const map = {
      'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','gif':'image/gif','webp':'image/webp',
      'svg':'image/svg+xml','woff':'font/woff','woff2':'font/woff2','ttf':'font/ttf','otf':'font/otf',
      'eot':'application/vnd.ms-fontobject','css':'text/css','js':'application/javascript','mp4':'video/mp4'
    };
    return map[ext] || null;
  }

  async function inlineResourcesInCss(cssText, cssHref){
    const found = new Map();
    const urlRegex = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
    const importRegex = /@import\s+(?:url\()?['"]?(.*?)['"]?\)?\s*;/g;
    const candidates = new Set();
    let m;
    while ((m = urlRegex.exec(cssText)) !== null) {
      const p = m[2].trim();
      if (!p || /^data:/i.test(p)) continue;
      candidates.add(p);
    }
    while ((m = importRegex.exec(cssText)) !== null) {
      const p = m[1].trim();
      if (!p || /^data:/i.test(p)) continue;
      candidates.add(p);
    }
    const promises = Array.from(candidates).map(async (relPath) => {
      const abs = absUrl(relPath, cssHref);
      try {
        const dataUrl = await fetchAsDataUrl(abs);
        found.set(relPath, dataUrl);
        console.log("Inlined asset in CSS:", abs);
      } catch(err){
        found.set(relPath, null);
        console.warn("Could not inline asset in CSS (kept URL):", abs, err.message || err);
      }
    });
    await Promise.all(promises);
    const replaced = cssText.replace(urlRegex, (m, q, path) => {
      if (/^\s*data:/i.test(path)) return m;
      const val = found.get(path);
      if (val) return `url(${q}${val}${q})`;
      const absKey = absUrl(path, cssHref);
      for (const [k,v] of found.entries()){
        if (absUrl(k, cssHref) === absKey && v) return `url(${q}${v}${q})`;
      }
      return m;
    }).replace(importRegex, (m, path) => {
      const val = found.get(path);
      if (val) return `@import "${val}";`;
      const absKey = absUrl(path, cssHref);
      for (const [k,v] of found.entries()){
        if (absUrl(k, cssHref) === absKey && v) return `@import "${v}";`;
      }
      return m;
    });
    return replaced;
  }

  (function insertBase(){
    try {
      const head = document.head || document.getElementsByTagName('head')[0];
      if (!head) return;
      const existing = head.querySelector('base');
      if (existing) existing.remove();
      const b = document.createElement('base');
      b.href = location.href;
      head.insertBefore(b, head.firstChild);
      console.log("Inserted <base href> =>", b.href);
    } catch(e){ console.warn("base insert failed", e); }
  })();

  const linkNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'));
  console.log("Found stylesheet links:", linkNodes.length);
  for (const link of linkNodes) {
    const href = link.getAttribute('href');
    if (!href) continue;
    const cssUrl = absUrl(href, location.href);
    try {
      const controller = new AbortController();
      const id = setTimeout(()=>controller.abort(), FETCH_TIMEOUT_MS);
      const resp = await fetch(cssUrl, {signal: controller.signal, credentials:'omit', mode:'cors'});
      clearTimeout(id);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      let cssText = await resp.text();
      // REMOVE sourceMappingURL references to avoid DevTools trying to load .map files
      cssText = cssText.replace(/\/\*# sourceMappingURL=.*?\*\//g, '');
      cssText = cssText.replace(/\/\/# sourceMappingURL=.*$/gmi, '');
      cssText = await inlineResourcesInCss(cssText, cssUrl);
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-inlined-from', cssUrl);
      styleEl.textContent = `/* inlined from ${cssUrl} */\n` + cssText;
      link.parentNode.insertBefore(styleEl, link);
      link.remove();
      console.log("Inlined CSS:", cssUrl);
    } catch (err) {
      console.warn("Could not inline CSS:", cssUrl, err && err.message ? err.message : err);
    }
  }

  const buttons = Array.from(document.querySelectorAll(BUTTON_SELECTOR));
  console.log("Found", buttons.length, "solution buttons - clicking...");
  for (let i=0;i<buttons.length;i++){
    try {
      const btn = buttons[i];
      btn.scrollIntoView({behavior:"auto", block:"center"});
      btn.dispatchEvent(new MouseEvent('mouseover', {bubbles:true, cancelable:true}));
      btn.click();
    } catch(e){}
    await sleep(CLICK_DELAY);
  }

  document.querySelectorAll(ANSWER_SELECTOR).forEach(el=>{
    try { el.style.display="block"; el.style.maxHeight="none"; el.style.opacity="1"; } catch(e){}
  });

  async function inlineImageElements(){
    const imgs = Array.from(document.querySelectorAll('img[src]'));
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!src || /^data:/i.test(src)) continue;
      try {
        const dataUrl = await fetchAsDataUrl(src);
        img.setAttribute('src', dataUrl);
        console.log("Inlined <img>:", src);
      } catch(err){
        console.warn("Could not inline img:", src, err.message || err);
      }
    }

    const srcsetEls = Array.from(document.querySelectorAll('img[srcset], source[srcset]'));
    for (const el of srcsetEls){
      const s = el.getAttribute('srcset');
      if (!s) continue;
      const parts = s.split(',').map(p => p.trim()).filter(Boolean);
      const newParts = [];
      for (const part of parts){
        const [urlPart, descriptor] = part.split(/\s+/, 2);
        if (!urlPart) continue;
        if (/^data:/i.test(urlPart)) { newParts.push(part); continue; }
        try {
          const dataUrl = await fetchAsDataUrl(urlPart);
          newParts.push(descriptor ? (dataUrl + ' ' + descriptor) : dataUrl);
          console.log("Inlined srcset URL:", urlPart);
        } catch(err){
          console.warn("Could not inline srcset URL:", urlPart, err.message || err);
          newParts.push(part);
        }
      }
      if (newParts.length) el.setAttribute('srcset', newParts.join(', '));
    }

    const sources = Array.from(document.querySelectorAll('source[src]'));
    for (const s of sources){
      const src = s.getAttribute('src');
      if (!src || /^data:/i.test(src)) continue;
      try {
        const dataUrl = await fetchAsDataUrl(src);
        s.setAttribute('src', dataUrl);
        console.log("Inlined <source> src:", src);
      } catch(err){
        console.warn("Could not inline <source>:", src, err.message || err);
      }
    }
  }

  try {
    await inlineImageElements();
  } catch(e){
    console.warn("Error while inlining images:", e && e.message ? e.message : e);
  }

  const step = Math.max(window.innerHeight/2, 300);
  for (let y=0, max=document.body.scrollHeight; y<max; y+=step){
    window.scrollTo(0,y);
    await sleep(SCROLL_STEP_DELAY);
  }
  window.scrollTo(0,0);
  await sleep(FINAL_WAIT);

  try {
    const head = document.head || document.getElementsByTagName('head')[0];
    if (head && !head.querySelector('meta[charset]')) {
      const m = document.createElement('meta');
      m.setAttribute('charset','utf-8');
      if (head.firstChild) head.insertBefore(m, head.firstChild);
      else head.appendChild(m);
      console.log("Inserted meta charset utf-8");
    }
  } catch(e){}

  try {
    const doctype = new XMLSerializer().serializeToString(document.doctype || document.implementation.createDocumentType('html','',''));
    const html = doctype + "\n" + document.documentElement.outerHTML;
    const bom = "\uFEFF";
    const filename = sanitizeFilename((location.hostname||"page")+" - "+(document.title||"page")+" - "+(new Date().toISOString()).replace(/[:.]/g,'-')) + ".html";
    const blob = new Blob([bom, html], {type: "text/html;charset=utf-8"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
    console.log("Saved file:", filename);
  } catch(e){
    console.error("Failed to create/download blob:", e && e.message ? e.message : e);
  }

  return true;
})();