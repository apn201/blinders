/**
 * BlindersAuditLog - the audit log (stand-in for the plain .txt log on a server).
 * Owns: printing one structured line per event to the Logger panel, and keeping the lines of
 * THIS session in memory so tests can read them. Nothing is persisted (SPEC P3).
 * Must not: be given anything except allow-listed shelf/box codes and the fixed event texts
 * (callers in BlindersMain / BlindersRules only build events from those).
 *
 * Line format (one event per line): readable part first so it fits on screen in the Logger,
 * then " | " and the structured fields (key=value, values with spaces are quoted):
 *   14:04:48 person detected -> camera PAUSED, 0 frames sent | event=CAMERA_PAUSED seq=000042 reason=person_detected frames_sent=0 session=7f3a2c dev=SPECS-DEMO-01 ts=2026-10-21T14:04:48+03:00
 * seq starts at 1 every session and never skips, so a removed line shows as a gap.
 * scripts/audit-extract.mjs turns a Logger paste into audit.log plus a summary.
 */

export type AuditFields = { [key: string]: string | number }

export interface AuditEvent {
  /** Upper-case event type, e.g. SHELF_READ, CAMERA_PAUSED. */
  event: string
  fields: AuditFields
  /** Human-readable text of the event (also what tests match on). */
  msg: string
}

function pad(n: number, w: number): string {
  let s = "" + Math.abs(Math.floor(n))
  while (s.length < w) s = "0" + s
  return s
}

function quote(v: string | number): string {
  const s = "" + v
  return /^[A-Za-z0-9_.:+\-]+$/.test(s) ? s : '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'
}

export class BlindersAuditLog {
  private lines: string[] = []
  private msgs: string[] = []
  private seq = 0
  private readonly maxKept: number
  private readonly device: string
  private readonly session: string

  constructor(device: string = "SPECS-DEMO-01", maxKept: number = 400) {
    this.device = device
    this.maxKept = maxKept
    // Random per-session id: ties the lines of one session together, persisted nowhere
    this.session = (0x100000 + Math.floor(Math.random() * 0xefffff)).toString(16)
  }

  /** ISO 8601 local time with UTC offset, e.g. 2026-10-21T14:04:48+03:00. */
  static timestamp(d: Date = new Date()): string {
    const off = -d.getTimezoneOffset()
    const tz = (off >= 0 ? "+" : "-") + pad(Math.abs(off) / 60, 2) + ":" + pad(Math.abs(off) % 60, 2)
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2) +
      "T" + pad(d.getHours(), 2) + ":" + pad(d.getMinutes(), 2) + ":" + pad(d.getSeconds(), 2) + tz
    )
  }

  write(e: AuditEvent): void {
    this.seq++
    const d = new Date()
    const hms = pad(d.getHours(), 2) + ":" + pad(d.getMinutes(), 2) + ":" + pad(d.getSeconds(), 2)
    let line = hms + " " + e.msg + " | event=" + e.event + " seq=" + pad(this.seq, 6)
    for (const k of Object.keys(e.fields)) line += " " + k + "=" + quote(e.fields[k])
    line += " session=" + this.session + " dev=" + quote(this.device) + " ts=" + BlindersAuditLog.timestamp(d)
    print(line)
    this.lines.push(line)
    this.msgs.push(e.msg)
    if (this.lines.length > this.maxKept) {
      this.lines.shift()
      this.msgs.shift()
    }
  }

  /** Copy of this session's lines (memory only). */
  getLines(): string[] {
    return this.lines.slice()
  }

  /** Number of events whose message (or full line) contains `fragment`. */
  count(fragment: string): number {
    let n = 0
    for (let i = 0; i < this.lines.length; i++) {
      if (this.msgs[i].indexOf(fragment) >= 0 || this.lines[i].indexOf(fragment) >= 0) n++
    }
    return n
  }

  clear(): void {
    this.lines = []
    this.msgs = []
  }
}
