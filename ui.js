// ui.js
(() => {
  window.__ODH = window.__ODH || {};
  const ns = window.__ODH;
  const el = ns.el;

  const styleId = 'odoo-product-helper-style-v4-3';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style'); s.id = styleId;
    s.textContent = `
#odoo-helper-root{position:fixed;right:12px;top:80px;width:520px;height:580px;z-index:2147483647;font-family:Inter,Roboto,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);overflow:auto;border-radius:8px;background:#fff;border:1px solid #ddd;touch-action:none;-webkit-user-select:none;user-select:none;max-width:95vw;max-height:95vh}
#odoo-helper-root .hdr{background:#1976d2;color:#fff;padding:6px;display:flex;justify-content:space-between;align-items:center;font-size:14px;cursor:move}
#odoo-helper-root .hdr .hdr-btn{background:transparent;border:none;color:#fff;cursor:pointer;margin-left:4px;font-size:14px}
#odoo-helper-root .body{display:flex;height:calc(100% - 30px)}
#odoo-helper-left{width:50%;overflow:auto;padding:6px;border-right:1px solid #ccc}
#odoo-helper-right{width:50%;overflow:auto;padding:6px}
.odoo-table{width:100%;border-collapse:collapse;font-size:12px}
.odoo-table th,.odoo-table td{border:1px solid #ccc;padding:4px;text-align:left}
.odoo-suggest-list{border:1px solid #ccc;border-radius:4px;max-height:200px;overflow:auto;margin-top:6px;font-size:13px}
.odoo-suggest-item{padding:4px 6px;cursor:pointer;border-bottom:1px solid #eee;display:flex;flex-direction:column}
.odoo-suggest-item:hover,.odoo-suggest-item.active{background:#e3f2fd}
.odoo-small{font-size:12px;color:#555}
.odoo-btn{font-size:12px;padding:4px 6px;border-radius:4px;border:1px solid #1976d2;background:#fff;color:#1976d2;cursor:pointer}
.odoo-btn.primary{background:#1976d2;color:#fff}
.odoo-actions{margin-top:6px;display:flex;gap:6px;flex-wrap:wrap}
.progress-wrap{margin-top:8px;border:1px solid #ccc;border-radius:4px;overflow:hidden}
.progress-bar{width:100%;background:#eee;height:12px;position:relative}
.progress-bar .bar{height:100%;background:#1976d2;width:0%}
.resize-handle{position:absolute;width:10px;height:10px;bottom:0;right:0;cursor:se-resize;background:#1976d2}
    `;
    document.head.appendChild(s);
  }

  if (document.getElementById('odoo-helper-root')) {
    ns.uiLog('UI already exists — skipping create.');
    ns.dom = ns.dom || {};
    return;
  }

  const root = el('div', { id: 'odoo-helper-root', role: 'dialog', 'aria-label': 'Odoo Product Helper' });
  const btnMin = el('button', { class: 'hdr-btn', title: 'Minimize' }, '▁');
  const btnMax = el('button', { class: 'hdr-btn', title: 'Maximize' }, '⬜');
  const btnClose = el('button', { class: 'hdr-btn', title: 'Close' }, '✕');
  const btnGear = el('button', { class: 'hdr-btn', title: 'Settings' }, '⚙');
  const hdr = el('div', { class: 'hdr', tabindex: 0 }, el('div', { class: 'title' }, 'Odoo Product Helper (V4 Offline)'), el('div', {}, btnGear, btnMin, btnMax, btnClose));
  root.appendChild(hdr);

  const body = el('div', { class: 'body' });
  const left = el('div', { id: 'odoo-helper-left' }, el('div', { class: 'odoo-small' }, 'Daftar Produk Terpilih'), el('div', { id: 'selected-container' }));
  const right = el('div', { id: 'odoo-helper-right' });
  body.appendChild(left); body.appendChild(right); root.appendChild(body);

  const resizeHandle = el('div', { class: 'resize-handle', title: 'Geser untuk ubah ukuran' });
  root.appendChild(resizeHandle);
  document.body.appendChild(root);

  // build table
  const selectedContainer = left.querySelector('#selected-container');
  const table = el('table', { class: 'odoo-table', id: 'selected-table' });
  const thead = el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Produk'), el('th', {}, 'Fields...'), el('th', {}, 'Qty'), el('th', {}, 'Keterangan'), el('th', {}, 'Aksi')));
  table.appendChild(thead);
  const tbody = el('tbody'); table.appendChild(tbody); selectedContainer.appendChild(table);

  const actionsRow = el('div', { class: 'odoo-actions' },
    el('button', { class: 'odoo-btn primary', id: 'btn-download-csv' }, 'Download CSV'),
    el('button', { class: 'odoo-btn', id: 'btn-copy' }, 'Copy To Clipboard'),
    el('button', { class: 'odoo-btn', id: 'btn-clear' }, 'Hapus Semua')
  );
  selectedContainer.appendChild(actionsRow);

  const searchInput = el('input', { placeholder: 'Ketik untuk mencari (kode / nama / barcode)...', id: 'odoo-search-input', style: { width: '100%', padding: '8px', boxSizing: 'border-box' } });
  const suggestList = el('div', { class: 'odoo-suggest-list', id: 'suggest-list' }, 'Ketik untuk mencari...');
  const settingsBox = el('div', { id: 'odoo-helper-settings' }, el('div', { class: 'odoo-small' }, 'Pengaturan Fields:'), el('div', { id: 'fields-checkboxes', style: { maxHeight: '110px', overflow: 'auto', marginTop: '6px' } }));
  right.appendChild(searchInput); right.appendChild(suggestList); right.appendChild(settingsBox);

  const progressWrap = el('div', { class: 'progress-wrap', style: { display: 'none' } }, el('div', { class: 'odoo-small' }, 'Progres Import JSON:'), el('div', { class: 'progress-bar' }, el('div', { class: 'bar' })));
  const offlineBox = el('div', { id: 'odoo-offline-controls' },
    el('div', { class: 'odoo-small' }, 'Offline Controls:'),
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
      el('input', { type: 'number', id: 'batch-size', value: 200, style: { width: '84px' } }),
      el('button', { class: 'odoo-btn primary', id: 'btn-start-fetch' }, 'Ambil Data Produk'),
      el('button', { class: 'odoo-btn', id: 'btn-stop-fetch' }, 'Hentikan'),
      el('button', { class: 'odoo-btn', id: 'btn-resume-fetch' }, 'Lanjutkan')
    ),
    el('div', { style: { marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      el('button', { class: 'odoo-btn', id: 'btn-clear-products' }, 'Hapus Data Produk'),
      el('button', { class: 'odoo-btn', id: 'btn-export-csv' }, 'Unduh CSV'),
      el('button', { class: 'odoo-btn', id: 'btn-download-json' }, 'Download JSON'),
      el('button', { class: 'odoo-btn', id: 'btn-load-json' }, 'Load JSON (Restore)')
    ),
    el('div', { style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' } }, el('div', { id: 'search-count', style: { marginLeft: 'auto', fontSize: '12px', color: '#333' } }, 'SEARCH_COUNT: ?')),
    el('div', { style: { marginTop: '8px' } }, el('div', { class: 'odoo-small' }, 'Log Proses:'), el('div', { id: 'odoo-log' }))
  );
  right.appendChild(progressWrap); right.appendChild(offlineBox);

  const fileInput = el('input', { type: 'file', accept: '.json,application/json', id: 'odoo-file-input', style: { display: 'none' } });
  document.body.appendChild(fileInput);

  ns.dom = ns.dom || {};
  Object.assign(ns.dom, {
    root, hdr, btnMin, btnMax, btnClose, btnGear,
    searchInput, suggestList, fieldsBox: settingsBox.querySelector('#fields-checkboxes'),
    tbody, selectedContainer, progressWrap, fileInput
  });

  ns.uiLog('UI created');
  console.log('ODH UI loaded');
})();