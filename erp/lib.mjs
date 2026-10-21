// Shared by the server, the browser UI and the tests. No dependencies.

// GS1 prefix 952 is reserved by GS1 for demonstrations and examples.
// Codes built on it are valid GS1 codes that can never belong to a real company.
export const COMPANY_PREFIX = '9521234';
export const WAREHOUSE = 'WH01';

export const UOMS = ['EA', 'PR', 'BX', 'RM', 'L', 'KG'];
export const STORAGE_CONDITIONS = ['Ambient', 'Cool', 'Hazmat', 'ESD'];
export const BIN_TYPES = ['SHELF', 'QUAR', 'GR'];
export const STOCK_STATUS = ['Unrestricted', 'Quality inspection', 'Blocked'];

// GS1 mod-10 check digit for a digit string without its check digit.
export function gs1CheckDigit(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[digits.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidGs1(code) {
  return /^\d+$/.test(code) && gs1CheckDigit(code.slice(0, -1)) === code.slice(-1);
}

// GTIN-13 from our company prefix and a 5-digit item reference.
export function makeGtin13(itemRef) {
  const body = COMPANY_PREFIX + String(itemRef).padStart(5, '0');
  return body + gs1CheckDigit(body);
}

// SSCC: extension digit 0, company prefix, 9-digit serial, check digit = 18 digits.
export function makeSscc(serial) {
  const body = '0' + COMPANY_PREFIX + String(serial).padStart(9, '0');
  return body + gs1CheckDigit(body);
}

// Two check digits printed on a bin label, as used in voice picking.
// Stable for a given bin id, never 00.
export function binCheckDigits(bin) {
  let h = 7;
  for (const ch of bin) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return String(10 + (h % 90));
}

// Payloads the glasses accept (spec P4). Anything else is dropped.
export const binPayload = (bin) => `BIN:${WAREHOUSE}:${bin}`;
export const boxPayload = (sscc) => `00${sscc}`;

export function classifyPayload(text) {
  const bin = /^BIN:WH01:([A-Z]{1,2}-\d{2}-\d{2}|GR-ZONE)$/.exec(text);
  if (bin) return { kind: 'bin', bin: bin[1] };
  const box = /^00(0\d{17})$/.exec(text);
  if (box && box[1].startsWith('0' + COMPANY_PREFIX) && isValidGs1(box[1])) {
    return { kind: 'box', sscc: box[1] };
  }
  return null;
}

export function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86400000);
}

export function bestBefore(hu, material) {
  if (!material || !material.shelfLifeDays) return null;
  return addDays(hu.manufactured, material.shelfLifeDays);
}

// Returns a list of problems. Empty list = valid.
export function validateDb(db) {
  const errors = [];
  const matIds = new Set();
  for (const m of db.materials) {
    if (matIds.has(m.material)) errors.push(`duplicate material ${m.material}`);
    matIds.add(m.material);
    if (!isValidGs1(m.gtin) || m.gtin.length !== 13) errors.push(`material ${m.material}: bad GTIN ${m.gtin}`);
    if (!UOMS.includes(m.uom)) errors.push(`material ${m.material}: unknown UoM ${m.uom}`);
  }
  const binIds = new Set();
  for (const b of db.bins) {
    if (binIds.has(b.bin)) errors.push(`duplicate bin ${b.bin}`);
    binIds.add(b.bin);
    if (!classifyPayload(binPayload(b.bin))) errors.push(`bin ${b.bin}: id does not fit label format`);
  }
  const ssccs = new Set();
  for (const h of db.stock) {
    if (ssccs.has(h.sscc)) errors.push(`duplicate SSCC ${h.sscc}`);
    ssccs.add(h.sscc);
    if (!classifyPayload(boxPayload(h.sscc))) errors.push(`box ${h.sscc}: bad SSCC`);
    if (!matIds.has(h.material)) errors.push(`box ${h.sscc}: unknown material ${h.material}`);
    if (!binIds.has(h.bin)) errors.push(`box ${h.sscc}: unknown bin ${h.bin}`);
    if (h.action && h.action.trim().split(/\s+/).length > 4) errors.push(`box ${h.sscc}: action longer than 4 words`);
  }
  return errors;
}

// The small file the Lens reads (spec 2.5). Nothing else leaves the ERP.
// Per bin: how many boxes of each material should be there (count check).
// Per box: where it belongs, best before (expiry check), status and action.
export function buildLensExport(db, now = new Date()) {
  const mat = Object.fromEntries(db.materials.map((m) => [m.material, m]));
  const short = (id) => mat[id]?.short || mat[id]?.description || id;
  return {
    generated: now.toISOString(),
    today: now.toISOString().slice(0, 10),
    warehouse: WAREHOUSE,
    bins: db.bins.map((b) => {
      const expected = {};
      for (const h of db.stock) if (h.bin === b.bin) expected[h.material] = (expected[h.material] || 0) + 1;
      return {
        code: binPayload(b.bin),
        bin: b.bin,
        name: b.description,
        expected: Object.entries(expected).map(([material, boxes]) => ({ material, short: short(material), boxes })),
      };
    }),
    boxes: db.stock.map((h) => ({
      code: boxPayload(h.sscc),
      bin: h.bin,
      material: h.material,
      short: short(h.material),
      bestBefore: bestBefore(h, mat[h.material]),
      status: h.status,
      action: h.action || null,
    })),
  };
}
