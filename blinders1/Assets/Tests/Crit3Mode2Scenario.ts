/**
 * Done criterion 3: In mode 2, looking at the racks shows callouts on all shelf and box labels
 * with all warnings and green dots on matching labels, and callouts for shelves you've looked
 * away from fade out after about 5 s.
 * Gaze: setGazeOverride (test override), swept over all six shelves.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import { SHELVES, calloutAlpha, calloutObject, calloutShown, calm, check, getMain, releaseOverrides } from "./BlindersLeafHelpers"

const SHELF_LABELS = SHELVES.map((s) => "BIN:WH01:" + s)
const BOX_LABELS = [
  "00095212340000000013", "00095212340000000068", // A-01-02
  "00095212340000000037", "00095212340000000112", // A-01-03
  "00095212340000000051", "00095212340000000105", // B-01-01
  "00095212340000000129", "00095212340000000150", // B-01-02
  "00095212340000000075", "00095212340000000082", // B-01-03
]
const GREEN = [
  "BIN:WH01:A-01-03", "BIN:WH01:B-01-01", "BIN:WH01:B-01-03",
  "00095212340000000013", "00095212340000000037", "00095212340000000051",
  "00095212340000000105", "00095212340000000129", "00095212340000000075",
]
const WARNINGS = [
  "Seems empty. Should have 1 box of 100201 (Grapnel line 50 m), 1 box of 100701 (Latex gloves L)",
  "1 of 2 Arc reactor Mk II",
  "belongs in B-01-02",
  "expires 28.10",
  "? Box 00095212340000000150",
  "0 of 1 Neural net CPU",
  "move to quarantine",
]

function dotShown(labelCode: string): boolean {
  const so = calloutObject(labelCode)
  if (!so || !so.enabled) return false
  // BlindersCalloutsUI toggles the GreenDot Text component (v.dot.enabled), not its SceneObject
  // Look the dot up by name: the callout also holds leader-line children
  for (let i = 0; i < so.getChildrenCount(); i++) {
    const c = so.getChild(i)
    if (c.name !== "GreenDot") continue
    const dot = c.getComponent("Component.Text") as Text
    return !!dot && dot.enabled
  }
  return false
}

@component
export class Crit3Mode2Scenario extends Scenario {
  async run(): Promise<void> {
    await sleep(1500)
    const main = getMain()
    try {
      await calm(main, 2)
      check(main.getMode() === 2, "mode is 2")

      // Sweep the gaze over every shelf (each stays active for 5 s after the last look)
      for (const s of SHELVES) {
        main.setGazeOverride(s)
        await sleep(300)
      }
      // hold on the last shelf
      await sleep(300)

      const texts = main.getVisibleCalloutTexts()
      print("[LEAF-Blinders] mode 2 visible callouts:\n" + texts.join("\n---\n"))
      for (const l of SHELF_LABELS) check(calloutShown(l), "mode 2: callout on shelf label " + l)
      for (const l of BOX_LABELS) check(calloutShown(l), "mode 2: callout on box label " + l)
      check(texts.length === SHELF_LABELS.length + BOX_LABELS.length,
        "mode 2: exactly 16 callouts (6 shelf + 10 box labels), got " + texts.length)
      check(!calloutShown("9521234003014"), "mode 2: vendor EAN sticker still dropped")
      const all = texts.join("\n")
      for (const w of WARNINGS) check(all.indexOf(w) >= 0, 'mode 2: warning shown: "' + w + '"')
      for (const t of texts) check(t.split("\n").length <= 3, "R5: callout has <= 3 lines: " + JSON.stringify(t))

      check(main.getVisibleGreenDotCount() === GREEN.length, "mode 2: " + GREEN.length + " green dots (got " + main.getVisibleGreenDotCount() + ")")
      for (const l of SHELF_LABELS.concat(BOX_LABELS)) {
        const want = GREEN.indexOf(l) >= 0
        check(dotShown(l) === want, "green dot on " + l + " is " + (want ? "shown" : "absent"))
      }

      // --- Fade: hold gaze on B-01-03, look away from the rest; then precise timing on one shelf ---
      main.setGazeOverride("") // look at nothing
      const t0 = getTime()
      await sleep(4300)
      check(calloutAlpha("BIN:WH01:B-01-03") > 0.99, "4.3 s after looking away the last-looked shelf's callout is still fully shown")
      // poll the fade of the last-looked shelf (B-01-03)
      let fadeStart = -1
      let gone = -1
      while (getTime() - t0 < 9) {
        const a = calloutAlpha("BIN:WH01:B-01-03")
        if (fadeStart < 0 && a < 0.99) fadeStart = getTime() - t0
        if (a <= 0.0001 && !calloutShown("BIN:WH01:B-01-03")) {
          gone = getTime() - t0
          break
        }
        await sleep(30)
      }
      print("[LEAF-Blinders] fade start " + fadeStart.toFixed(2) + " s, gone " + gone.toFixed(2) + " s after looking away")
      check(fadeStart >= 4.6 && fadeStart <= 5.6, "fade starts about 5 s after looking away (" + fadeStart.toFixed(2) + " s)")
      check(gone > 0 && gone <= 7.0, "callout fully gone by ~5.8 s (" + gone.toFixed(2) + " s)")
      check(main.getVisibleCalloutTexts().length === 0, "all shelves looked away from have faded out (" +
        main.getVisibleCalloutTexts().length + " left)")
    } finally {
      releaseOverrides(main)
      main.setPersonPresentOverride(false)
      main.setGazeOverride("")
      main.setMode(1)
    }
  }
}
