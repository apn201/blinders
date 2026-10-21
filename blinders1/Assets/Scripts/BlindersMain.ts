/**
 * BlindersMain - orchestrator for the Blinders shelf-check Lens.
 * Owns: the mode (0/1/2), the camera pause state, which shelves are being read, fade timing,
 *       the look-down-to-open menu and gaze dwell, and the audit log.
 * Talks to: BlindersRackBuilder (labels + gaze zones), BlindersPersonController (person in view?),
 *       BlindersCalloutsUI / BlindersPausePillUI / BlindersModeMenuUI (passive views), BlindersRules (checks).
 * Privacy (SPEC P1-P3): no network module of any kind; no reads while paused (the read path is
 *       not called); nothing persisted. Only allow-listed codes and fixed events reach the log.
 * Must not: create UI text or UIKit components (UI modules do), or decide rule outcomes (BlindersRules does).
 *
 * Preview stand-ins: a label is "read" when the centre-of-view ray hits its shelf zone within
 * readRangeCm (mode 2: any shelf whose zone centre is inside the view cone); the person
 * stand-in counts as "detected" when it is inside the detection cone.
 *
 * Test hooks (public): getMode/setMode, isPaused, isCameraOn, getVisibleCalloutTexts,
 * getVisibleGreenDotCount, isPausePillVisible, getPausePillText, isMenuOpen, openMenu, closeMenu,
 * getMenuHighlight, getMenuDwellProgress, setGazeOverride/clearGazeOverride,
 * setLookDownOverride, setMenuGazeOverride, setPersonPresentOverride, getAuditLog, getAuditCount,
 * getReadCount, getReadsWhilePaused, getFramesSent, getRecheckCount, getActiveShelves, getShelfIds.
 */
import { BlindersRackBuilder, ShelfInfo } from "./BlindersRackBuilder"
import { BlindersPersonController } from "./BlindersPersonController"
import { BlindersCalloutsUI } from "./BlindersCalloutsUI"
import { BlindersPausePillUI } from "./BlindersPausePillUI"
import { BlindersModeMenuUI } from "./BlindersModeMenuUI"
import { BlindersAuditLog } from "./BlindersAuditLog"
import { BlindersAudio } from "./BlindersAudio"
import { classifyPayload } from "./BlindersLabelFormats"
import { evaluateShelf } from "./BlindersRules"
import { ERP } from "./BlindersErpData"

@component
export class BlindersMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BlindersMain – shelf check + camera pause</span>')
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The world camera (operator's head)")
  cameraObject: SceneObject

  @input
  @hint("Rack A builder")
  rackA: BlindersRackBuilder

  @input
  @hint("Rack B builder")
  rackB: BlindersRackBuilder

  @input
  @hint("Stand-in person")
  person: BlindersPersonController

  @input
  @hint("Callouts view")
  callouts: BlindersCalloutsUI

  @input
  @hint("Camera paused pill view")
  pausePill: BlindersPausePillUI

  @input
  @hint("Mode menu view")
  modeMenu: BlindersModeMenuUI
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Mode at Lens start: 0 normal glasses, 1 problems only, 2 everything")
  @widget(new ComboBoxWidget([new ComboBoxItem("0 - Off", 0), new ComboBoxItem("1 - Problems only", 1), new ComboBoxItem("2 - Everything", 2)]))
  startMode: number = 1

  @input
  @hint("Labels further than this are not read (cm)")
  @widget(new SliderWidget(100, 500, 10))
  readRangeCm: number = 250

  @input
  @hint("Mode 2: shelves whose centre is within this angle of the view centre are read (deg)")
  @widget(new SliderWidget(5, 45, 1))
  mode2ViewConeDeg: number = 30

  @input
  @hint("A shelf's callouts fade this long after you stop looking at it (s)")
  @widget(new SliderWidget(1, 15, 0.5))
  fadeAfterSec: number = 5

  @input
  @hint("While paused, one test frame is taken this often (s)")
  @widget(new SliderWidget(1, 15, 0.5))
  recheckIntervalSec: number = 5

  @input
  @hint("Person counts as 'in view' inside this half-angle of the view centre (deg)")
  @widget(new SliderWidget(10, 50, 1))
  personDetectHalfAngleDeg: number = 30

  @input
  @hint("Head pitch below the horizon that counts as 'looking down' (deg)")
  @widget(new SliderWidget(20, 80, 1))
  lookDownPitchDeg: number = 60

  @input
  @hint("Seconds of looking down to open the mode menu")
  @widget(new SliderWidget(1, 8, 0.5))
  lookDownHoldSec: number = 2

  @input
  @hint("Gaze dwell needed to pick a menu item (s)")
  @widget(new SliderWidget(0.5, 4, 0.1))
  dwellSec: number = 1.5

  @input
  @hint("Menu closes after looking away from it this long (s)")
  @widget(new SliderWidget(1, 8, 0.5))
  menuLookAwaySec: number = 3

  @input
  @hint("Device id written on every audit-log line")
  deviceId: string = "SPECS-DEMO-01"

  @input
  @hint("Cue volume (mode select, camera pause)")
  @widget(new SliderWidget(0, 1, 0.05))
  sfxVolume: number = 0.6
  @ui.group_end

  private log: BlindersAuditLog = new BlindersAuditLog()
  private audio: BlindersAudio | null = null
  private shelves: ShelfInfo[] = []
  private mode = -1
  private paused = false
  private recheckTimer = 0
  private active: { [binId: string]: number } = {}
  private now = 0
  private ready = false

  // counters (tests)
  private readCount = 0
  private readsWhilePaused = 0
  private recheckCount = 0

  // look-down / menu
  private lookDownTimer = 0
  private lookDownArmed = true
  private dwellIndex = -1
  private dwellTime = 0
  private lookAwayTimer = 0
  private menuOpenedAt = 0
  // time to lift the eyes from the floor to the menu before look-away can close it
  private readonly menuOpenGraceSec = 5

  // test overrides
  private gazeOverride: string | null = null
  private lookDownOverride: boolean | null = null
  private menuGazeOverride: number | null = null
  private personOverride: boolean | null = null

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    if (!this.cameraObject || !this.rackA || !this.rackB || !this.person || !this.callouts || !this.pausePill || !this.modeMenu) {
      print("[BlindersMain] ERROR: required @input not wired (camera, racks, person, callouts, pausePill, modeMenu)")
      return
    }
    this.log = new BlindersAuditLog(this.deviceId)
    this.log.write({
      event: "SESSION_START",
      fields: { network: "none", storage: "none", formats: "BIN,SSCC-952", recheck_s: this.recheckIntervalSec },
      msg: "session start -> no network module, nothing stored, only shelf and box labels read",
    })
    this.shelves = this.rackA.getShelves().concat(this.rackB.getShelves())
    this.callouts.setViewer(this.cameraObject)
    this.audio = new BlindersAudio(this.sceneObject, this.sfxVolume)
    this.modeMenu.onModePicked.add((m: number) => {
      this.setMode(m)
      this.closeMenu()
    })
    this.ready = true
    this.setMode(this.startMode)
    // First-run hint: how to reach the mode menu (hidden as soon as the menu opens)
    this.modeMenu.showHint("LOOK DOWN " + this.lookDownHoldSec + " s TO CHANGE MODE", 9)
  }

  // ───────────────────────── public API / test hooks ─────────────────────────

  getMode(): number {
    return this.mode
  }

  /** Select a mode (0, 1, 2). Logs it. */
  setMode(m: number): void {
    if (!this.ready) return
    const mode = Math.max(0, Math.min(2, Math.round(m)))
    this.mode = mode
    this.callouts.hideAll()
    this.active = {}
    if (mode === 0) {
      if (this.paused) {
        this.paused = false
        this.pausePill.hide()
      }
      this.log.write({ event: "MODE_SET", fields: { mode: 0, camera: "off" }, msg: "mode 0 selected -> camera OFF, no reads" })
    } else {
      this.log.write({ event: "MODE_SET", fields: { mode, camera: "on" }, msg: "mode " + mode + " selected -> camera ON" })
    }
    this.modeMenu.setCurrentMode(mode)
    if (this.audio) this.audio.playModeSelect()
  }

  isPaused(): boolean {
    return this.paused
  }

  isCameraOn(): boolean {
    return this.mode > 0 && !this.paused
  }

  getVisibleCalloutTexts(): string[] {
    return this.callouts ? this.callouts.getVisibleCalloutTexts() : []
  }

  getVisibleGreenDotCount(): number {
    return this.callouts ? this.callouts.getVisibleGreenDotCount() : 0
  }

  isPausePillVisible(): boolean {
    return this.pausePill ? this.pausePill.isShowing() : false
  }

  getPausePillText(): string {
    return this.pausePill ? this.pausePill.getText() : ""
  }

  isMenuOpen(): boolean {
    return this.modeMenu ? this.modeMenu.isOpen() : false
  }

  openMenu(): void {
    if (!this.ready || this.modeMenu.isOpen()) return
    this.modeMenu.hideHint()
    this.modeMenu.open()
    this.lookDownArmed = false
    this.lookDownTimer = 0
    this.dwellIndex = -1
    this.dwellTime = 0
    this.lookAwayTimer = 0
    this.menuOpenedAt = this.now
  }

  closeMenu(): void {
    if (!this.ready) return
    if (this.dwellIndex >= 0) this.modeMenu.setDwellProgress(this.dwellIndex, 0)
    this.dwellIndex = -1
    this.dwellTime = 0
    this.lookAwayTimer = 0
    this.modeMenu.setHighlight(-1)
    this.modeMenu.close()
    this.lookDownTimer = 0
  }

  getMenuHighlight(): number {
    return this.dwellIndex
  }

  getMenuDwellProgress(): number {
    return this.dwellIndex >= 0 ? Math.min(1, this.dwellTime / this.dwellSec) : 0
  }

  getLookDownProgress(): number {
    return Math.min(1, this.lookDownTimer / this.lookDownHoldSec)
  }

  /** Force the gaze onto one shelf (bin id like "A-01-01"); "" = looking at nothing. */
  setGazeOverride(binId: string): void {
    this.gazeOverride = binId
  }

  clearGazeOverride(): void {
    this.gazeOverride = null
  }

  /** Force "looking down" true/false; null = use the real head pitch. */
  setLookDownOverride(v: boolean | null): void {
    this.lookDownOverride = v
  }

  /** Force the menu gaze onto item 0/1/2, -1 = on the panel but no item, -2 = away; null = real gaze. */
  setMenuGazeOverride(index: number | null): void {
    this.menuGazeOverride = index
  }

  /** Force the detector output; null = use the stand-in person. */
  setPersonPresentOverride(v: boolean | null): void {
    this.personOverride = v
  }

  getAuditLog(): string[] {
    return this.log.getLines()
  }

  getAuditCount(fragment: string): number {
    return this.log.count(fragment)
  }

  getReadCount(): number {
    return this.readCount
  }

  getReadsWhilePaused(): number {
    return this.readsWhilePaused
  }

  /** Frames handed to the code reader while a person was in view (stays 0: P2). */
  getFramesSent(): number {
    return this.readsWhilePaused
  }

  getRecheckCount(): number {
    return this.recheckCount
  }

  getActiveShelves(): string[] {
    return Object.keys(this.active)
  }

  getShelfIds(): string[] {
    return this.shelves.map((s) => s.binId)
  }



  // ───────────────────────── frame loop ─────────────────────────

  private onUpdate(): void {
    if (!this.ready) return
    const dt = getDeltaTime()
    this.now += dt
    const ct = this.cameraObject.getTransform()
    const camPos = ct.getWorldPosition()
    const viewDir = ct.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)).normalize()

    this.updateMenu(dt, camPos, viewDir)

    if (this.mode === 0) return // camera off: nothing read, nothing detected

    if (this.paused) {
      this.recheckTimer -= dt
      if (this.recheckTimer <= 0) this.recheck(camPos, viewDir)
      return // P2: the read path is not called while paused
    }

    if (this.personInView(camPos, viewDir)) {
      this.pauseCamera()
      return
    }

    if (!this.modeMenu.isOpen()) {
      for (const s of this.shelves) {
        if (this.isLookedAt(s, camPos, viewDir)) {
          if (this.active[s.binId] === undefined) this.readShelf(s)
          this.active[s.binId] = this.now
        }
      }
    }

    for (const binId of Object.keys(this.active)) {
      if (this.now - this.active[binId] > this.fadeAfterSec) {
        this.callouts.fadeOutGroup(binId)
        delete this.active[binId]
      }
    }
  }

  // ───────────────────────── reading ─────────────────────────

  private isLookedAt(s: ShelfInfo, camPos: vec3, viewDir: vec3): boolean {
    if (this.gazeOverride !== null) return s.binId === this.gazeOverride
    const rt = s.rackRoot.getTransform()
    const inv = rt.getInvertedWorldTransform()
    const o = inv.multiplyPoint(camPos)
    const d = inv.multiplyDirection(viewDir)
    if (o.z > 0 && d.z < -1e-4) {
      const t = -o.z / d.z
      const hx = o.x + d.x * t
      const hy = o.y + d.y * t
      if (hx >= s.zoneMin.x && hx <= s.zoneMax.x && hy >= s.zoneMin.y && hy <= s.zoneMax.y) {
        const hitWorld = rt.getWorldTransform().multiplyPoint(new vec3(hx, hy, 0))
        if (hitWorld.distance(camPos) <= this.readRangeCm) return true
      }
    }
    if (this.mode === 2) {
      const c = rt.getWorldTransform().multiplyPoint(new vec3((s.zoneMin.x + s.zoneMax.x) / 2, (s.zoneMin.y + s.zoneMax.y) / 2, 0))
      const toC = c.sub(camPos)
      const dist = toC.length
      if (dist <= this.readRangeCm && dist > 1) {
        const cos = toC.uniformScale(1 / dist).dot(viewDir)
        if (cos >= Math.cos((this.mode2ViewConeDeg * Math.PI) / 180)) return true
      }
    }
    return false
  }

  /** One read of a shelf: shelf label -> ERP query -> look for the expected box labels. */
  private readShelf(s: ShelfInfo): void {
    if (this.paused || this.mode === 0) {
      this.readsWhilePaused++ // must stay 0; guard only
      return
    }
    const shelfLabel = classifyPayload(s.payload)
    if (!shelfLabel || shelfLabel.kind !== "bin") return // P4: dropped, not logged
    const boxCodes: string[] = []
    const anchorByCode: { [code: string]: SceneObject } = {}
    for (const b of s.boxes) {
      for (const p of b.payloads) {
        const parsed = classifyPayload(p)
        if (!parsed || parsed.kind !== "box") continue // P4: vendor EAN etc. dropped in the same call
        boxCodes.push(parsed.code)
        anchorByCode[parsed.code] = b.labelObject
      }
    }
    this.readCount++
    const ev = evaluateShelf(ERP, shelfLabel.code, shelfLabel.bin, boxCodes, this.mode)
    for (const line of ev.logLines) this.log.write(line)
    if (ev.shelfCallout) {
      this.callouts.showCallout(s.binId, ev.shelfCallout.labelCode, s.labelObject, ev.shelfCallout.text, ev.shelfCallout.severity, ev.shelfCallout.greenDot)
    }
    for (const c of ev.boxCallouts) {
      const anchor = anchorByCode[c.labelCode]
      if (anchor) this.callouts.showCallout(s.binId, c.labelCode, anchor, c.text, c.severity, c.greenDot)
    }
  }

  // ───────────────────────── person / pause ─────────────────────────

  private personInView(camPos: vec3, viewDir: vec3): boolean {
    if (this.personOverride !== null) return this.personOverride
    return this.person.isInView(camPos, viewDir, this.personDetectHalfAngleDeg, 600)
  }

  private pauseCamera(): void {
    this.paused = true
    this.callouts.hideAll()
    this.active = {}
    this.pausePill.show()
    this.recheckTimer = this.recheckIntervalSec
    this.log.write({
      event: "CAMERA_PAUSED",
      fields: { reason: "person_detected", frames_sent: this.readsWhilePaused },
      msg: "person detected -> camera PAUSED, " + this.readsWhilePaused + " frames sent",
    })
    if (this.audio) this.audio.playCameraPause()
  }

  /** One test frame while paused. */
  private recheck(camPos: vec3, viewDir: vec3): void {
    this.recheckCount++
    if (this.personInView(camPos, viewDir)) {
      this.log.write({ event: "RECHECK", fields: { frames: 1, result: "person_present", camera: "paused" }, msg: "recheck: 1 frame -> person still present, stay paused" })
      this.recheckTimer = this.recheckIntervalSec
    } else {
      this.log.write({ event: "RECHECK", fields: { frames: 1, result: "clear", camera: "resumed" }, msg: "recheck: 1 frame -> clear, camera RESUMED" })
      this.paused = false
      this.pausePill.hide()
    }
  }

  // ───────────────────────── look down + menu ─────────────────────────

  private updateMenu(dt: number, camPos: vec3, viewDir: vec3): void {
    const pitchDownDeg = (Math.asin(Math.max(-1, Math.min(1, -viewDir.y))) * 180) / Math.PI
    const lookingDown = this.lookDownOverride !== null ? this.lookDownOverride : pitchDownDeg >= this.lookDownPitchDeg

    if (!this.modeMenu.isOpen()) {
      if (lookingDown && this.lookDownArmed) {
        this.lookDownTimer += dt
        if (this.lookDownTimer >= this.lookDownHoldSec) this.openMenu()
      } else if (!lookingDown) {
        this.lookDownTimer = 0
        this.lookDownArmed = true
      }
      this.modeMenu.setLookDownProgress(this.modeMenu.isOpen() ? 0 : this.getLookDownProgress(), camPos, viewDir)
      return
    }

    let index = -2
    let point: vec3 | null = null
    if (this.menuGazeOverride !== null) {
      index = this.menuGazeOverride
    } else {
      const pick = this.modeMenu.pickItem(camPos, viewDir)
      index = pick.index
      point = pick.point
    }
    this.modeMenu.setGazeCursor(point ? point : camPos.add(viewDir.uniformScale(100)))

    if (index >= 0) {
      this.lookAwayTimer = 0
      if (index !== this.dwellIndex) {
        if (this.dwellIndex >= 0) this.modeMenu.setDwellProgress(this.dwellIndex, 0)
        this.dwellIndex = index
        this.dwellTime = 0
        this.modeMenu.setHighlight(index)
      }
      this.dwellTime += dt
      this.modeMenu.setDwellProgress(index, this.dwellTime / this.dwellSec)
      if (this.dwellTime >= this.dwellSec) {
        const picked = index
        this.closeMenu()
        this.setMode(picked)
      }
      return
    }

    if (this.dwellIndex >= 0) {
      this.modeMenu.setDwellProgress(this.dwellIndex, 0)
      this.modeMenu.setHighlight(-1)
      this.dwellIndex = -1
      this.dwellTime = 0
    }
    if (index === -1 || this.now - this.menuOpenedAt < this.menuOpenGraceSec) {
      this.lookAwayTimer = 0
    } else {
      this.lookAwayTimer += dt
      if (this.lookAwayTimer >= this.menuLookAwaySec) this.closeMenu()
    }
  }
}
