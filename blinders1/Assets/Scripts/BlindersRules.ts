/**
 * BlindersRules - pure ERP check logic (SPEC R1-R7), no scene access.
 * Owns: turning "shelf label read + box labels read" into callout specs and audit-log lines.
 * Input payloads must already have passed BlindersLabelFormats.classifyPayload (P4).
 * Must not: touch the scene, log directly, or keep anything between calls.
 *
 * Rules: R1 wrong shelf (red) > R6 expiry (red expired / amber within 7 days) > R2 ERP action (amber);
 * R3 unknown code (grey "?"); R4 all fine (green dot, mode 2 only); R5 max 3 lines;
 * R7 count per material, shown once on the shelf label.
 */
import { ErpBin, ErpBox, ErpExport } from "./BlindersErpData"

export enum Severity {
  Info = 0,
  Ok = 1,
  Amber = 2,
  Red = 3,
  Grey = 4,
}

export interface CalloutSpec {
  /** Payload code of the label this callout belongs to (shelf or box). */
  labelCode: string
  text: string
  severity: Severity
  greenDot: boolean
}

export interface ShelfEvaluation {
  binId: string
  binCode: string
  boxesSeen: number
  warnings: number
  shelfCallout: CalloutSpec | null
  boxCallouts: CalloutSpec[]
  logLines: string[]
}

const MAX_LINES = 3
const EXPIRY_WARN_DAYS = 7

function dayNumber(iso: string): number {
  const p = iso.split("-")
  return Math.floor(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000)
}

function shortDate(iso: string): string {
  const p = iso.split("-")
  return p[2] + "." + p[1]
}

function longDate(iso: string): string {
  const p = iso.split("-")
  return p[2] + "." + p[1] + "." + p[0]
}

function clampLines(lines: string[]): string {
  return lines.slice(0, MAX_LINES).join("\n")
}

interface BoxProblem {
  text: string
  severity: Severity
}

/** Problems for one known box on this shelf, highest priority first (R1 > R6 > R2). */
function boxProblems(box: ErpBox, binId: string, today: string): BoxProblem[] {
  const out: BoxProblem[] = []
  if (box.bin !== binId) {
    out.push({ text: "belongs in " + box.bin, severity: Severity.Red })
  }
  if (box.bestBefore) {
    const days = dayNumber(box.bestBefore) - dayNumber(today)
    if (days < 0) {
      out.push({ text: "expired " + shortDate(box.bestBefore), severity: Severity.Red })
    } else if (days <= EXPIRY_WARN_DAYS) {
      out.push({ text: "expires " + shortDate(box.bestBefore), severity: Severity.Amber })
    }
  }
  if (box.action) {
    out.push({ text: box.action, severity: Severity.Amber })
  }
  return out
}

/**
 * Evaluate one shelf.
 * @param mode 1 = problems only, 2 = everything (green dots, soft prompts).
 */
export function evaluateShelf(
  erp: ErpExport,
  binCode: string,
  binId: string,
  boxCodes: string[],
  mode: number,
): ShelfEvaluation {
  const log: string[] = []
  const shelfId = erp.warehouse + " Shelf " + binId
  const bin: ErpBin | null = erp.bins.filter((b) => b.code === binCode)[0] || null
  log.push("read " + binCode + " -> ERP query (local copy)")

  const boxCallouts: CalloutSpec[] = []
  let warnings = 0

  if (!bin) {
    log.push("ERP reply: " + binId + " not in ERP")
    log.push(binId + ' -> "?" not in ERP')
    return {
      binId,
      binCode,
      boxesSeen: boxCodes.length,
      warnings: 1,
      shelfCallout: { labelCode: binCode, text: shelfId + " - ? not in ERP", severity: Severity.Grey, greenDot: false },
      boxCallouts,
      logLines: log,
    }
  }

  const expectText = bin.expected.map((e) => e.boxes + "x " + e.material).join(", ")
  log.push("ERP reply: " + binId + " expects " + (expectText.length > 0 ? expectText : "nothing"))

  // --- Empty shelf -------------------------------------------------------
  if (boxCodes.length === 0 && bin.expected.length > 0) {
    const should = bin.expected
      .map((e) => e.boxes + " box" + (e.boxes === 1 ? "" : "es") + " of " + e.material + " (" + e.short + ")")
      .join(", ")
    const text = shelfId + " - Seems empty. Should have " + should
    log.push(binId + ' seen 0 boxes -> warning "Seems empty"')
    return {
      binId,
      binCode,
      boxesSeen: 0,
      warnings: 1,
      shelfCallout: { labelCode: binCode, text, severity: Severity.Red, greenDot: false },
      boxCallouts,
      logLines: log,
    }
  }

  // --- Boxes ---------------------------------------------------------------
  const perBoxLog: string[] = []
  const seenPerMaterial: { [material: string]: number } = {}
  for (const code of boxCodes) {
    const box: ErpBox | null = erp.boxes.filter((b) => b.code === code)[0] || null
    if (!box) {
      warnings++
      perBoxLog.push(code + ' -> "?" not in ERP')
      const text = mode === 2 ? clampLines(["? Box " + code, "not in ERP"]) : "? " + code + " - not in ERP"
      boxCallouts.push({ labelCode: code, text, severity: Severity.Grey, greenDot: false })
      continue
    }
    seenPerMaterial[box.material] = (seenPerMaterial[box.material] || 0) + 1
    const problems = boxProblems(box, binId, erp.today)
    const title = box.material + " " + box.short
    if (problems.length > 0) {
      warnings++
      perBoxLog.push(code + ' -> warning "' + problems[0].text + '"')
      const text =
        mode === 2
          ? clampLines([title, problems[0].text, problems.length > 1 ? problems[1].text : box.status])
          : title + " - " + problems[0].text
      boxCallouts.push({ labelCode: code, text, severity: problems[0].severity, greenDot: false })
    } else if (mode === 2) {
      const detail = box.bestBefore ? "BBE " + longDate(box.bestBefore) + " · " + box.status : box.status
      boxCallouts.push({ labelCode: code, text: clampLines([title, detail]), severity: Severity.Info, greenDot: true })
    }
  }

  // --- R7 counts, once per material, on the shelf label ---------------------
  const countProblems: string[] = []
  const prompts: string[] = []
  for (const e of bin.expected) {
    const seen = seenPerMaterial[e.material] || 0
    if (seen !== e.boxes) {
      countProblems.push(seen + " of " + e.boxes + " " + e.short)
      if (seen < e.boxes) prompts.push("Confirm that " + e.short + " is in shelf " + binId)
    }
  }
  for (const c of countProblems) {
    warnings++
    perBoxLog.push(binId + ' -> warning "' + c + '"')
  }

  log.push(
    binId + " seen " + boxCodes.length + " box" + (boxCodes.length === 1 ? "" : "es") + " -> " +
      (warnings === 0 ? "all match ERP" : warnings + " warning" + (warnings === 1 ? "" : "s")),
  )
  for (const l of perBoxLog) log.push(l)

  let shelfCallout: CalloutSpec | null = null
  if (countProblems.length > 0) {
    const text =
      mode === 2
        ? clampLines([shelfId + " · " + bin.name, countProblems.join("; "), prompts.length > 0 ? prompts[0] : ""].filter((s) => s.length > 0))
        : shelfId + " - " + countProblems.join("; ")
    shelfCallout = { labelCode: binCode, text, severity: Severity.Amber, greenDot: false }
  } else if (mode === 2) {
    shelfCallout = {
      labelCode: binCode,
      text: clampLines([shelfId + " · " + bin.name, "Expects " + expectText + " · all seen"]),
      severity: Severity.Info,
      greenDot: true,
    }
  }

  return { binId, binCode, boxesSeen: boxCodes.length, warnings, shelfCallout, boxCallouts, logLines: log }
}
