import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAuditLines, parseFields, summarize } from '../../scripts/audit-extract.mjs';

const P = '14:04:48 [Assets/Scripts/BlindersAuditLog.ts:62] ';
// One audit line as the Lens prints it: readable part first, then " | " and the fields
const L = (seq, event, fields, msg) =>
  P + `14:04:48 ${msg} | event=${event} seq=${seq}${fields ? ' ' + fields : ''} session=a1b2c3 dev=SPECS-DEMO-01 ts=2026-10-21T14:04:48+03:00`;

const paste = [
  '14:04:31 Lens has been reset',
  '14:04:32 [Packages/SpectaclesInteractionKit.lspkg/Core/ConfigurationValidator/ConfigurationValidator.ts:16] SIK Version : 0.18.0',
  L('000001', 'SESSION_START', 'network=none storage=none formats="BIN,SSCC-952" recheck_s=5', 'session start'),
  L('000002', 'SHELF_READ', 'label=BIN:WH01:A-01-01 erp=local_copy', 'read BIN:WH01:A-01-01 -> ERP query (local copy)'),
  L('000003', 'SHELF_RESULT', 'bin=A-01-01 boxes_seen=0 warnings=1 result=empty', 'A-01-01 seen 0 boxes -> warning "Seems empty"'),
  L('000004', 'CAMERA_PAUSED', 'reason=person_detected frames_sent=0', 'person detected -> camera PAUSED, 0 frames sent'),
  L('000005', 'RECHECK', 'frames=1 result=person_present camera=paused', 'recheck: 1 frame -> person still present, stay paused'),
  L('000006', 'RECHECK', 'frames=1 result=clear camera=resumed', 'recheck: 1 frame -> clear, camera RESUMED'),
  P + '14:04:48 mode 1 selected -> camera ON',
].join('\r\n');

test('Logger paste: keeps only structured audit lines, strips the Logger prefix', () => {
  const { entries, legacy } = extractAuditLines(paste);
  assert.equal(entries.length, 6);
  assert.equal(legacy, 1);
  assert.ok(entries[0].line.startsWith('14:04:48 session start | event=SESSION_START'));
  assert.equal(entries[0].time, '2026-10-21T14:04:48+03:00');
  assert.equal(entries[2].msg, 'A-01-01 seen 0 boxes -> warning "Seems empty"');
});

test('quoted field values with spaces and escaped quotes parse back', () => {
  assert.deepEqual(parseFields('a=1 b="x y" c="say \\"hi\\""'), { a: '1', b: 'x y', c: 'say "hi"' });
});

test('summary counts pauses, rechecks and frames sent while paused', () => {
  const s = summarize(extractAuditLines(paste).entries);
  assert.equal(s.pauses, 1);
  assert.equal(s.framesWhilePaused, 0);
  assert.equal(s.recheckPresent, 1);
  assert.equal(s.recheckClear, 1);
  assert.equal(s.reads, 1);
  assert.deepEqual(s.declaredNetwork, ['none']);
  assert.deepEqual(s.gaps, []);
  assert.deepEqual(s.rejectedLabels, []);
});

test('summary flags a missing line and a code outside the allow-list', () => {
  const lines = paste.split('\r\n').filter((l) => !l.includes('seq=000003'));
  lines.push(L('000007', 'SHELF_READ', 'label=https://example.com erp=local_copy', 'x'));
  const s = summarize(extractAuditLines(lines.join('\n')).entries);
  assert.deepEqual(s.gaps, ['a1b2c3: seq 2 -> 4']);
  assert.deepEqual(s.rejectedLabels, ['https://example.com']);
});
