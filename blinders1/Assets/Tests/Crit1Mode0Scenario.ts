/**
 * Done criterion 1: In mode 0, looking at the racks shows nothing, and the Logger shows the
 * camera is off and no reads happen.
 * Gaze: setGazeOverride (test override) for each shelf, plus the real preview camera (override cleared).
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import { A0101_EMPTY_TEXT, SHELVES, calm, check, getMain, releaseOverrides, waitUntil } from "./BlindersLeafHelpers"

@component
export class Crit1Mode0Scenario extends Scenario {
  async run(): Promise<void> {
    await sleep(1500)
    const main = getMain()
    try {
      // Control: in mode 1 the same gaze DOES show a callout (proves the gaze path works)
      await calm(main, 1)
      main.setGazeOverride("A-01-01")
      const shown = await waitUntil(() => main.getVisibleCalloutTexts().indexOf(A0101_EMPTY_TEXT) >= 0, 2000)
      check(shown >= 0, "control: mode 1 + gaze A-01-01 shows the empty-shelf callout")

      // Switch to mode 0
      const offLogsBefore = main.getAuditCount("mode 0 selected -> camera OFF, no reads")
      main.setMode(0)
      await sleep(200)
      check(main.getMode() === 0, "mode is 0")
      check(main.getAuditCount("mode 0 selected -> camera OFF, no reads") === offLogsBefore + 1,
        'Logger shows "mode 0 selected -> camera OFF, no reads" once')
      check(!main.isCameraOn(), "isCameraOn() is false in mode 0")
      check(main.getVisibleCalloutTexts().length === 0, "existing callouts hidden on entering mode 0 (got " +
        JSON.stringify(main.getVisibleCalloutTexts()) + ")")

      const reads0 = main.getReadCount()
      const rwp0 = main.getReadsWhilePaused()
      const frames0 = main.getFramesSent()
      const readLogs0 = main.getAuditCount("-> ERP query")

      // Look at every shelf (override)
      for (const s of SHELVES) {
        main.setGazeOverride(s)
        await sleep(600)
        check(main.getVisibleCalloutTexts().length === 0, "mode 0, looking at " + s + ": no callouts")
        check(main.getVisibleGreenDotCount() === 0, "mode 0, looking at " + s + ": no green dots")
      }
      // Real preview camera, no gaze override
      main.clearGazeOverride()
      await sleep(1000)
      check(main.getVisibleCalloutTexts().length === 0, "mode 0, real camera gaze: no callouts")

      // A person in view must not pause anything either (camera is off, nothing is detected)
      main.setPersonPresentOverride(true)
      await sleep(800)
      check(!main.isPaused(), "mode 0: person in view does not trigger a pause (detector is off)")
      check(!main.isPausePillVisible(), "mode 0: pause pill not shown")
      main.setPersonPresentOverride(false)

      check(main.getReadCount() === reads0, "no shelf reads in mode 0 (readCount " + reads0 + " -> " + main.getReadCount() + ")")
      check(main.getReadsWhilePaused() === rwp0, "read path never entered in mode 0 (readsWhilePaused unchanged)")
      check(main.getFramesSent() === frames0, "no frames sent in mode 0")
      check(main.getAuditCount("-> ERP query") === readLogs0, "Logger shows no read / ERP query lines in mode 0")
      check(main.isCameraOn() === false, "camera still off at end")
    } finally {
      releaseOverrides(main)
      main.setPersonPresentOverride(false)
      main.setGazeOverride("")
      main.setMode(1)
    }
  }
}
