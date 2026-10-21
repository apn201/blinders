/**
 * BlindersAuditLog - the audit log (stand-in for the plain .txt log on a server).
 * Owns: printing one timestamped line per event to the Logger panel, verbatim, and keeping
 * the lines of THIS session in memory so tests can read them. Nothing is persisted (SPEC P3).
 * Must not: be given anything except allow-listed shelf/box codes and the fixed event texts
 * (callers in BlindersMain / BlindersRules only build lines from those).
 */

function pad2(n: number): string {
  return n < 10 ? "0" + n : "" + n
}

export class BlindersAuditLog {
  private lines: string[] = []
  private readonly maxKept: number

  constructor(maxKept: number = 400) {
    this.maxKept = maxKept
  }

  /** HH:MM:SS local time. */
  static timestamp(): string {
    const d = new Date()
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds())
  }

  write(event: string): void {
    const line = BlindersAuditLog.timestamp() + " " + event
    print(line)
    this.lines.push(line)
    if (this.lines.length > this.maxKept) this.lines.shift()
  }

  /** Copy of this session's lines (memory only). */
  getLines(): string[] {
    return this.lines.slice()
  }

  /** Number of lines whose event text contains `fragment`. */
  count(fragment: string): number {
    let n = 0
    for (const l of this.lines) if (l.indexOf(fragment) >= 0) n++
    return n
  }

  clear(): void {
    this.lines = []
  }
}
