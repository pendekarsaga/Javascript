// api.js
(() => {
  window.__ODH = window.__ODH || {};
  const ns = window.__ODH;
  const ORIGIN = location.origin;
  const MODEL = 'product.template';
  const SEARCH_ENDPOINT = `${ORIGIN}/web/dataset/call_kw/${MODEL}/web_search_read`;
  const GETVIEWS_ENDPOINT = `${ORIGIN}/web/dataset/call_kw/${MODEL}/get_views`;

  ns.fetchAvailableFields = async function() {
    try {
      const payload = { id: 999, jsonrpc: '2.0', method: 'call', params: { model: MODEL, method: 'get_views', args: [], kwargs: { context: { lang: 'id_ID' }, views: [[false,'kanban'],[false,'list'],[false,'form'],[false,'search']], options: {} } } };
      const r = await fetch(GETVIEWS_ENDPOINT, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      const models = j?.result?.models;
      if (models && models[MODEL]) { ns.availableFields = models[MODEL]; return ns.availableFields; }
    } catch (e) { console.warn('get_views failed', e); }
    try {
      const payload2 = { id: 998, jsonrpc: '2.0', method: 'call', params: { model: MODEL, method: 'fields_get', args: [], kwargs: { attributes: ['string','type','help','required','readonly'] } } };
      const r2 = await fetch(`${ORIGIN}/web/dataset/call_kw`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload2) });
      const j2 = await r2.json();
      if (j2 && j2.result) { ns.availableFields = j2.result; return ns.availableFields; }
    } catch (e) { console.error('fields_get failed', e); }
    return {};
  };

  ns.fetchSearchCount = async function() {
    try {
      const payload = { id: 1, jsonrpc: '2.0', method: 'call', params: { model: MODEL, method: 'search_count', args: [], kwargs: { domain: [], context: { lang: 'id_ID' } } } };
      const r = await fetch('/web/dataset/call_kw', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      const v = j && j.result;
      return (typeof v === 'number') ? v : (j && j.result && j.result.length) || 0;
    } catch (e) { console.warn('search_count failed', e); return 0; }
  };

  ns.fetchChunk = async function(offset, limit, chosenFields) {
    try {
      const body = { id: 2, jsonrpc: '2.0', method: 'call', params: { model: MODEL, method: 'web_search_read', args: [], kwargs: { fields: (chosenFields && chosenFields.length) ? chosenFields : ['id','default_code','name','barcode','list_price'], limit, offset, domain: [], context: { lang: 'id_ID' } } } };
      const r = await fetch(SEARCH_ENDPOINT, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j) return [];
      if (j.result && j.result.records) return j.result.records;
      if (Array.isArray(j.result)) return j.result; return [];
    } catch (e) { console.error('fetchChunk error', e); return []; }
  };

  console.log('ODH api loaded');
})();