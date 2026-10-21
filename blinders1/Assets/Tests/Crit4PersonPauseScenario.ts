/**
 * Done criterion 4: When the virtual person walks into view, callouts disappear,
 * "PERSON DETECTED · CAMERA PAUSED" shows, and the Logger shows the pause; 5 s later a single
 * recheck is logged, and the camera resumes (and logs it) once the person has gone.
 * Person: the REAL stand-in loop (no person override); restartLoop(1) only schedules the walk-in.
 * Shelf gaze: setGazeOverride("A-01-01") so a callout is on screen before the person arrives.
 * Person detection uses the real preview camera direction.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils"
import { A0101_EMPTY_TEXT, calm, check, getMain, getPerson, releaseOverrides, waitUntil } from "./BlindersLeafHelpers"

const PILL = "PERSON DETECTED · CAMERA PAUSED"

function pillOnScreen(): { enabled: boolean; text: string } {
  const pill = findSceneObjectByName("Pill", findSceneObjectByName("PausePill"))
  if (!pill) return { enabled: false, text: "" }
  let txt = ""
  const content = pill.getChild(0)
  for (let i = 0; i < content.getChildrenCount(); i++) {
    const t = content.getChild(i).getComponent("Component.Text") as Text
    if (t) txt = t.text
  }
  return { enabled: pill.isEnabledInHierarchy, text: txt }
}

@component
export class Crit4PersonPauseScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(1500)
    const main = getMain()
    const person = getPerson()
    try {
      // Keep the real person off-stage while setting up
      person.restartLoop(60)
      await calm(main, 1)
      main.setGazeOverride("A-01-01")
      check((await waitUntil(() => main.getVisibleCalloutTexts().indexOf(A0101_EMPTY_TEXT) >= 0, 2000)) >= 0,
        "setup: A-01-01 callout on screen before the person arrives")
      check(!main.isPaused() && main.isCameraOn(), "setup: camera on, not paused")

      const pauseLogs0 = main.getAuditCount("person detected -> camera PAUSED")
      const recheck0 = main.getRecheckCount()
      const recheckLogs0 = main.getAuditCount("recheck: 1 frame")
      const resumeLogs0 = main.getAuditCount("camera RESUMED")
      const rwp0 = main.getReadsWhilePaused()

      // Release the detector to the REAL stand-in person and start the walk-in in 1 s
      const camT = findSceneObjectByName("Camera Object").getTransform()
      const angleToChest = (): number => {
        const d = person.getChestWorldPosition().sub(camT.getWorldPosition()).normalize()
        const f = camT.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)).normalize()
        return (Math.acos(Math.max(-1, Math.min(1, d.dot(f)))) * 180) / Math.PI
      }
      print("[LEAF-Blinders] camera pos " + camT.getWorldPosition().toString() + " fwd " +
        camT.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)).toString())
      main.setPersonPresentOverride(null)
      person.restartLoop(1)
      let lastLog = -1
      const tDetect = await waitUntil(() => {
        const lt = person.getLoopTime()
        if (lt >= 0 && Math.floor(lt) !== lastLog) {
          lastLog = Math.floor(lt)
          print("[LEAF-Blinders] loop t=" + lt.toFixed(2) + " chest angle from view centre " + angleToChest().toFixed(1) + " deg, paused " + main.isPaused())
        }
        return main.isPaused()
      }, 12000, 20)
      check(tDetect >= 0, "the walking stand-in person is detected (camera paused) within 12 s of starting the walk-in")
      const pausedAt = getTime()
      print("[LEAF-Blinders] person detected " + (tDetect / 1000).toFixed(2) + " s after restartLoop(1); loop time " +
        person.getLoopTime().toFixed(2) + ", inScene " + person.isVisibleInScene())
      check(person.isVisibleInScene(), "stand-in person is visible in the scene when the pause happens")

      await sleep(100)
      check(main.getVisibleCalloutTexts().length === 0, "callouts disappear on pause (got " + JSON.stringify(main.getVisibleCalloutTexts()) + ")")
      check(main.isPausePillVisible(), "pause pill is showing")
      check(main.getPausePillText() === PILL, "pill text is exactly " + PILL + " (got " + main.getPausePillText() + ")")
      const pill = pillOnScreen()
      check(pill.enabled, "pill SceneObject is enabled on screen")
      check(pill.text === PILL, "pill Text component reads " + PILL + " (got " + pill.text + ")")
      check(main.getAuditCount("person detected -> camera PAUSED") === pauseLogs0 + 1, "Logger shows the pause once")
      check(!main.isCameraOn(), "camera is off while paused")

      // Before 5 s: no recheck yet
      await sleep(4300 - 100)
      check(main.getRecheckCount() === recheck0, "no recheck in the first 4.3 s of the pause")
      // At ~5 s: exactly one recheck
      const tR = await waitUntil(() => main.getRecheckCount() > recheck0, 2000, 20)
      check(tR >= 0, "a recheck happens about 5 s after the pause")
      const recheckAt = getTime() - pausedAt
      print("[LEAF-Blinders] first recheck at " + recheckAt.toFixed(2) + " s after pause")
      check(recheckAt >= 4.7 && recheckAt <= 5.6, "first recheck ~5 s after pause (" + recheckAt.toFixed(2) + " s)")
      await sleep(300)
      check(main.getRecheckCount() === recheck0 + 1, "exactly one recheck (single test frame) at the 5 s mark")
      check(main.getAuditCount("recheck: 1 frame") === recheckLogs0 + 1, "Logger shows exactly one recheck line at the 5 s mark")

      // Wait until the person has gone and the camera resumes
      const tRes = await waitUntil(() => !main.isPaused(), 25000, 20)
      check(tRes >= 0, "camera resumes within 25 s (person walks out)")
      const resumedAfter = getTime() - pausedAt
      const camPos = findSceneObjectByName("Camera Object").getTransform().getWorldPosition()
      const camDir = findSceneObjectByName("Camera Object").getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
      check(!person.isInView(camPos, camDir, main.personDetectHalfAngleDeg, 600), "person is out of view when the camera resumes")
      check(main.getAuditCount("camera RESUMED") === resumeLogs0 + 1, 'Logger shows "recheck: 1 frame -> clear, camera RESUMED"')
      const rechecks = main.getRecheckCount() - recheck0
      print("[LEAF-Blinders] resumed " + resumedAfter.toFixed(2) + " s after pause, after " + rechecks + " recheck(s)")
      check(main.getAuditCount("recheck: 1 frame") === recheckLogs0 + rechecks, "one Logger line per recheck")
      await sleep(200)
      check(!main.isPausePillVisible(), "pill hidden after resume")
      check(main.isCameraOn(), "camera on after resume")
      check(main.getReadsWhilePaused() === rwp0, "no reads while paused (P2)")
      // reading resumes: A-01-01 callout comes back
      check((await waitUntil(() => main.getVisibleCalloutTexts().indexOf(A0101_EMPTY_TEXT) >= 0, 2000)) >= 0,
        "reading resumes after the pause (A-01-01 callout returns)")
    } finally {
      releaseOverrides(main)
      main.setPersonPresentOverride(false)
      main.setGazeOverride("")
      person.restartLoop(60)
      main.setMode(1)
    }
  }
}
