/**
 * Shared helpers for the Blinders LEAF scenarios (one scenario per done criterion).
 * Tests only use the public test hooks of BlindersMain / BlindersPersonController and
 * read scene objects; they never change Lens behaviour.
 */
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils"
import { BlindersMain } from "../Scripts/BlindersMain"
import { BlindersPersonController } from "../Scripts/BlindersPersonController"

export const SHELVES = ["A-01-01", "A-01-02", "A-01-03", "B-01-01", "B-01-02", "B-01-03"]

export const A0101_EMPTY_TEXT =
  "WH01 Shelf A-01-01 - Seems empty. Should have 1 box of 100201 (Grapnel line 50 m), 1 box of 100701 (Latex gloves L)"

export function getMain(): BlindersMain {
  const so = findSceneObjectByName("Blinders")
  if (!so) throw new Error('SceneObject "Blinders" not found')
  const m = so.getComponent(BlindersMain.getTypeName()) as BlindersMain
  if (!m) throw new Error("BlindersMain component not found on Blinders")
  return m
}

export function getPerson(): BlindersPersonController {
  const so = findSceneObjectByName("StandInPerson")
  if (!so) throw new Error('SceneObject "StandInPerson" not found')
  const p = so.getComponent(BlindersPersonController.getTypeName()) as BlindersPersonController
  if (!p) throw new Error("BlindersPersonController component not found on StandInPerson")
  return p
}

export function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error("ASSERT FAILED: " + msg)
  print("[LEAF-Blinders] ok: " + msg)
}

/** Poll `cond` every frame-ish until true or timeout; returns elapsed ms or -1. */
export async function waitUntil(cond: () => boolean, timeoutMs: number, stepMs: number = 50): Promise<number> {
  const start = getTime()
  while ((getTime() - start) * 1000 < timeoutMs) {
    if (cond()) return (getTime() - start) * 1000
    await sleep(stepMs)
  }
  return cond() ? (getTime() - start) * 1000 : -1
}

/** Calm state: no person, no gaze, menu closed, overrides released except the given person override. */
export async function calm(main: BlindersMain, mode: number): Promise<void> {
  main.setPersonPresentOverride(false)
  main.setLookDownOverride(false)
  main.setMenuGazeOverride(null)
  main.setGazeOverride("")
  main.closeMenu()
  await sleep(100)
  main.setMode(mode)
  await sleep(200)
  // If a previous run left the camera paused, setMode(1/2) keeps it paused: wait for the recheck to clear it
  if (main.isPaused()) {
    const t = await waitUntil(() => !main.isPaused(), 7000)
    check(t >= 0, "camera un-pauses within 7 s once the person override is false")
  }
}

/** Release every override the tests use. */
export function releaseOverrides(main: BlindersMain): void {
  main.clearGazeOverride()
  main.setLookDownOverride(null)
  main.setMenuGazeOverride(null)
  main.setPersonPresentOverride(null)
}

export function calloutObject(labelCode: string): SceneObject | undefined {
  return findSceneObjectByName("Callout " + labelCode)
}

export function calloutShown(labelCode: string): boolean {
  const so = calloutObject(labelCode)
  return !!so && so.enabled
}

/** Alpha of a callout's text (0 when missing or hidden). */
export function calloutAlpha(labelCode: string): number {
  const so = calloutObject(labelCode)
  if (!so || !so.enabled) return 0
  const textSo = so.getChild(0)
  const t = textSo.getComponent("Component.Text") as Text
  return t ? t.textFill.color.w : 0
}

export function auditSince(main: BlindersMain, before: number): string[] {
  const lines = main.getAuditLog()
  return lines.slice(Math.min(before, lines.length))
}
