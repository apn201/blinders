import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  binCheckDigits, binPayload, boxPayload, buildLensExport, classifyPayload,
  gs1CheckDigit, isValidGs1, makeGtin13, makeSscc, validateDb,
} from '../../erp/lib.mjs';
import { buildSeed } from '../../erp/seed.mjs';

test('GS1 check digit matches published examples', () => {
  assert.equal(gs1CheckDigit('400638133393'), '1'); // EAN-13 4006381333931
  assert.equal(gs1CheckDigit('10614141234567890'), '8'); // SSCC (00)106141412345678908, GS1 General Specifications example
  assert.ok(isValidGs1('4006381333931'));
  assert.ok(!isValidGs1('4006381333932'));
});

test('generated codes use the GS1 demo prefix 952 and are valid', () => {
  const gtin = makeGtin13(101);
  assert.equal(gtin.length, 13);
  assert.ok(gtin.startsWith('952'));
  assert.ok(isValidGs1(gtin));
  const sscc = makeSscc(1);
  assert.equal(sscc.length, 18);
  assert.ok(sscc.startsWith('09521234'));
  assert.ok(isValidGs1(sscc));
});

test('allow-list accepts our bin and box codes only (P4)', () => {
  assert.deepEqual(classifyPayload(binPayload('A-01-02')), { kind: 'bin', bin: 'A-01-02' });
  assert.deepEqual(classifyPayload(binPayload('GR-ZONE')), { kind: 'bin', bin: 'GR-ZONE' });
  const sscc = makeSscc(7);
  assert.deepEqual(classifyPayload(boxPayload(sscc)), { kind: 'box', sscc });
  for (const foreign of [
    'https://example.com',
    '4006381333931', // a vendor EAN
    '00106141412345678908', // valid SSCC, someone else's prefix
    '00' + sscc.slice(0, 17) + ((Number(sscc[17]) + 1) % 10), // our prefix, bad check digit
    'BIN:WH02:A-01-02',
    'bin:wh01:a-01-02',
  ]) assert.equal(classifyPayload(foreign), null, foreign);
});

test('bin check digits are stable two-digit numbers', () => {
  assert.equal(binCheckDigits('A-01-02'), binCheckDigits('A-01-02'));
  assert.match(binCheckDigits('A-01-02'), /^[1-9]\d$/);
});

test('seed data is valid', () => {
  assert.deepEqual(validateDb(buildSeed()), []);
});

test('validation catches broken data', () => {
  const db = buildSeed();
  db.stock[1].sscc = db.stock[0].sscc;
  db.stock[2].bin = 'Z-99-99';
  db.stock[3].action = 'one two three four five';
  const errors = validateDb(db).join('\n');
  assert.match(errors, /duplicate SSCC/);
  assert.match(errors, /unknown bin Z-99-99/);
  assert.match(errors, /longer than 4 words/);
});

test('lens export has expected box counts per bin and expiry per box', () => {
  const x = buildLensExport(buildSeed(), new Date('2026-10-21T12:00:00Z'));
  const a2 = x.bins.find((b) => b.bin === 'A-01-02');
  assert.deepEqual(a2.expected, [{ material: '100101', short: 'Arc reactor Mk II', boxes: 2 }]);
  const drink = x.boxes.find((b) => b.material === '100901' && b.bin === 'A-01-03');
  assert.equal(drink.bestBefore, '2026-10-28');
  const skates = x.boxes.find((b) => b.material === '100301');
  assert.equal(skates.bestBefore, null);
  // Nothing the glasses don't need.
  const keys = new Set(x.boxes.flatMap(Object.keys));
  for (const k of ['vendor', 'batch', 'qty', 'vendorBatch']) assert.ok(!keys.has(k), k);
});
