import {
  BIN_TYPES, STOCK_STATUS, STORAGE_CONDITIONS, UOMS,
  bestBefore, binCheckDigits, binPayload, boxPayload, daysBetween,
} from '/lib.mjs';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
const fmtSscc = (s) => `${s[0]} ${s.slice(1, 8)} ${s.slice(8, 17)} ${s[17]}`;
const bc = (type, text) => `/api/bc?type=${type}&text=${encodeURIComponent(text)}`;

let db = null;

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const refresh = async () => { db = await api('GET', '/api/db'); };

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = 'toast'), isError ? 5000 : 2600);
}

async function act(fn, okMsg) {
  try {
    const r = await fn();
    await refresh();
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    render();
    return r;
  } catch (e) {
    toast(e.message, true);
    return null;
  }
}

const mat = (id) => db.materials.find((m) => m.material === id);
const huBbd = (h) => bestBefore(h, mat(h.material));
const daysLeft = (h) => { const b = huBbd(h); return b ? daysBetween(today(), b) : null; };

function statusChip(s) {
  const cls = s === 'Unrestricted' ? 'ok' : s === 'Blocked' ? 'bad' : 'warn';
  return `<span class="chip ${cls}">${esc(s)}</span>`;
}
function bbdCell(h) {
  const b = huBbd(h);
  if (!b) return '<span class="dim">n/a</span>';
  const d = daysLeft(h);
  const cls = d < 0 ? 'bad' : d <= 30 ? 'warn' : '';
  return `${fmtDate(b)} ${cls ? `<span class="chip ${cls}">${d < 0 ? 'expired' : `${d} d`}</span>` : ''}`;
}

// ---------- Navigation ----------

const VIEWS = [
  { group: 'Overview', code: 'HOME', name: 'Warehouse cockpit', render: renderHome },
  { group: 'Master data', code: 'MM03', name: 'Material master', render: renderMaterials },
  { group: 'Master data', code: 'LS03', name: 'Storage bins', render: renderBins },
  { group: 'Inventory', code: 'LX02', name: 'Stock by box', render: renderStock },
  { group: 'Inventory', code: 'MIGO', name: 'Goods receipt', render: renderMigo },
  { group: 'Inventory', code: 'MB51', name: 'Movement log', render: renderMovements },
  { group: 'Output', code: 'LBL1', name: 'Shelf labels', render: () => renderLabels('shelf') },
  { group: 'Output', code: 'LBL2', name: 'Box labels', render: () => renderLabels('box') },
  { group: 'Output', code: 'LENS', name: 'Publish to Lens', render: renderPublish },
];
const ALIASES = { MM01: 'MM03', MM02: 'MM03', LS01: 'LS03', LS02: 'LS03', MMBE: 'LX02', LT01: 'LX02', MB1C: 'MIGO' };

let current = 'HOME';
let labelSel = { shelf: null, box: null };
let stockFilter = '';
let lastGr = null;

function go(code) {
  code = ALIASES[code] || code;
  if (!VIEWS.some((v) => v.code === code)) return toast(`Transaction ${code} does not exist`, true);
  current = code;
  history.replaceState(null, '', `#${code}`);
  render();
}

function renderNav() {
  let html = '';
  let group = '';
  for (const v of VIEWS) {
    if (v.group !== group) { group = v.group; html += `<h4>${group}</h4>`; }
    html += `<a href="#${v.code}" data-code="${v.code}" class="${v.code === current ? 'active' : ''}"><span>${v.name}</span><code>${v.code}</code></a>`;
  }
  $('#nav').innerHTML = html;
}

function render() {
  renderNav();
  const v = VIEWS.find((x) => x.code === current);
  $('#view').innerHTML = v.render();
  bindView();
}

function head(code, title, sub, actions = '') {
  return `<div class="view-head"><div><div class="tcode">${code}</div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="actions">${actions}</div></div>`;
}

// ---------- Views ----------

function renderHome() {
  const expiring = db.stock.filter((h) => { const d = daysLeft(h); return d !== null && d <= 30; });
  const flagged = db.stock.filter((h) => h.status !== 'Unrestricted');
  const actions = db.stock.filter((h) => h.action);
  const racks = {};
  for (const b of db.bins) (racks[b.type === 'SHELF' ? `RACK ${b.bin[0]}` : b.type === 'QUAR' ? 'QUARANTINE' : 'GOODS RECEIPT'] ||= []).push(b);

  const rackHtml = Object.entries(racks).map(([name, bins]) => `
    <div class="rack"><div class="rack-title">${name}</div>
      ${[...bins].reverse().map((b) => `
        <div class="level">
          <div class="bin-id" data-bin="${b.bin}">${b.bin}${b.blocked ? ' <span class="chip bad">blk</span>' : ''}</div>
          <div class="boxes">${db.stock.filter((h) => h.bin === b.bin).map((h) => `
            <button class="box-chip ${h.status === 'Blocked' ? 'blocked' : h.status !== 'Unrestricted' ? 'qi' : ''} ${h.action ? 'has-action' : ''}" data-sscc="${h.sscc}" title="${esc(mat(h.material)?.description)}">
              <span class="dot"></span>${esc(mat(h.material)?.short)}</button>`).join('') || '<span class="dim" style="font-size:12px;padding-top:6px">empty</span>'}
          </div>
        </div>`).join('')}
    </div>`).join('');

  return head('HOME', 'Warehouse cockpit', 'WH01 Garage. Live stock by bin. Click a box for details.')
    + `<div class="kpis">
        <div class="kpi"><div class="label">Materials</div><div class="value">${db.materials.length}</div></div>
        <div class="kpi"><div class="label">Bins</div><div class="value">${db.bins.length}</div></div>
        <div class="kpi"><div class="label">Boxes in stock</div><div class="value">${db.stock.length}</div></div>
        <div class="kpi ${expiring.length ? 'warn' : ''}"><div class="label">Expiring ≤ 30 d</div><div class="value">${expiring.length}</div></div>
        <div class="kpi ${flagged.length ? 'bad' : ''}"><div class="label">QI / blocked</div><div class="value">${flagged.length}</div></div>
        <div class="kpi ${actions.length ? 'warn' : ''}"><div class="label">Open actions</div><div class="value">${actions.length}</div></div>
      </div>
      <div class="panel"><div class="panel-head"><h2>Rack map</h2></div><div class="panel-body"><div class="racks">${rackHtml}</div></div></div>
      ${actions.length ? `<div class="panel"><div class="panel-head"><h2>Open actions (shown on the glasses)</h2></div>
        <div class="table-wrap"><table><thead><tr><th>Bin</th><th>Material</th><th>Action</th><th>SSCC</th></tr></thead><tbody>
        ${actions.map((h) => `<tr data-sscc="${h.sscc}"><td class="mono">${h.bin}</td><td>${esc(mat(h.material)?.description)}</td><td><span class="chip warn">${esc(h.action)}</span></td><td class="mono dim">${fmtSscc(h.sscc)}</td></tr>`).join('')}
        </tbody></table></div></div>` : ''}`;
}

function renderMaterials() {
  return head('MM03', 'Material master', `${db.materials.length} materials. Internal numbers; vendor codes kept for reference only.`,
    '<button class="btn primary" data-new-material>New material</button>')
    + `<div class="panel table-wrap"><table><thead><tr>
        <th>Material</th><th>Description</th><th>UoM</th><th class="num">Per case</th><th>GTIN / EAN-13</th>
        <th class="num">Shelf life</th><th class="num">Min. rem.</th><th>Storage</th><th>Batch</th><th>Vendor</th><th>Vendor material</th>
      </tr></thead><tbody>
      ${db.materials.map((m) => `<tr data-material="${m.material}">
        <td class="mono">${m.material}</td><td>${esc(m.description)}</td><td class="mono">${m.uom}</td><td class="num mono">${m.perCase}</td>
        <td class="mono">${m.gtin}</td><td class="num mono">${m.shelfLifeDays ? `${m.shelfLifeDays} d` : '<span class="dim">n/a</span>'}</td>
        <td class="num mono">${m.minRemainingDays ? `${m.minRemainingDays} d` : '<span class="dim">n/a</span>'}</td>
        <td><span class="chip ${m.storage === 'Hazmat' ? 'bad' : m.storage === 'Ambient' ? '' : 'accent'}">${m.storage}</span></td>
        <td>${m.batchManaged ? 'Yes' : '<span class="dim">No</span>'}</td><td>${esc(m.vendor)}</td><td class="mono dim">${esc(m.vendorMaterial)}</td>
      </tr>`).join('')}
      </tbody></table></div>`;
}

function renderBins() {
  return head('LS03', 'Storage bins', 'Bin id = rack - section - level. Check digits are printed on the shelf label.',
    '<button class="btn primary" data-new-bin>New bin</button>')
    + `<div class="panel table-wrap"><table><thead><tr>
        <th>Bin</th><th>Check</th><th>Type</th><th>Description</th><th class="num">Max kg</th><th class="num">Boxes</th><th class="num">Load kg</th><th>Status</th><th>Label payload</th>
      </tr></thead><tbody>
      ${db.bins.map((b) => {
        const here = db.stock.filter((h) => h.bin === b.bin);
        const kg = here.reduce((s, h) => s + (mat(h.material)?.caseKg || 0), 0);
        return `<tr data-bin="${b.bin}">
          <td class="mono">${b.bin}</td><td class="mono">${binCheckDigits(b.bin)}</td><td><span class="chip">${b.type}</span></td><td>${esc(b.description)}</td>
          <td class="num mono">${b.maxKg}</td><td class="num mono">${here.length}</td>
          <td class="num mono">${kg > b.maxKg ? `<span class="chip bad">${kg.toFixed(1)}</span>` : kg.toFixed(1)}</td>
          <td>${b.blocked ? '<span class="chip bad">Blocked</span>' : '<span class="chip ok">Open</span>'}</td>
          <td class="mono dim">${binPayload(b.bin)}</td></tr>`;
      }).join('')}
      </tbody></table></div>`;
}

function stockRows() {
  const q = stockFilter.toLowerCase();
  return db.stock
    .filter((h) => !q || [h.sscc, h.material, h.batch, h.bin, h.status, mat(h.material)?.description, mat(h.material)?.vendor].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.bin.localeCompare(b.bin) || a.material.localeCompare(b.material));
}

function renderStock() {
  const rows = stockRows();
  return head('LX02', 'Stock by box', 'One row per handling unit. Click a row to move, count, change status or print.',
    `<input class="search" id="stock-filter" placeholder="Filter: bin, material, batch…" value="${esc(stockFilter)}">`)
    + `<div class="panel table-wrap"><table><thead><tr>
        <th>Bin</th><th>SSCC</th><th>Material</th><th>Description</th><th>Batch</th><th class="num">Qty</th><th>UoM</th>
        <th>Manufactured</th><th>Received</th><th>Best before</th><th>Status</th><th>Action</th>
      </tr></thead><tbody id="stock-body">
      ${rows.map((h) => `<tr data-sscc="${h.sscc}">
        <td class="mono">${h.bin}</td><td class="mono dim">${fmtSscc(h.sscc)}</td><td class="mono">${h.material}</td>
        <td>${esc(mat(h.material)?.description)}</td><td class="mono">${esc(h.batch) || '<span class="dim">n/a</span>'}</td>
        <td class="num mono">${h.qty}</td><td class="mono">${h.uom}</td><td class="mono">${fmtDate(h.manufactured)}</td>
        <td class="mono">${fmtDate(h.received)}</td><td class="mono">${bbdCell(h)}</td><td>${statusChip(h.status)}</td>
        <td>${h.action ? `<span class="chip warn">${esc(h.action)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
}

function renderMigo() {
  const opts = db.materials.map((m) => `<option value="${m.material}">${m.material} · ${esc(m.description)}</option>`).join('');
  const done = lastGr && db.stock.find((h) => h.sscc === lastGr);
  return head('MIGO', 'Goods receipt', 'Receive a vendor box, relabel it with our own label, and leave it in GR-ZONE for put-away.')
    + `<div class="panel"><div class="panel-body"><form id="migo" class="form-grid">
        <div class="field"><label>Material</label><select name="material" required>${opts}</select><span class="hint" id="migo-hint"></span></div>
        <div class="field"><label>Quantity</label><input name="qty" type="number" min="0.001" step="any" required></div>
        <div class="field"><label>Batch</label><input name="batch" placeholder="Internal batch"></div>
        <div class="field"><label>Vendor batch</label><input name="vendorBatch" placeholder="As printed by the vendor"></div>
        <div class="field"><label>Manufactured</label><input name="manufactured" type="date" required value="${today()}"></div>
        <div class="field"><label>Movement type</label><input value="101 · GR for vendor delivery" readonly></div>
        <div class="row" style="grid-column:1/-1"><button class="btn primary" type="submit">Post goods receipt</button></div>
      </form></div></div>
      ${done ? `<div class="success"><strong>Posted.</strong> Box <span class="mono">${fmtSscc(done.sscc)}</span>, ${done.qty} ${done.uom} of ${esc(mat(done.material).description)}, in GR-ZONE.
        <div class="row" style="margin-top:10px"><button class="btn primary" data-print-one="${done.sscc}">Print box label</button>
        <button class="btn" data-sscc-open="${done.sscc}">Put away…</button></div></div>` : ''}`;
}

function renderMovements() {
  const rows = [...db.movements].reverse();
  return head('MB51', 'Movement log', `${rows.length} material documents, newest first.`)
    + `<div class="panel table-wrap"><table><thead><tr>
        <th>Doc</th><th>Date</th><th>MvT</th><th>Text</th><th>Material</th><th>Batch</th><th class="num">Qty</th><th>From</th><th>To</th><th>SSCC</th><th>User</th>
      </tr></thead><tbody>
      ${rows.map((m) => `<tr data-sscc="${m.sscc}">
        <td class="mono">${m.doc}</td><td class="mono">${fmtDate(m.date)}</td><td class="mono"><span class="chip accent">${m.type}</span></td>
        <td>${esc(m.text)}</td><td class="mono">${m.material}</td><td class="mono">${esc(m.batch)}</td>
        <td class="num mono">${m.qty} ${m.uom}</td><td class="mono">${m.from}</td><td class="mono">${m.to}</td>
        <td class="mono dim">${fmtSscc(m.sscc)}</td><td class="mono dim">${m.user}</td></tr>`).join('')}
      </tbody></table></div>`;
}

// ---------- Labels ----------

function shelfLabel(b) {
  return `<div class="lbl lbl-shelf">
    <div class="qr"><img src="${bc('qrcode', binPayload(b.bin))}" alt=""></div>
    <div class="top"><div class="wh mono">WH01 · ${b.type}</div><div class="bin">${b.bin}</div><div class="desc">${esc(b.description)}</div></div>
    <div class="cd">${binCheckDigits(b.bin)}</div>
    <div class="bc"><img src="${bc('code128', binPayload(b.bin))}" alt=""></div>
  </div>`;
}

function boxLabel(h) {
  const m = mat(h.material);
  const bbd = huBbd(h);
  return `<div class="lbl lbl-box">
    <div class="hdr mono"><span>BLINDERS WH01 · INTERNAL LABEL</span><span>GR ${h.grDoc} · ${fmtDate(h.received)}</span></div>
    <div class="main">
      <div class="matno">${m.material}</div>
      <div class="mdesc">${esc(m.description)}</div>
      <table>
        <tr><td>Batch</td><td class="mono"><b>${esc(h.batch) || 'n/a'}</b></td></tr>
        <tr><td>Quantity</td><td class="mono"><b>${h.qty} ${h.uom}</b></td></tr>
        <tr><td>Best before</td><td class="mono"><b>${bbd ? fmtDate(bbd) : 'n/a'}</b></td></tr>
        <tr><td>Manufactured</td><td class="mono">${fmtDate(h.manufactured)}</td></tr>
      </table>
      <div class="vendor">Vendor: ${esc(m.vendor)} · ${esc(m.vendorMaterial)}${h.vendorBatch ? ` · lot ${esc(h.vendorBatch)}` : ''}</div>
    </div>
    <div class="qr"><img src="${bc('qrcode', boxPayload(h.sscc))}" alt=""></div>
    <div class="foot"><img src="${bc('gs1-128', `(00)${h.sscc}`)}" alt=""><div class="hri">(00) ${fmtSscc(h.sscc)}</div></div>
  </div>`;
}

function labelItems(kind) {
  return kind === 'shelf'
    ? db.bins.map((b) => ({ id: b.bin, text: `${b.bin} · ${b.description}`, html: () => shelfLabel(b) }))
    : [...db.stock].sort((a, b) => a.bin.localeCompare(b.bin)).map((h) => ({ id: h.sscc, text: `${h.bin} · ${mat(h.material)?.short} · ${h.sscc.slice(-4)}`, html: () => boxLabel(h) }));
}

function renderLabels(kind) {
  const items = labelItems(kind);
  const ids = new Set(items.map((i) => i.id));
  if (!labelSel[kind]) labelSel[kind] = new Set(ids);
  labelSel[kind] = new Set([...labelSel[kind]].filter((id) => ids.has(id)));
  const picked = items.filter((i) => labelSel[kind].has(i.id));
  const isShelf = kind === 'shelf';
  return head(isShelf ? 'LBL1' : 'LBL2', isShelf ? 'Shelf labels' : 'Box labels',
    isShelf ? '100 × 50 mm, 10 per A4. The QR is what the glasses read.' : '100 × 70 mm, 8 per A4. Relabel at receipt: our material number and SSCC replace the vendor codes.',
    `<button class="btn" data-sel="all">All</button><button class="btn" data-sel="none">None</button>
     <button class="btn primary" data-print="${kind}" ${picked.length ? '' : 'disabled'}>Print ${picked.length}</button>`)
    + `<div class="panel"><div class="panel-body"><div class="label-pick">
        ${items.map((i) => `<label><input type="checkbox" data-pick="${i.id}" ${labelSel[kind].has(i.id) ? 'checked' : ''}>${esc(i.text)}</label>`).join('')}
      </div></div></div>
      <div class="panel"><div class="panel-head"><h2>Preview at print size</h2></div><div class="panel-body"><div class="label-sheet">${picked.map((i) => i.html()).join('')}</div></div></div>`;
}

function printLabels(htmlList) {
  const sheet = $('#print-sheet');
  sheet.innerHTML = htmlList.join('');
  const imgs = [...sheet.querySelectorAll('img')];
  Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))).then(() => window.print());
}

// ---------- Publish ----------

function renderPublish() {
  return head('LENS', 'Publish to Lens', 'Writes data/erp.json: the only ERP data the glasses get. No vendors, no batches, no prices.',
    '<button class="btn primary" data-publish>Publish</button>')
    + `<div class="panel"><div class="panel-head"><h2>Export preview</h2><span class="dim" id="pub-note"></span></div>
       <div class="panel-body"><pre class="json" id="export-json">Loading…</pre></div></div>`;
}

// ---------- Drawers ----------

function openDrawer(html) {
  $('#drawer-body').innerHTML = html;
  const d = $('#drawer');
  if (!d.open) d.showModal();
  $('#drawer-body').querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => d.close()));
}

function drawerHead(code, title) {
  return `<div class="drawer-head"><div><div class="tcode">${code}</div><h3>${title}</h3></div><button class="btn close" data-close>Close</button></div>`;
}

function openHu(sscc) {
  const h = db.stock.find((x) => x.sscc === sscc);
  if (!h) return toast('That box is no longer in stock', true);
  const m = mat(h.material);
  const binOpts = db.bins.filter((b) => b.bin !== h.bin && !b.blocked).map((b) => `<option>${b.bin}</option>`).join('');
  openDrawer(drawerHead('LX02 · HANDLING UNIT', esc(m.description)) + `
    <div class="drawer-section"><dl class="kv">
      <dt>SSCC</dt><dd class="mono">${fmtSscc(h.sscc)}</dd>
      <dt>Bin</dt><dd class="mono">${h.bin}</dd>
      <dt>Material</dt><dd class="mono">${m.material} · ${m.uom}</dd>
      <dt>Batch / vendor lot</dt><dd class="mono">${esc(h.batch) || 'n/a'} / ${esc(h.vendorBatch) || 'n/a'}</dd>
      <dt>Quantity</dt><dd class="mono">${h.qty} ${h.uom}</dd>
      <dt>Manufactured</dt><dd class="mono">${fmtDate(h.manufactured)}</dd>
      <dt>Received</dt><dd class="mono">${fmtDate(h.received)} · GR ${h.grDoc}</dd>
      <dt>Best before</dt><dd class="mono">${bbdCell(h)}</dd>
      <dt>Status</dt><dd>${statusChip(h.status)}</dd>
      <dt>Vendor</dt><dd>${esc(m.vendor)} · <span class="mono dim">${esc(m.vendorMaterial)}</span></dd>
    </dl></div>
    <div class="drawer-section"><h4>Transfer (311)</h4>
      <form id="f-transfer" class="row"><select name="to" style="flex:1">${binOpts}</select><button class="btn primary">Move</button></form></div>
    <div class="drawer-section"><h4>Status and glasses action</h4>
      <form id="f-status" class="form-grid">
        <div class="field"><label>Status</label><select name="status">${STOCK_STATUS.map((s) => `<option ${s === h.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Action (max 4 words)</label><input name="action" value="${esc(h.action)}" placeholder="e.g. move to quarantine"></div>
        <div class="row" style="grid-column:1/-1"><button class="btn primary">Save</button></div>
      </form></div>
    <div class="drawer-section"><h4>Inventory count (701)</h4>
      <form id="f-count" class="row"><input name="qty" type="number" min="0" step="any" value="${h.qty}" style="flex:1"><button class="btn">Post count</button></form></div>
    <div class="drawer-section row">
      <button class="btn" data-print-one="${h.sscc}">Print box label</button>
      <button class="btn danger" data-issue="${h.sscc}">Goods issue (201)</button>
    </div>`);
  const body = $('#drawer-body');
  const fd = (f) => Object.fromEntries(new FormData(f));
  $('#f-transfer', body).onsubmit = (e) => { e.preventDefault(); act(() => api('POST', '/api/transfer', { sscc, ...fd(e.target) }), (r) => `Moved to ${r.bin}`).then((r) => r && openHu(sscc)); };
  $('#f-status', body).onsubmit = (e) => { e.preventDefault(); act(() => api('POST', '/api/status', { sscc, ...fd(e.target) }), 'Status saved').then((r) => r && openHu(sscc)); };
  $('#f-count', body).onsubmit = (e) => { e.preventDefault(); act(() => api('POST', '/api/count', { sscc, ...fd(e.target) }), 'Count posted').then((r) => r && openHu(sscc)); };
  $('[data-print-one]', body).onclick = () => printLabels([boxLabel(h)]);
  $('[data-issue]', body).onclick = () => {
    if (!confirm('Goods issue: the box leaves stock. Its label will be unknown to the ERP. Continue?')) return;
    act(() => api('POST', '/api/issue', { sscc }), 'Box issued').then((r) => r && $('#drawer').close());
  };
}

function openMaterial(id) {
  const m = mat(id) || { material: '', description: '', short: '', vendor: '', vendorMaterial: '', gtin: '', uom: 'EA', perCase: 1, shelfLifeDays: 0, minRemainingDays: 0, storage: 'Ambient', batchManaged: true, caseKg: 1 };
  const isNew = !id;
  const sel = (name, list, v) => `<select name="${name}">${list.map((x) => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  openDrawer(drawerHead(isNew ? 'MM01 · CREATE' : 'MM02 · CHANGE', isNew ? 'New material' : `${m.material} · ${esc(m.description)}`) + `
    <div class="drawer-section"><form id="f-mat" class="form-grid">
      <div class="field"><label>Material</label><input name="material" value="${m.material}" ${isNew ? '' : 'readonly'} pattern="\\d{6}" required placeholder="6 digits"></div>
      <div class="field"><label>Base UoM</label>${sel('uom', UOMS, m.uom)}</div>
      <div class="field" style="grid-column:1/-1"><label>Description</label><input name="description" value="${esc(m.description)}" required></div>
      <div class="field"><label>Short text (glasses, 20 chars)</label><input name="short" maxlength="20" value="${esc(m.short)}"></div>
      <div class="field"><label>GTIN / EAN-13</label><input name="gtin" value="${m.gtin}" placeholder="Blank = generate"></div>
      <div class="field"><label>Vendor</label><input name="vendor" value="${esc(m.vendor)}"></div>
      <div class="field"><label>Vendor material</label><input name="vendorMaterial" value="${esc(m.vendorMaterial)}"></div>
      <div class="field"><label>Units per case</label><input name="perCase" type="number" min="1" value="${m.perCase}"></div>
      <div class="field"><label>Case gross kg</label><input name="caseKg" type="number" min="0" step="0.1" value="${m.caseKg}"></div>
      <div class="field"><label>Shelf life days (0 = none)</label><input name="shelfLifeDays" type="number" min="0" value="${m.shelfLifeDays}"></div>
      <div class="field"><label>Min. remaining at GR, days</label><input name="minRemainingDays" type="number" min="0" value="${m.minRemainingDays}"></div>
      <div class="field"><label>Storage condition</label>${sel('storage', STORAGE_CONDITIONS, m.storage)}</div>
      <div class="field check"><input id="bm" name="batchManaged" type="checkbox" ${m.batchManaged ? 'checked' : ''}><label for="bm">Batch managed</label></div>
      <div class="row" style="grid-column:1/-1"><button class="btn primary">Save</button>${isNew ? '' : '<button type="button" class="btn danger" data-del>Delete</button>'}</div>
    </form></div>`);
  const f = $('#f-mat');
  f.onsubmit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    body.batchManaged = f.batchManaged.checked;
    act(() => api('PUT', '/api/materials', body), 'Material saved').then((r) => r && $('#drawer').close());
  };
  const del = $('[data-del]', f);
  if (del) del.onclick = () => confirm(`Delete material ${m.material}?`) && act(() => api('DELETE', '/api/materials', { material: m.material }), 'Material deleted').then((r) => r && $('#drawer').close());
}

function openBin(id) {
  const b = db.bins.find((x) => x.bin === id) || { bin: '', type: 'SHELF', description: '', maxKg: 40, blocked: false };
  const isNew = !id;
  openDrawer(drawerHead(isNew ? 'LS01 · CREATE' : 'LS02 · CHANGE', isNew ? 'New storage bin' : b.bin) + `
    <div class="drawer-section"><form id="f-bin" class="form-grid">
      <div class="field"><label>Bin</label><input name="bin" value="${b.bin}" ${isNew ? '' : 'readonly'} required placeholder="A-01-04"></div>
      <div class="field"><label>Storage type</label><select name="type">${BIN_TYPES.map((t) => `<option ${t === b.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field" style="grid-column:1/-1"><label>Description</label><input name="description" value="${esc(b.description)}"></div>
      <div class="field"><label>Max weight kg</label><input name="maxKg" type="number" min="0" value="${b.maxKg}"></div>
      <div class="field check"><input id="blk" name="blocked" type="checkbox" ${b.blocked ? 'checked' : ''}><label for="blk">Blocked for put-away</label></div>
      <div class="row" style="grid-column:1/-1"><button class="btn primary">Save</button>
        ${isNew ? '' : `<button type="button" class="btn" data-print-bin>Print label</button><button type="button" class="btn danger" data-del>Delete</button>`}</div>
    </form></div>`);
  const f = $('#f-bin');
  f.onsubmit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    body.blocked = f.blocked.checked;
    act(() => api('PUT', '/api/bins', body), 'Bin saved').then((r) => r && $('#drawer').close());
  };
  const del = $('[data-del]', f);
  if (del) del.onclick = () => confirm(`Delete bin ${b.bin}?`) && act(() => api('DELETE', '/api/bins', { bin: b.bin }), 'Bin deleted').then((r) => r && $('#drawer').close());
  const pr = $('[data-print-bin]', f);
  if (pr) pr.onclick = () => printLabels([shelfLabel(b)]);
}

// ---------- Event binding ----------

function bindView() {
  const v = $('#view');
  v.querySelectorAll('[data-sscc]').forEach((el) => (el.onclick = () => openHu(el.dataset.sscc)));
  v.querySelectorAll('[data-sscc-open]').forEach((el) => (el.onclick = () => openHu(el.dataset.ssccOpen)));
  v.querySelectorAll('tr[data-material]').forEach((el) => (el.onclick = () => openMaterial(el.dataset.material)));
  v.querySelectorAll('[data-bin]').forEach((el) => (el.onclick = () => openBin(el.dataset.bin)));
  $('[data-new-material]', v)?.addEventListener('click', () => openMaterial(null));
  $('[data-new-bin]', v)?.addEventListener('click', () => openBin(null));

  const filter = $('#stock-filter', v);
  if (filter) filter.oninput = () => { stockFilter = filter.value; const pos = filter.selectionStart; render(); const f = $('#stock-filter'); f.focus(); f.setSelectionRange(pos, pos); };

  const migo = $('#migo', v);
  if (migo) {
    const hint = () => {
      const m = mat(migo.material.value);
      migo.qty.value = m.perCase;
      migo.batch.disabled = !m.batchManaged;
      migo.batch.placeholder = m.batchManaged ? 'Internal batch' : 'Not batch managed';
      $('#migo-hint').textContent = `${m.vendor} · ${m.vendorMaterial} · ${m.perCase} ${m.uom}/case${m.shelfLifeDays ? ` · shelf life ${m.shelfLifeDays} d, min ${m.minRemainingDays} d at GR` : ''}`;
    };
    migo.material.onchange = hint;
    hint();
    migo.onsubmit = (e) => {
      e.preventDefault();
      act(() => api('POST', '/api/gr', Object.fromEntries(new FormData(migo))), (r) => `Goods receipt posted: ${r.sscc}`).then((r) => { if (r) { lastGr = r.sscc; render(); } });
    };
  }
  v.querySelectorAll('[data-print-one]').forEach((el) => (el.onclick = () => {
    const h = db.stock.find((x) => x.sscc === el.dataset.printOne);
    printLabels([boxLabel(h)]);
  }));

  v.querySelectorAll('[data-pick]').forEach((el) => (el.onchange = () => {
    const kind = current === 'LBL1' ? 'shelf' : 'box';
    el.checked ? labelSel[kind].add(el.dataset.pick) : labelSel[kind].delete(el.dataset.pick);
    render();
  }));
  v.querySelectorAll('[data-sel]').forEach((el) => (el.onclick = () => {
    const kind = current === 'LBL1' ? 'shelf' : 'box';
    labelSel[kind] = new Set(el.dataset.sel === 'all' ? labelItems(kind).map((i) => i.id) : []);
    render();
  }));
  const pb = $('[data-print]', v);
  if (pb) pb.onclick = () => {
    const kind = pb.dataset.print;
    printLabels(labelItems(kind).filter((i) => labelSel[kind].has(i.id)).map((i) => i.html()));
  };

  if (current === 'LENS') {
    api('GET', '/api/export').then((x) => ($('#export-json').textContent = JSON.stringify(x, null, 2)));
    $('[data-publish]', v).onclick = () => api('POST', '/api/publish').then((x) => {
      $('#export-json').textContent = JSON.stringify(x, null, 2);
      $('#pub-note').textContent = `Written to data/erp.json · ${x.changed} entries changed`;
      toast('Published to data/erp.json');
    }).catch((e) => toast(e.message, true));
  }
}

$('#nav').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-code]');
  if (a) { e.preventDefault(); go(a.dataset.code); }
});
$('#cmd').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#cmd-input').value.trim().toUpperCase().replace(/^\/[NO]/, '');
  $('#cmd-input').value = '';
  if (code) go(code);
});

window.addEventListener('hashchange', () => {
  const code = location.hash.slice(1).toUpperCase();
  if (code && code !== current) go(code);
});

function tick() {
  const d = new Date();
  $('#clock').textContent = `${fmtDate(d.toISOString().slice(0, 10))} ${d.toTimeString().slice(0, 5)}`;
}
tick();
setInterval(tick, 30000);

await refresh();
// ?sheet=shelf or ?sheet=box fills the print sheet with every label, for printing straight from a URL.
const sheet = new URLSearchParams(location.search).get('sheet');
if (sheet === 'shelf' || sheet === 'box') $('#print-sheet').innerHTML = labelItems(sheet).map((i) => i.html()).join('');
const start = location.hash.slice(1).toUpperCase();
current = VIEWS.some((v) => v.code === start) ? start : 'HOME';
render();
