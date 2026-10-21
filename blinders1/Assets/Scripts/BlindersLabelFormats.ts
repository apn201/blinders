/**
 * BlindersLabelFormats - SPEC P4 allow-list for decoded label payloads.
 * Owns: classifying a decoded payload as a shelf (bin) label or a box (SSCC) label.
 * Anything else (URL QR, vendor EAN, shipping label) returns null in the same call:
 * the caller must not show, log or keep it.
 * Must not: log, store, or return the rejected payload in any form.
 */

export type ParsedLabel =
  | { kind: "bin"; code: string; warehouse: string; bin: string }
  | { kind: "box"; code: string }

const BIN_RE = /^BIN:([A-Z0-9]{2,8}):([A-Z0-9-]{1,16})$/
const BOX_RE = /^00(\d{18})$/
/** Extension digit 0 + GS1 demo company prefix 9521234 (SPEC P4 / C8). */
const SSCC_PREFIX = "09521234"

/** GS1 mod-10 check digit over the 17 data digits of an SSCC. */
export function gs1CheckDigit(data17: string): number {
  let sum = 0
  for (let i = 0; i < data17.length; i++) {
    const digit = data17.charCodeAt(data17.length - 1 - i) - 48
    sum += digit * (i % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10
}

/** P4: returns the parsed label, or null (drop) for anything outside the two formats. */
export function classifyPayload(payload: string): ParsedLabel | null {
  const bin = BIN_RE.exec(payload)
  if (bin) {
    return { kind: "bin", code: payload, warehouse: bin[1], bin: bin[2] }
  }
  const box = BOX_RE.exec(payload)
  if (box) {
    const sscc = box[1]
    if (sscc.indexOf(SSCC_PREFIX) !== 0) return null
    if (gs1CheckDigit(sscc.substring(0, 17)) !== sscc.charCodeAt(17) - 48) return null
    return { kind: "box", code: payload }
  }
  return null
}
