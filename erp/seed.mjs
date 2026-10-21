// Writes the demo database to data/erp-db.json.
// node erp/seed.mjs          only if the file does not exist
// node erp/seed.mjs --force  overwrite
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGtin13, makeSscc, validateDb } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, 'data', 'erp-db.json');

// material, description, short, vendor, vendorMaterial, uom, perCase, shelfLife, minRemaining, condition, batch, kg
const MATERIALS = [
  ['100101', 'Arc reactor cell, palladium core, Mk II', 'Arc reactor Mk II', 'Stark Industries', 'SI-ARC-MK2', 'EA', 4, 1825, 365, 'ESD', true, 2.4],
  ['100102', 'Repulsor actuator assembly, left hand', 'Repulsor, left', 'Stark Industries', 'SI-REP-L-07', 'EA', 2, 0, 0, 'ESD', true, 3.1],
  ['100201', 'Grapnel line, aramid, 50 m', 'Grapnel line 50 m', 'Wayne Enterprises', 'WE-GL-050', 'EA', 1, 3650, 730, 'Ambient', true, 1.8],
  ['100301', 'Rocket-powered roller skates', 'Rocket skates', 'Acme Corporation', 'ACME-RS-01', 'PR', 1, 0, 0, 'Hazmat', false, 4.5],
  ['100401', 'Neural net processor, T-800 series', 'Neural net CPU', 'Cyberdyne Systems', 'CSI-101-T800', 'EA', 10, 0, 0, 'ESD', true, 0.6],
  ['100501', 'Cryo-stasis seal spray, 400 ml', 'Cryo seal spray', 'Weyland-Yutani', 'WY-CS-400', 'EA', 12, 730, 180, 'Hazmat', true, 6.2],
  ['100601', 'Performance enhancer OZ-2, 50 ml', 'OZ-2 enhancer', 'Oscorp', 'OSC-OZ2-50', 'EA', 6, 365, 90, 'Cool', true, 0.5],
  ['100701', 'Latex gloves, size L, box of 100', 'Latex gloves L', 'Vandelay Industries', 'VI-LTX-L100', 'BX', 10, 1825, 365, 'Ambient', true, 7.0],
  ['100801', 'Copy paper A4 80 g/m2, ream of 500', 'A4 paper', 'Dunder Mifflin', 'DM-A4-80', 'RM', 5, 0, 0, 'Ambient', false, 12.5],
  ['100901', 'Fizzy lifting drink, 0.33 L can', 'Fizzy lifting drink', 'Wonka Industries', 'WI-FLD-033', 'EA', 24, 180, 30, 'Cool', true, 8.9],
];

// bin, type, description, maxKg
const BINS = [
  ['A-01-01', 'SHELF', 'Rack A, level 1 (bottom)', 40],
  ['A-01-02', 'SHELF', 'Rack A, level 2', 40],
  ['A-01-03', 'SHELF', 'Rack A, level 3 (top)', 25],
  ['B-01-01', 'SHELF', 'Rack B, level 1 (bottom)', 40],
  ['B-01-02', 'SHELF', 'Rack B, level 2', 40],
  ['B-01-03', 'SHELF', 'Rack B, level 3 (top)', 25],
  ['Q-01-01', 'QUAR', 'Quarantine, red box under rack B', 30],
  ['GR-ZONE', 'GR', 'Goods receipt, floor by the door', 200],
];

// material, bin, qty, batch, vendorBatch, manufactured, received, status, action
const STOCK = [
  ['100101', 'A-01-02', 4, 'SI2609A', 'MK2-0042', '2026-09-14', '2026-10-03', 'Unrestricted', null],
  ['100101', 'A-01-02', 4, 'SI2609A', 'MK2-0042', '2026-09-14', '2026-10-03', 'Unrestricted', null],
  ['100102', 'A-01-03', 2, 'SI2608R', 'L07-118', '2026-08-20', '2026-09-02', 'Unrestricted', null],
  ['100201', 'A-01-01', 1, 'WE2607', 'GL-77', '2026-07-11', '2026-08-15', 'Unrestricted', null],
  ['100301', 'B-01-01', 1, '', 'RR-1949', '2026-06-01', '2026-09-20', 'Unrestricted', null],
  // Demo R1: the ERP says B-01-02. On the real shelf this box sits on A-01-02.
  ['100401', 'B-01-02', 10, 'CS2610', 'T800-3341', '2026-10-01', '2026-10-12', 'Unrestricted', null],
  ['100501', 'B-01-03', 12, 'WY2605', 'LV426-9', '2026-05-04', '2026-06-10', 'Unrestricted', null],
  // Demo R2: action shown by the Lens.
  ['100601', 'B-01-03', 6, 'OS2609', 'OZ2-0666', '2026-09-01', '2026-10-15', 'Quality inspection', 'move to quarantine'],
  ['100701', 'A-01-01', 10, 'VI2604', 'ART-V-1', '2026-04-02', '2026-05-11', 'Unrestricted', null],
  ['100801', 'B-01-01', 5, '', 'SCR-2026-11', '2026-03-15', '2026-04-01', 'Unrestricted', null],
  // Best before 2026-10-28: shows up as expiring in the ERP.
  ['100901', 'A-01-03', 24, 'WI2605', 'GOLD-07', '2026-05-01', '2026-06-01', 'Unrestricted', null],
  ['100901', 'B-01-02', 24, 'WI2609', 'GOLD-12', '2026-09-10', '2026-10-14', 'Unrestricted', null],
  ['100102', 'Q-01-01', 2, 'SI2607R', 'L07-091', '2026-07-01', '2026-07-20', 'Blocked', null],
  ['100401', 'GR-ZONE', 10, 'CS2610', 'T800-3342', '2026-10-01', '2026-10-20', 'Unrestricted', 'put away B-01-02'],
];

export function buildSeed() {
  const materials = MATERIALS.map(([material, description, short, vendor, vendorMaterial, uom, perCase, shelfLifeDays, minRemainingDays, storage, batchManaged, caseKg]) => ({
    material, description, short, vendor, vendorMaterial,
    gtin: makeGtin13(Number(material) - 100000),
    uom, perCase, shelfLifeDays, minRemainingDays, storage, batchManaged, caseKg,
  }));
  const bins = BINS.map(([bin, type, description, maxKg]) => ({ bin, type, description, maxKg, blocked: false }));

  let doc = 4900000100;
  const movements = [];
  const stock = STOCK.map(([material, bin, qty, batch, vendorBatch, manufactured, received, status, action], i) => {
    const sscc = makeSscc(i + 1);
    const grDoc = String(++doc);
    const uom = materials.find((m) => m.material === material).uom;
    movements.push({ doc: grDoc, date: received, type: '101', text: 'Goods receipt', sscc, material, batch, qty, uom, from: '', to: 'GR-ZONE', user: 'JLILJA' });
    if (bin !== 'GR-ZONE') {
      movements.push({ doc: String(++doc), date: received, type: '311', text: 'Transfer', sscc, material, batch, qty, uom, from: 'GR-ZONE', to: bin, user: 'JLILJA' });
    }
    if (status !== 'Unrestricted') {
      movements.push({ doc: String(++doc), date: received, type: '344', text: `Status to ${status}`, sscc, material, batch, qty, uom, from: bin, to: bin, user: 'JLILJA' });
    }
    return { sscc, material, batch, vendorBatch, qty, uom, bin, manufactured, received, status, action, grDoc };
  });
  movements.sort((a, b) => a.date.localeCompare(b.date) || a.doc.localeCompare(b.doc));

  return { nextSerial: STOCK.length + 1, nextDoc: doc + 1, materials, bins, stock, movements };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (existsSync(dbPath) && !process.argv.includes('--force')) {
    console.log(`${dbPath} exists. Use --force to overwrite.`);
  } else {
    const db = buildSeed();
    const errors = validateDb(db);
    if (errors.length) throw new Error(errors.join('\n'));
    mkdirSync(dirname(dbPath), { recursive: true });
    writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n');
    console.log(`Wrote ${dbPath}: ${db.materials.length} materials, ${db.bins.length} bins, ${db.stock.length} boxes.`);
  }
}
