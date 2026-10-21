// Blinders ERP mockup. Local only: binds to 127.0.0.1.
// node erp/server.mjs  ->  http://localhost:4100
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import bwipjs from 'bwip-js';
import {
  BIN_TYPES, STOCK_STATUS, STORAGE_CONDITIONS, UOMS,
  addDays, buildLensExport, classifyPayload, binPayload, daysBetween, makeGtin13, makeSscc, validateDb,
} from './lib.mjs';
import { buildSeed } from './seed.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dbPath = join(root, 'data', 'erp-db.json');
const exportPath = join(root, 'data', 'erp.json');
const PORT = Number(process.env.PORT || 4100);
const USER = process.env.ERP_USER || 'JLILJA';

if (!existsSync(dbPath)) writeFileSync(dbPath, JSON.stringify(buildSeed(), null, 2) + '\n');

const load = () => JSON.parse(readFileSync(dbPath, 'utf8'));
function save(db) {
  const errors = validateDb(db);
  if (errors.length) throw new HttpError(422, errors.join('; '));
  writeFileSync(dbPath + '.tmp', JSON.stringify(db, null, 2) + '\n');
  renameSync(dbPath + '.tmp', dbPath);
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const today = () => new Date().toISOString().slice(0, 10);

function logMovement(db, m) {
  const doc = String(db.nextDoc++);
  db.movements.push({ doc, date: today(), user: USER, ...m });
  return doc;
}

function findHu(db, sscc) {
  return db.stock.find((h) => h.sscc === sscc) || fail(404, `No box with SSCC ${sscc}`);
}

function requireBin(db, bin) {
  const b = db.bins.find((x) => x.bin === bin) || fail(404, `No bin ${bin}`);
  if (b.blocked) fail(409, `Bin ${bin} is blocked`);
  return b;
}

const routes = {
  'GET /api/db': (db) => db,

  'GET /api/export': (db) => buildLensExport(db),

  'POST /api/publish': (db) => {
    const out = buildLensExport(db);
    const prev = existsSync(exportPath) ? JSON.parse(readFileSync(exportPath, 'utf8')) : { bins: [], boxes: [] };
    const key = (x) => JSON.stringify(x);
    const before = new Set([...prev.bins, ...prev.boxes].map(key));
    const after = new Set([...out.bins, ...out.boxes].map(key));
    const changed = [...after].filter((k) => !before.has(k)).length + [...before].filter((k) => !after.has(k)).length;
    writeFileSync(exportPath, JSON.stringify(out, null, 2) + '\n');
    return { ...out, changed };
  },

  'PUT /api/materials': (db, body) => {
    const m = {
      material: String(body.material || '').trim(),
      description: String(body.description || '').trim(),
      short: String(body.short || '').trim().slice(0, 20),
      vendor: String(body.vendor || '').trim(),
      vendorMaterial: String(body.vendorMaterial || '').trim(),
      gtin: String(body.gtin || '').trim(),
      uom: body.uom,
      perCase: Number(body.perCase) || 1,
      shelfLifeDays: Number(body.shelfLifeDays) || 0,
      minRemainingDays: Number(body.minRemainingDays) || 0,
      storage: body.storage,
      batchManaged: Boolean(body.batchManaged),
      caseKg: Number(body.caseKg) || 0,
    };
    if (!/^\d{6}$/.test(m.material)) fail(400, 'Material number is 6 digits');
    if (!m.description) fail(400, 'Description is required');
    if (!m.gtin) m.gtin = makeGtin13(Number(m.material) % 100000);
    if (!STORAGE_CONDITIONS.includes(m.storage)) fail(400, 'Unknown storage condition');
    if (!UOMS.includes(m.uom)) fail(400, 'Unknown unit of measure');
    const i = db.materials.findIndex((x) => x.material === m.material);
    if (i >= 0) db.materials[i] = m; else db.materials.push(m);
    db.materials.sort((a, b) => a.material.localeCompare(b.material));
    return m;
  },

  'DELETE /api/materials': (db, body) => {
    if (db.stock.some((h) => h.material === body.material)) fail(409, `Material ${body.material} still has stock`);
    db.materials = db.materials.filter((m) => m.material !== body.material);
    return { ok: true };
  },

  'PUT /api/bins': (db, body) => {
    const b = {
      bin: String(body.bin || '').trim().toUpperCase(),
      type: body.type,
      description: String(body.description || '').trim(),
      maxKg: Number(body.maxKg) || 0,
      blocked: Boolean(body.blocked),
    };
    if (!classifyPayload(binPayload(b.bin))) fail(400, 'Bin id format is RACK-SS-LL, e.g. A-01-02');
    if (!BIN_TYPES.includes(b.type)) fail(400, 'Unknown storage type');
    const i = db.bins.findIndex((x) => x.bin === b.bin);
    if (i >= 0) db.bins[i] = b; else db.bins.push(b);
    db.bins.sort((a, c) => a.bin.localeCompare(c.bin));
    return b;
  },

  'DELETE /api/bins': (db, body) => {
    if (db.stock.some((h) => h.bin === body.bin)) fail(409, `Bin ${body.bin} is not empty`);
    db.bins = db.bins.filter((b) => b.bin !== body.bin);
    return { ok: true };
  },

  // MIGO: goods receipt. New box, new SSCC, lands in the GR zone.
  'POST /api/gr': (db, body) => {
    const m = db.materials.find((x) => x.material === body.material) || fail(404, 'Unknown material');
    const qty = Number(body.qty);
    if (!(qty > 0)) fail(400, 'Quantity must be positive');
    const manufactured = body.manufactured || fail(400, 'Manufacture date is required');
    const batch = m.batchManaged ? String(body.batch || '').trim() || fail(400, 'Material is batch managed: batch is required') : '';
    if (m.shelfLifeDays) {
      const remaining = daysBetween(today(), addDays(manufactured, m.shelfLifeDays));
      if (remaining < m.minRemainingDays) {
        fail(422, `Remaining shelf life ${remaining} d is below the minimum ${m.minRemainingDays} d. Receipt refused.`);
      }
    }
    requireBin(db, 'GR-ZONE');
    const sscc = makeSscc(db.nextSerial++);
    const hu = {
      sscc, material: m.material, batch, vendorBatch: String(body.vendorBatch || '').trim(),
      qty, uom: m.uom, bin: 'GR-ZONE', manufactured, received: today(),
      status: 'Unrestricted', action: null, grDoc: '',
    };
    hu.grDoc = logMovement(db, { type: '101', text: 'Goods receipt', sscc, material: m.material, batch, qty, uom: m.uom, from: '', to: 'GR-ZONE' });
    db.stock.push(hu);
    return hu;
  },

  // LT01: move a box.
  'POST /api/transfer': (db, body) => {
    const hu = findHu(db, body.sscc);
    requireBin(db, body.to);
    if (hu.bin === body.to) fail(400, 'Box is already in that bin');
    logMovement(db, { type: '311', text: 'Transfer', sscc: hu.sscc, material: hu.material, batch: hu.batch, qty: hu.qty, uom: hu.uom, from: hu.bin, to: body.to });
    hu.bin = body.to;
    // A completed put-away clears its own instruction.
    if (hu.action && hu.action.toLowerCase().includes(body.to.toLowerCase())) hu.action = null;
    return hu;
  },

  'POST /api/status': (db, body) => {
    const hu = findHu(db, body.sscc);
    if (!STOCK_STATUS.includes(body.status)) fail(400, 'Unknown status');
    const action = String(body.action || '').trim() || null;
    if (action && action.split(/\s+/).length > 4) fail(400, 'Action is max 4 words. It has to fit on the glasses.');
    if (hu.status !== body.status) {
      logMovement(db, { type: body.status === 'Unrestricted' ? '343' : '344', text: `Status to ${body.status}`, sscc: hu.sscc, material: hu.material, batch: hu.batch, qty: hu.qty, uom: hu.uom, from: hu.bin, to: hu.bin });
    }
    hu.status = body.status;
    hu.action = action;
    return hu;
  },

  // Inventory count correction.
  'POST /api/count': (db, body) => {
    const hu = findHu(db, body.sscc);
    const qty = Number(body.qty);
    if (!(qty >= 0)) fail(400, 'Counted quantity must be 0 or more');
    if (qty !== hu.qty) {
      logMovement(db, { type: '701', text: `Inventory difference ${qty - hu.qty > 0 ? '+' : ''}${qty - hu.qty}`, sscc: hu.sscc, material: hu.material, batch: hu.batch, qty: qty - hu.qty, uom: hu.uom, from: hu.bin, to: hu.bin });
    }
    hu.qty = qty;
    return hu;
  },

  // Goods issue: the box leaves the warehouse. Its label becomes unknown to the ERP (demo rule R3).
  'POST /api/issue': (db, body) => {
    const hu = findHu(db, body.sscc);
    logMovement(db, { type: '201', text: 'Goods issue', sscc: hu.sscc, material: hu.material, batch: hu.batch, qty: -hu.qty, uom: hu.uom, from: hu.bin, to: '' });
    db.stock = db.stock.filter((h) => h !== hu);
    return { ok: true };
  },

  'POST /api/reset': () => buildSeed(),
};

const BARCODES = { qrcode: { eclevel: 'M' }, code128: { includetext: false }, 'gs1-128': { includetext: false } };

function barcode(url) {
  const type = url.searchParams.get('type');
  const text = url.searchParams.get('text') || '';
  if (!BARCODES[type] || !text || text.length > 64) fail(400, 'Bad barcode request');
  const svg = bwipjs.toSVG({ bcid: type, text, ...BARCODES[type] });
  // 1D codes may stretch to fill the label width; bar ratios stay the same.
  return type === 'qrcode' ? svg : svg.replace('<svg ', '<svg preserveAspectRatio="none" ');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serveStatic(res, pathname) {
  const file = pathname === '/lib.mjs' ? join(here, 'lib.mjs') : normalize(join(here, 'public', pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(here) || !existsSync(file)) fail(404, 'Not found');
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/bc') {
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' });
      return res.end(barcode(url));
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return serveStatic(res, url.pathname);
    const body = await readBody(req);
    const db = load();
    let result;
    if (url.pathname === '/api/reset') {
      result = route();
      save(result);
    } else {
      result = route(db, body);
      if (req.method !== 'GET' && url.pathname !== '/api/publish') save(db);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(err.status || 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Blinders ERP on http://localhost:${PORT}`));
