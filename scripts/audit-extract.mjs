// Turns a Lens Studio Logger paste into audit.log (Blinders audit lines only) and a summary
// computed from those lines. Nothing is added or reworded: every line in audit.log is a line the
// Lens printed, and every number in the summary is counted from audit.log.
//
//   node scripts/audit-extract.mjs [logger.txt] [out-dir]
//
// Writes <out-dir>/audit.log and <out-dir>/audit-summary.txt (default out-dir: audit/).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyPayload } from '../erp/lib.mjs';

// "HH:MM:SS <message> | event=... seq=... <fields> session=... dev=... ts=<ISO 8601>"
const LINE_RE = /^\d{2}:\d{2}:\d{2} (.*) \| (event=.*)$/;
const LOGGER_PREFIX_RE = /^\d{2}:\d{2}:\d{2} \[[^\]]*BlindersAuditLog\.ts:\d+\] /;
const FIELD_RE = /([a-z_]+)=("(?:[^"\\]|\\.)*"|\S+)/g;

/** Parse key=value fields of one audit line. */
export function parseFields(rest) {
  const fields = {};
  for (const m of rest.matchAll(FIELD_RE)) {
    let v = m[2];
    if (v.startsWith('"')) v = v.slice(1, -1).replace(/\\(.)/g, '$1');
    fields[m[1]] = v;
  }
  return fields;
}

/**
 * Pick the audit lines out of a Logger paste.
 * Returns { entries, legacy } where legacy counts old-format (pre-structured) audit lines skipped.
 */
export function extractAuditLines(text) {
  const entries = [];
  let legacy = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!LOGGER_PREFIX_RE.test(raw)) continue;
    const line = raw.replace(LOGGER_PREFIX_RE, '');
    const m = LINE_RE.exec(line);
    if (!m) {
      legacy++;
      continue;
    }
    const fields = parseFields(m[2]);
    entries.push({ line, msg: m[1], ...fields, time: fields.ts });
  }
  return { entries, legacy };
}

/** Count everything the security summary reports. */
export function summarize(entries) {
  const sessions = new Map();
  const events = {};
  const labels = new Set();
  const rejectedLabels = new Set();
  const warningsByRule = {};
  let framesWhilePaused = 0;
  let pauses = 0, recheckPresent = 0, recheckClear = 0, reads = 0, modeOff = 0;
  let declaredNetwork = new Set(), declaredStorage = new Set();

  for (const e of entries) {
    events[e.event] = (events[e.event] || 0) + 1;
    const key = (e.dev || '?') + ' ' + (e.session || '?');
    if (!sessions.has(key)) sessions.set(key, { dev: e.dev, session: e.session, first: e.time, last: e.time, seqs: [] });
    const s = sessions.get(key);
    s.last = e.time;
    s.seqs.push(Number(e.seq));

    if (e.label) (classifyPayload(e.label) ? labels : rejectedLabels).add(e.label);
    switch (e.event) {
      case 'SESSION_START':
        declaredNetwork.add(e.network);
        declaredStorage.add(e.storage);
        break;
      case 'SHELF_READ':
        reads++;
        break;
      case 'CAMERA_PAUSED':
        pauses++;
        framesWhilePaused += Number(e.frames_sent || 0);
        break;
      case 'RECHECK':
        if (e.result === 'clear') recheckClear++;
        else recheckPresent++;
        break;
      case 'MODE_SET':
        if (e.camera === 'off') modeOff++;
        break;
      case 'CHECK_WARNING':
      case 'CHECK_UNKNOWN':
        warningsByRule[e.rule] = (warningsByRule[e.rule] || 0) + 1;
        break;
    }
  }

  const gaps = [];
  for (const s of sessions.values()) {
    const sorted = [...s.seqs].sort((a, b) => a - b);
    if (sorted[0] !== 1) gaps.push(`${s.session}: starts at seq ${sorted[0]}`);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) gaps.push(`${s.session}: seq ${sorted[i - 1]} -> ${sorted[i]}`);
    }
  }

  return {
    lines: entries.length,
    sessions: [...sessions.values()].map(({ seqs, ...rest }) => ({ ...rest, events: seqs.length })),
    first: entries.length ? entries[0].time : null,
    last: entries.length ? entries[entries.length - 1].time : null,
    events,
    reads,
    pauses,
    framesWhilePaused,
    recheckPresent,
    recheckClear,
    modeOff,
    warningsByRule,
    labels: [...labels].sort(),
    rejectedLabels: [...rejectedLabels].sort(),
    declaredNetwork: [...declaredNetwork],
    declaredStorage: [...declaredStorage],
    gaps,
  };
}

function yesNo(ok) {
  return ok ? 'PASS' : 'FAIL';
}

/** Plain-text summary for the security review. */
export function formatSummary(s, { source, legacy = 0 } = {}) {
  const out = [];
  out.push('BLINDERS CAMERA AUDIT - SUMMARY');
  out.push('Computed from audit.log by scripts/audit-extract.mjs. Every number below is counted from the log lines.');
  if (source) out.push('Source: ' + source);
  out.push('Period: ' + (s.first || '-') + ' to ' + (s.last || '-'));
  out.push('Audit lines: ' + s.lines + ' in ' + s.sessions.length + ' session(s)');
  out.push('');
  out.push('PRIVACY CHECKS');
  out.push(`  [${yesNo(s.framesWhilePaused === 0)}] Frames read while a person was in view: ${s.framesWhilePaused} (over ${s.pauses} pause(s))`);
  out.push(`  [${yesNo(s.rejectedLabels.length === 0)}] Logged codes outside the allow-list (BIN:WH01:..., SSCC prefix 952): ${s.rejectedLabels.length}`);
  out.push(`  [${yesNo(s.declaredNetwork.length > 0 && s.declaredNetwork.every((v) => v === 'none'))}] Network declared at session start: ${s.declaredNetwork.join(', ') || 'not logged'}`);
  out.push(`  [${yesNo(s.declaredStorage.length > 0 && s.declaredStorage.every((v) => v === 'none'))}] Storage declared at session start: ${s.declaredStorage.join(', ') || 'not logged'}`);
  out.push(`  [${yesNo(s.gaps.length === 0)}] Sequence numbers continuous, no lines missing: ${s.gaps.length === 0 ? 'yes' : s.gaps.length + ' gap(s)'}`);
  for (const g of s.gaps) out.push('         gap ' + g);
  out.push('');
  out.push('CAMERA');
  out.push(`  Paused for a person:        ${s.pauses}`);
  out.push(`  Rechecks, person present:   ${s.recheckPresent} (1 test frame each)`);
  out.push(`  Rechecks, clear -> resumed: ${s.recheckClear}`);
  out.push(`  Switched off (mode 0):      ${s.modeOff}`);
  out.push('');
  out.push('SHELF CHECKS');
  out.push(`  Shelf reads (ERP queries, local copy): ${s.reads}`);
  const rules = Object.keys(s.warningsByRule).sort();
  out.push('  Warnings by rule: ' + (rules.length ? rules.map((r) => `${r} ${s.warningsByRule[r]}`).join(', ') : 'none'));
  out.push('  Distinct codes logged (' + s.labels.length + '):');
  for (const l of s.labels) out.push('    ' + l);
  out.push('');
  out.push('EVENTS');
  for (const k of Object.keys(s.events).sort()) out.push(`  ${k.padEnd(14)} ${s.events[k]}`);
  out.push('');
  out.push('SESSIONS');
  for (const x of s.sessions) out.push(`  ${x.dev} session ${x.session}: ${x.first} to ${x.last}, ${x.events} events`);
  if (legacy > 0) {
    out.push('');
    out.push(`Note: ${legacy} older audit line(s) in the old unstructured format were skipped.`);
  }
  return out.join('\n') + '\n';
}

function main() {
  const src = resolve(process.argv[2] || 'logger.txt');
  const outDir = resolve(process.argv[3] || 'audit');
  const { entries, legacy } = extractAuditLines(readFileSync(src, 'utf8'));
  if (entries.length === 0) {
    console.error(`No structured audit lines in ${src}` + (legacy ? ` (${legacy} old-format lines: re-run the Lens and paste the Logger again)` : ''));
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'audit.log'), entries.map((e) => e.line).join('\n') + '\n');
  const summary = formatSummary(summarize(entries), { source: src, legacy });
  writeFileSync(join(outDir, 'audit-summary.txt'), summary);
  process.stdout.write(summary);
  console.log(`\nWrote ${join(outDir, 'audit.log')} (${entries.length} lines) and audit-summary.txt`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
