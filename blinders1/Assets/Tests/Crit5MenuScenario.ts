/**
 * Done criterion 5: Looking down for 2 s opens the mode menu; holding the gaze on an item fills
 * the timer circle and switches the mode (pinch also works).
 * Look-down: setLookDownOverride(true) (test override, replaces head pitch).
 * Menu gaze: setMenuGazeOverride(i) (test override, replaces the gaze ray).
 * Pinch: a real simulated SIK hand (LeafHandInteractor "right") pinching the UIKit Button of item 0.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { findSceneObject, matchSceneObjectName, sleep } from "Leaf.lspkg/Utils/common/Utils"
import { getInteractables } from "Leaf.lspkg/Interactors/InteractableUtils"
import { LeafHandInteractor } from "Leaf.lspkg/Interactors/interactor/LeafTwoHandInteractor"
import { calm, check, getMain, releaseOverrides, waitUntil } from "./BlindersLeafHelpers"
import { BlindersMain } from "../Scripts/BlindersMain"

function menuPanelEnabled(): boolean {
  const p = findSceneObject(matchSceneObjectName("MenuPanel"))
  return !!p && p.isEnabledInHierarchy
}

function ringFill(index: number): SceneObject | undefined {
  const item = findSceneObject(matchSceneObjectName("Item " + index))
  if (!item) return undefined
  return findSceneObject(matchSceneObjectName("RingFill"), item)
}

async function openByLookingDown(main: BlindersMain, label: string): Promise<void> {
  main.setLookDownOverride(false)
  await sleep(200)
  main.setLookDownOverride(true)
  const t0 = getTime()
  await sleep(1750)
  check(!main.isMenuOpen(), label + ": menu still closed after 1.75 s of looking down")
  const p = main.getLookDownProgress()
  check(p > 0.8 && p < 1, label + ": look-down progress ~0.875 at 1.75 s (" + p.toFixed(3) + ")")
  const t = await waitUntil(() => main.isMenuOpen(), 1500, 20)
  check(t >= 0, label + ": menu opens after looking down ~2 s")
  const openedAt = getTime() - t0
  print("[LEAF-Blinders] " + label + ": menu opened " + openedAt.toFixed(2) + " s after looking down")
  check(openedAt >= 1.9 && openedAt <= 2.4, label + ": opened at ~2 s (" + openedAt.toFixed(2) + " s)")
  await sleep(100)
  check(menuPanelEnabled(), label + ": MenuPanel visible")
}

@component
export class Crit5MenuScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(1500)
    const main = getMain()
    try {
      await calm(main, 1)
      check(!main.isMenuOpen(), "menu starts closed")

      // ---- Part A: look down 2 s, then gaze-dwell on item 2 ----
      main.setMenuGazeOverride(-1) // on the panel, no item (keeps the menu open while we look down)
      await openByLookingDown(main, "dwell")
      main.setLookDownOverride(false)

      const modeLogs0 = main.getAuditCount("mode 2 selected -> camera ON")
      main.setMenuGazeOverride(2)
      await sleep(700)
      check(main.getMenuHighlight() === 2, "item 2 highlighted while gazed at")
      const p = main.getMenuDwellProgress()
      check(p > 0.3 && p < 0.7, "timer circle partly filled at 0.7 s (" + p.toFixed(2) + ")")
      const rf = ringFill(2)
      check(!!rf && rf.isEnabledInHierarchy, "item 2 RingFill (timer circle) visible while filling")
      check(main.getMode() === 1, "mode not switched before the dwell completes")
      const tm = await waitUntil(() => main.getMode() === 2, 1500, 20)
      check(tm >= 0, "mode switches to 2 when the timer circle completes (1.5 s dwell)")
      await sleep(100)
      check(!main.isMenuOpen(), "menu closes after the dwell pick")
      check(main.getAuditCount("mode 2 selected -> camera ON") === modeLogs0 + 1, "Logger shows mode 2 selected")

      // ---- Part B: pinch item 0's UIKit button with a simulated hand ----
      main.setMenuGazeOverride(-1) // gaze on the panel but no item, so dwell cannot pick
      await openByLookingDown(main, "pinch")
      main.setLookDownOverride(false)
      await sleep(600) // let the panel follow-settle and UIKit buttons register
      const btn = getInteractables().find((i) => {
        const so = i.getSceneObject()
        const parent = so.getParent()
        return so.name === "Button" && !!parent && parent.name === "Item 0" && so.isEnabledInHierarchy
      })
      check(!!btn, "Item 0 UIKit Button interactable found while the menu is open")
      const mode0Logs0 = main.getAuditCount("mode 0 selected -> camera OFF, no reads")
      const hand = LeafHandInteractor.get("right")
      await hand.trigger(btn)
      const tp = await waitUntil(() => main.getMode() === 0, 2000, 20)
      await hand.hand.hide()
      check(tp >= 0, "pinching item 0 switches the mode to 0 (mode now " + main.getMode() + ")")
      check(main.getAuditCount("mode 0 selected -> camera OFF, no reads") === mode0Logs0 + 1, "Logger shows mode 0 selected after pinch")
      await sleep(200)
      check(!main.isMenuOpen(), "menu closes after the pinch pick")
    } finally {
      releaseOverrides(main)
      main.setPersonPresentOverride(false)
      main.setGazeOverride("")
      main.closeMenu()
      main.setMode(1)
    }
  }
}
