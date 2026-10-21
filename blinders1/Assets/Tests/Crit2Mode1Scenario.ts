/**
 * Done criterion 2: In mode 1, looking at shelf A-01-01 shows the callout
 * "WH01 Shelf A-01-01 - Seems empty. Should have 1 box of 100201 (Grapnel line 50 m), 1 box of 100701 (Latex gloves L)",
 * and shelves that match the ERP show nothing.
 * Matching shelf: B-01-01 (rocket skates + A4 paper, both 1 of 1; the vendor EAN sticker is dropped by P4).
 * Gaze: setGazeOverride (test override).
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import { A0101_EMPTY_TEXT, calloutShown, calm, check, getMain, releaseOverrides, waitUntil } from "./BlindersLeafHelpers"

@component
export class Crit2Mode1Scenario extends Scenario {
  async run(): Promise<void> {
    await sleep(1500)
    const main = getMain()
    try {
      await calm(main, 1)
      check(main.getMode() === 1, "mode is 1")
      check(main.getVisibleCalloutTexts().length === 0, "no callouts before looking at anything")

      // --- A-01-01: empty shelf callout ---
      main.setGazeOverride("A-01-01")
      const t = await waitUntil(() => main.getVisibleCalloutTexts().length > 0, 2000)
      check(t >= 0, "looking at A-01-01 shows a callout")
      await sleep(300)
      const texts = main.getVisibleCalloutTexts()
      check(texts.length === 1, "exactly one callout for A-01-01 (got " + JSON.stringify(texts) + ")")
      check(texts[0] === A0101_EMPTY_TEXT, "A-01-01 callout text is exact (got " + JSON.stringify(texts[0]) + ")")
      check(calloutShown("BIN:WH01:A-01-01"), "callout is anchored on the A-01-01 shelf label")
      check(main.getVisibleGreenDotCount() === 0, "no green dot in mode 1")
      check(main.getAuditCount('A-01-01 seen 0 boxes -> warning "Seems empty"') > 0, "Logger shows the Seems empty warning")

      // --- B-01-01: matches the ERP, must show nothing ---
      main.setGazeOverride("")
      main.setMode(1) // clears A-01-01 callouts and the active set
      await sleep(300)
      const reads0 = main.getReadCount()
      const matchLog0 = main.getAuditCount("B-01-01 seen 2 boxes -> all match ERP")
      main.setGazeOverride("B-01-01")
      await sleep(1500)
      check(main.getReadCount() === reads0 + 1, "B-01-01 was actually read once (readCount " + reads0 + " -> " + main.getReadCount() + ")")
      check(main.getAuditCount("B-01-01 seen 2 boxes -> all match ERP") === matchLog0 + 1, 'Logger: "B-01-01 seen 2 boxes -> all match ERP"')
      check(main.getVisibleCalloutTexts().length === 0, "matching shelf B-01-01 shows nothing (got " +
        JSON.stringify(main.getVisibleCalloutTexts()) + ")")
      check(!calloutShown("BIN:WH01:B-01-01"), "no callout on the B-01-01 shelf label")
      check(!calloutShown("00095212340000000051"), "no callout on rocket skates box label")
      check(!calloutShown("00095212340000000105"), "no callout on A4 paper box label")
      check(!calloutShown("9521234003014"), "vendor EAN sticker never shown")
      check(main.getAuditCount("9521234003014") === 0, "vendor EAN sticker never logged (P4)")

      // --- contrast: B-01-02 (problem shelf) does show its warnings in mode 1 ---
      main.setGazeOverride("")
      main.setMode(1)
      await sleep(300)
      main.setGazeOverride("B-01-02")
      await sleep(1200)
      const b2 = main.getVisibleCalloutTexts()
      check(b2.indexOf("WH01 Shelf B-01-02 - 0 of 1 Neural net CPU") >= 0, "B-01-02 shows count warning (got " + JSON.stringify(b2) + ")")
      check(b2.indexOf("? 00095212340000000150 - not in ERP") >= 0, 'B-01-02 shows the "?" unknown box (got ' + JSON.stringify(b2) + ")")
      check(b2.length === 2, "B-01-02 shows exactly 2 callouts (matching fizzy drink box shows nothing)")
    } finally {
      releaseOverrides(main)
      main.setPersonPresentOverride(false)
      main.setGazeOverride("")
      main.setMode(1)
    }
  }
}
