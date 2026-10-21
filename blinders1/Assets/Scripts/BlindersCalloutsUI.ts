/**
 * BlindersCalloutsUI - passive view for the world-anchored callouts on shelf and box labels.
 * Owns: one light-coloured text callout per label (no plates: additive display), a few cm above
 *       and in front of the label it belongs to, plus the small green "matches ERP" dot (R4).
 *       Fading is presentation only: BlindersMain decides WHEN a shelf's callouts fade.
 * Public API (Main -> UI): showCallout, fadeOutGroup, hideAll; test reads: getVisibleCalloutTexts,
 *       getVisibleGreenDotCount, getVisibleCount.
 * Must not: decide problems, read the ERP, or keep state beyond what is on screen.
 *
 * Note on Hard Rule 3: callouts are text pinned to physical labels in the world, not a composed
 * panel, so there is no Frame/BackPlate or FlexLayout to place them; each sits at its label's
 * anchor (computed by the rack), not at hand-picked offsets.
 */
import { Severity } from "./BlindersRules"
import { createQuad } from "./BlindersQuad"

const CALLOUT_FONT = requireAsset("../Fonts/Chakra Petch.ttf") as Font

interface CalloutView {
  root: SceneObject
  text: Text
  dot: Text
  group: string
  logicalText: string
  greenDot: boolean
  alpha: number
  fading: boolean
  color: vec4
  leaderMat: Material | null
}

@component
export class BlindersCalloutsUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BlindersCalloutsUI – label callouts</span>')
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Shelf-label callout text size (Text.size). 140 gives capitals about 1.9 cm tall")
  @widget(new SliderWidget(60, 300, 5))
  textSize: number = 140

  @input
  @hint("Box-label callout text size (Text.size). 115 gives capitals about 1.6 cm tall")
  @widget(new SliderWidget(60, 300, 5))
  boxTextSize: number = 115

  @input
  @hint("Wrap width of shelf-label callouts in cm (3 lines max)")
  @widget(new SliderWidget(15, 100, 1))
  shelfWrapWidthCm: number = 72

  @input
  @hint("Wrap width of box-label callouts in cm (keeps neighbours apart)")
  @widget(new SliderWidget(15, 60, 1))
  boxWrapWidthCm: number = 34

  @input
  @hint("How far in front of the label the callout floats (cm)")
  @widget(new SliderWidget(0, 15, 0.5))
  standOffCm: number = 1.5

  @input
  @hint("Gap between the top of the label and the bottom of the callout (cm)")
  @widget(new SliderWidget(0, 10, 0.5))
  liftCm: number = 2.5

  @input
  @hint("Fade-out duration once a shelf is no longer looked at (s)")
  @widget(new SliderWidget(0.1, 3, 0.1))
  fadeDurationSec: number = 0.8

  @input
  @hint("Contrast aid. Dark renders transparent on the glasses, so this only helps the preview and video")
  @widget(new ComboBoxWidget([new ComboBoxItem("None", 0), new ComboBoxItem("Halo (outline + shadow)", 1), new ComboBoxItem("Backing (dark plate)", 2)]))
  contrastStyle: number = 2

  @input
  @hint("Opacity of the dark halo / backing")
  @widget(new SliderWidget(0, 1, 0.05))
  contrastOpacity: number = 0.7

  @input
  @hint("Unlit material for the leader line from label to callout (cloned per callout)")
  lineMaterial: Material

  @input("vec4", "{1,0.48,0.45,1}")
  @widget(new ColorWidget())
  @hint("Red: wrong shelf, expired, empty")
  redColor: vec4

  @input("vec4", "{1,0.8,0.32,1}")
  @widget(new ColorWidget())
  @hint("Amber: expiring soon, ERP action, count mismatch")
  amberColor: vec4

  @input("vec4", "{0.8,0.8,0.82,1}")
  @widget(new ColorWidget())
  @hint("Grey: unknown code ?")
  greyColor: vec4

  @input("vec4", "{0.95,0.97,1,1}")
  @widget(new ColorWidget())
  @hint("Info text (mode 2 details)")
  infoColor: vec4

  @input("vec4", "{0.4,1,0.55,1}")
  @widget(new ColorWidget())
  @hint("Green dot for labels that match the ERP")
  okDotColor: vec4
  @ui.group_end

  private views: { [labelCode: string]: CalloutView } = {}
  private viewer: SceneObject | null = null

  onAwake(): void {
    // World-unit Canvas so Text.size maps to cm the same way as the UIKit panels
    this.sceneObject.createComponent("Component.Canvas")
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  /** The operator's head: visible callouts turn to face it so they read square-on from any shelf height. */
  setViewer(camera: SceneObject): void {
    this.viewer = camera
  }

  /** Show (or refresh) the callout for one label, anchored at `anchor` (label's top-left corner). */
  showCallout(group: string, labelCode: string, anchor: SceneObject, text: string, severity: Severity, greenDot: boolean): void {
    let v = this.views[labelCode]
    if (!v) {
      v = this.create(labelCode)
      this.views[labelCode] = v
    }
    v.group = group
    v.logicalText = text
    v.greenDot = greenDot
    v.color = this.colorFor(severity)
    v.text.text = text
    const isShelf = labelCode.indexOf("BIN:") === 0
    const w = isShelf ? this.shelfWrapWidthCm : this.boxWrapWidthCm
    v.text.size = isShelf ? this.textSize : this.boxTextSize
    v.dot.size = v.text.size
    v.text.layoutRect = Rect.create(0, w, 0, 12)
    v.alpha = 1
    v.fading = false
    const at = anchor.getTransform()
    const rt = v.root.getTransform()
    const rot = at.getWorldRotation()
    rt.setWorldRotation(rot)
    // Label local +Y = up, local +Z = out of the label towards the operator
    const up = rot.multiplyVec3(new vec3(0, 1, 0))
    const out = rot.multiplyVec3(new vec3(0, 0, 1))
    rt.setWorldPosition(at.getWorldPosition().add(up.uniformScale(this.liftCm)).add(out.uniformScale(this.standOffCm)))
    this.faceViewer(v)
    v.dot.enabled = greenDot
    this.applyAlpha(v)
    v.root.enabled = true
  }

  /** Start fading every callout of a shelf group. */
  fadeOutGroup(group: string): void {
    for (const k in this.views) {
      const v = this.views[k]
      if (v.group === group && v.root.enabled) v.fading = true
    }
  }

  /** Hide everything immediately (person detected, mode change). */
  hideAll(): void {
    for (const k in this.views) {
      const v = this.views[k]
      v.root.enabled = false
      v.fading = false
      v.alpha = 0
    }
  }

  /** Logical texts of callouts currently on screen (fading ones included until fully gone). */
  getVisibleCalloutTexts(): string[] {
    const out: string[] = []
    for (const k in this.views) {
      const v = this.views[k]
      if (v.root.enabled && v.alpha > 0.01) out.push(v.logicalText)
    }
    return out
  }

  getVisibleGreenDotCount(): number {
    let n = 0
    for (const k in this.views) {
      const v = this.views[k]
      if (v.root.enabled && v.alpha > 0.01 && v.greenDot) n++
    }
    return n
  }

  getVisibleCount(group?: string): number {
    let n = 0
    for (const k in this.views) {
      const v = this.views[k]
      if (v.root.enabled && v.alpha > 0.01 && (!group || v.group === group)) n++
    }
    return n
  }

  private onUpdate(): void {
    const dt = getDeltaTime()
    for (const k in this.views) {
      const v = this.views[k]
      if (v.root.enabled) this.faceViewer(v)
      if (!v.fading || !v.root.enabled) continue
      v.alpha -= dt / Math.max(0.05, this.fadeDurationSec)
      if (v.alpha <= 0) {
        v.alpha = 0
        v.fading = false
        v.root.enabled = false
      } else {
        this.applyAlpha(v)
      }
    }
  }

  /** Turn the callout (pivot = bottom-left, on its label) to face the viewer, keeping world up. */
  private faceViewer(v: CalloutView): void {
    if (!this.viewer) return
    const rt = v.root.getTransform()
    const toEye = this.viewer.getTransform().getWorldPosition().sub(rt.getWorldPosition())
    if (toEye.length < 1) return
    const fwd = toEye.normalize()
    const right = vec3.up().cross(fwd)
    if (right.length < 0.01) return
    rt.setWorldRotation(quat.lookAt(fwd, fwd.cross(right.normalize())))
  }

  private colorFor(s: Severity): vec4 {
    switch (s) {
      case Severity.Red:
        return this.redColor
      case Severity.Amber:
        return this.amberColor
      case Severity.Grey:
        return this.greyColor
      default:
        return this.infoColor
    }
  }

  private applyAlpha(v: CalloutView): void {
    v.text.textFill.color = new vec4(v.color.x, v.color.y, v.color.z, v.color.w * v.alpha)
    v.dot.textFill.color = new vec4(this.okDotColor.x, this.okDotColor.y, this.okDotColor.z, this.okDotColor.w * v.alpha)
    if (v.leaderMat) v.leaderMat.mainPass.baseColor = new vec4(v.color.x, v.color.y, v.color.z, 0.9 * v.alpha)
    const dark = new vec4(0.02, 0.04, 0.06, this.contrastOpacity * v.alpha)
    for (const t of [v.text, v.dot]) {
      if (this.contrastStyle === 1) {
        t.outlineSettings.fill.color = dark
        t.dropshadowSettings.fill.color = new vec4(dark.x, dark.y, dark.z, dark.w * 0.6)
      } else if (this.contrastStyle === 2 && t === v.text) {
        t.backgroundSettings.fill.color = dark
      }
    }
  }

  private create(labelCode: string): CalloutView {
    const root = global.scene.createSceneObject("Callout " + labelCode)
    root.setParent(this.sceneObject)

    const textSo = global.scene.createSceneObject("Text")
    textSo.setParent(root)
    const t = textSo.createComponent("Component.Text") as Text
    // Overlay: drawn over the stand-in racks, as it would be over the real world (no occlusion)
    t.depthTest = false
    t.setRenderOrder(100) // after the racks (lower in the hierarchy), so boxes never cut into a callout
    t.size = this.textSize
    t.horizontalAlignment = HorizontalAlignment.Left
    t.verticalAlignment = VerticalAlignment.Bottom
    t.horizontalOverflow = HorizontalOverflow.Wrap
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(0, this.boxWrapWidthCm, 0, 12)
    t.font = CALLOUT_FONT
    ;(t as Text & { weight?: number }).weight = 600

    // Leader: a thin line from the label's top-left corner up to the callout plate, with a
    // small square terminal on the label (reads as "this text belongs to that label")
    let leaderMat: Material | null = null
    if (this.lineMaterial) {
      leaderMat = this.lineMaterial.clone()
      leaderMat.mainPass.depthTest = false
      leaderMat.mainPass.depthWrite = false
      const line = createQuad(root, "Leader", -0.72, -this.liftCm, -0.48, -0.6, leaderMat)
      line.setRenderOrder(99)
      const foot = createQuad(root, "LeaderFoot", -0.95, -this.liftCm - 0.25, -0.25, -this.liftCm + 0.45, leaderMat)
      foot.setRenderOrder(99)
    }

    const dotSo = global.scene.createSceneObject("GreenDot")
    dotSo.setParent(root)
    dotSo.getTransform().setLocalPosition(new vec3(-3.2, -2.0, 0))
    const d = dotSo.createComponent("Component.Text") as Text
    d.depthTest = false
    d.setRenderOrder(101)
    d.size = this.textSize
    d.text = "●"
    d.horizontalAlignment = HorizontalAlignment.Center
    d.verticalAlignment = VerticalAlignment.Bottom
    d.horizontalOverflow = HorizontalOverflow.Overflow
    d.verticalOverflow = VerticalOverflow.Overflow
    d.layoutRect = Rect.create(-2, 2, 0, 4)

    this.applyContrast(t, true)
    this.applyContrast(d, false)
    return { root, text: t, dot: d, group: "", logicalText: "", greenDot: false, alpha: 0, fading: false, color: this.infoColor, leaderMat }
  }

  /**
   * Dark halo or backing behind the light text. On the additive display dark is transparent, so
   * this costs nothing on the glasses; it keeps callouts legible in the preview and the video.
   */
  private applyContrast(t: Text, isMain: boolean): void {
    t.outlineSettings.enabled = this.contrastStyle === 1
    t.dropshadowSettings.enabled = this.contrastStyle === 1
    t.backgroundSettings.enabled = this.contrastStyle === 2 && isMain
    if (this.contrastStyle === 1) {
      t.outlineSettings.size = 0.35
      t.dropshadowSettings.offset = new vec2(0.12, -0.12)
    } else if (this.contrastStyle === 2 && isMain) {
      t.backgroundSettings.margins = Rect.create(1.0, 1.0, 0.6, 0.6)
      t.backgroundSettings.cornerRadius = 0.25 // squared-off industrial plate
    }
  }
}
