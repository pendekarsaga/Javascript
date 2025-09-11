// loader.js - Local tool integrator (final fix)
(() => {
  const fileInput   = document.getElementById('fileInput');
  const chooseBtn   = document.getElementById('chooseBtn');
  const loadBtn     = document.getElementById('loadBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearBtn    = document.getElementById('clearBtn');
  const status      = document.getElementById('status');
  const preview     = document.getElementById('preview');
  const dropzone    = document.getElementById('dropzone');

  let currentJSON = null;

  function setStatus(s) {
    status.innerText = s;
    console.log('[LocalTool]', s);
  }

  function readFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        try { res(JSON.parse(r.result)); } catch(e){ rej(e); }
      };
      r.onerror = () => rej(r.error);
      r.readAsText(file);
    });
  }

  // fungsi untuk preview JSON panjang
  function truncateForPreview(obj){
    try {
      const s = JSON.stringify(obj, null, 2);
      if (s.length > 50000) {
        return s.slice(0, 50000) + "\n...[truncated]";
      }
      return s;
    } catch(e){
      return "{ note: 'preview error', error: '" + e.message + "' }";
    }
  }

  // --- kirim JSON ke Odoo Helper ---
  async function sendToHelper(jsonObj) {
    setStatus('Mengirim data ke Odoo Helper...');

    // Gunakan API dari odooHelper
    if (window.OdooProductHelper && typeof window.OdooProductHelper.saveProductsBatch === 'function') {
      try {
        await window.OdooProductHelper.saveProductsBatch(jsonObj);
        if (typeof window.OdooProductHelper.rebuildWorkerFromDB === 'function') {
          await window.OdooProductHelper.rebuildWorkerFromDB();
        }
        setStatus('✅ JSON berhasil dimasukkan ke IndexedDB lewat OdooProductHelper');
        return;
      } catch (e) {
        console.error(e);
        setStatus('❌ Gagal memproses JSON dengan OdooProductHelper');
        return;
      }
    }

    // fallback kalau API tidak tersedia
    try {
      localStorage.setItem('odoo_helper_data', JSON.stringify(jsonObj));
      window.dispatchEvent(new CustomEvent('odoo-helper-load', {
        detail: { source: 'local-tool', time: Date.now() }
      }));
      setStatus('✅ Data disimpan ke localStorage (tapi Odoo Helper belum baca)');
    } catch (e) {
      console.error(e);
      setStatus('❌ Gagal fallback ke localStorage');
    }
  }

  // --- UI events ---
  chooseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const j = await readFile(f);
      currentJSON = j;
      preview.innerText = truncateForPreview(j);
      loadBtn.disabled = false;
      downloadBtn.disabled = false;
      setStatus('File siap: ' + f.name);
    } catch (e) {
      setStatus('❌ Gagal baca JSON: ' + e.message);
      preview.innerText = '-';
    }
  });

  loadBtn.addEventListener('click', async () => {
    if (!currentJSON) return setStatus('Belum ada file.');
    await sendToHelper(currentJSON);
  });

  downloadBtn.addEventListener('click', () => {
    if (!currentJSON) return;
    const blob = new Blob([JSON.stringify(currentJSON, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'odoo_data_preview.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  clearBtn.addEventListener('click', () => {
    currentJSON = null;
    preview.innerText = '-';
    loadBtn.disabled = true;
    downloadBtn.disabled = true;
    setStatus('Kosong.');
    fileInput.value = '';
  });

  // drag-drop support
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.style.borderColor = '#66a'; });
  dropzone.addEventListener('dragleave', e => { dropzone.style.borderColor = '#aaa'; });
  dropzone.addEventListener('drop', async e => {
    e.preventDefault();
    dropzone.style.borderColor = '#aaa';
    const f = e.dataTransfer.files[0];
    if (!f) return;
    try {
      const j = await readFile(f);
      currentJSON = j;
      preview.innerText = truncateForPreview(j);
      loadBtn.disabled = false;
      downloadBtn.disabled = false;
      setStatus('File siap (drag-drop): ' + f.name);
    } catch (err) {
      setStatus('❌ Gagal baca JSON: ' + err.message);
    }
  });

  // auto-detect kalau ada data tersimpan di localStorage
  const existing = localStorage.getItem('odoo_helper_data');
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      preview.innerText = truncateForPreview(parsed);
      currentJSON = parsed;
      loadBtn.disabled = false;
      downloadBtn.disabled = false;
      setStatus('Menemukan data tersimpan di localStorage.');
    } catch(e){}
  } else {
    setStatus('Siap. Muat file JSON untuk memulai.');
  }

})();
