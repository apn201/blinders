/**
 * BlindersModeMenuUI - the 0 / 1 / 2 mode menu.
 * Owns: a UIKit BackPlate with three big UIKit Buttons (icon + digit + caption), one dwell-timer
 *       ring per item, a gaze cursor dot, and gentle head-follow while open.
 * Public API (Main -> UI): open(), close(), isOpen(), pickItem(origin, dir), setHighlight(i),
 *       setDwellProgress(i, p), setGazeCursor(pos | null), setCurrentMode(m), getItemWorldCenter(i).
 * Events (UI -> Main): onModePicked(mode) when an item is pinched (mouse click in preview).
 * Must not: change the mode itself or run the dwell timer (BlindersMain owns both).
 */
import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import { FlexAlign, FlexDirection, FlexJustify } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event"
import { BlindersRingMesh } from "./BlindersRingMesh"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material
const ICON_MODE0: Texture = requireAsset("../Icons/visibility_off.png") as Texture
const UI_FONT = requireAsset("../Fonts/Chakra Petch.ttf") as Font
const ICON_MODE1: Texture = requireAsset("../Icons/report.png") as Texture
const ICON_MODE2: Texture = requireAsset("../Icons/visibility.png") as Texture

interface MenuItem {
  root: SceneObject
  button: Button
  caption: Text
  digit: Text
  ringTrack: BlindersRingMesh
  ringFill: BlindersRingMesh
}

@component
export class BlindersModeMenuUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BlindersModeMenuUI – 0 / 1 / 2 mode menu</span>')
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The world camera (head) the menu appears in front of")
  cameraObject: SceneObject

  @input
  @hint("Unlit material used for the dwell rings and gaze cursor")
  ringMaterial: Material
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Captions under the digits 0, 1, 2")
  captions: string[] = ["Off", "Problems", "Everything"]

  @input
  @hint("Size of each item (cm, width x height)")
  itemSizeCm: vec2 = new vec2(13, 14)

  @input
  @hint("Distance ahead of the eyes (cm)")
  @widget(new SliderWidget(50, 200, 5))
  distanceCm: number = 100

  @input
  @hint("How far below eye level (cm)")
  @widget(new SliderWidget(0, 50, 1))
  belowEyeCm: number = 12

  @input
  @hint("Follow smoothing while open (higher = snappier)")
  @widget(new SliderWidget(0.5, 10, 0.5))
  followRate: number = 2

  @input("vec4", "{0.45,1,0.6,1}")
  @widget(new ColorWidget())
  @hint("Colour of the current mode's caption and the dwell fill")
  accentColor: vec4

  @input("vec4", "{0.55,0.9,1,1}")
  @widget(new ColorWidget())
  @hint("Colour of the first-run hint (cyan accent)")
  hintColor: vec4
  @ui.group_end

  private items: MenuItem[] = []
  private panel: SceneObject
  private plate: BackPlate
  private cursor: BlindersRingMesh
  private lookDownRoot: SceneObject
  private lookDownTrack: BlindersRingMesh
  private lookDownFill: BlindersRingMesh
  private hintRoot: SceneObject
  private hintText: Text
  private hintAlpha = 0
  private hintLeft = 0
  private _isOpen = false
  private started = false
  private currentMode = -1
  private highlighted = -1
  private _onModePicked = new Event<number>()

  get onModePicked(): PublicApi<number> {
    return this._onModePicked.publicApi()
  }

  onAwake(): void {
    this.build()
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  isOpen(): boolean {
    return this._isOpen
  }

  open(): void {
    this._isOpen = true
    this.snapToHead()
    this.setHighlight(-1)
    for (let i = 0; i < this.items.length; i++) this.setDwellProgress(i, 0)
    if (this.started) this.panel.enabled = true
  }

  close(): void {
    this._isOpen = false
    this.setGazeCursor(null)
    if (this.started) this.panel.enabled = false
  }

  setCurrentMode(mode: number): void {
    this.currentMode = mode
    for (let i = 0; i < this.items.length; i++) {
      const c = i === mode ? this.accentColor : new vec4(1, 1, 1, 0.75)
      this.items[i].caption.textFill.color = c
    }
  }

  setHighlight(index: number): void {
    this.highlighted = index
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].ringTrack.sceneObject.enabled = i === index
      const s = i === index ? 1.06 : 1.0
      this.items[i].root.getChild(1).getTransform().setLocalScale(new vec3(s, s, 1))
    }
  }

  setDwellProgress(index: number, p: number): void {
    if (index < 0 || index >= this.items.length) return
    const it = this.items[index]
    it.ringFill.setProgress(p)
    it.ringFill.sceneObject.enabled = p > 0
  }

  setGazeCursor(worldPos: vec3 | null): void {
    if (!this.cursor) return
    if (!worldPos || !this._isOpen) {
      this.cursor.sceneObject.enabled = false
      return
    }
    this.cursor.sceneObject.enabled = true
    const t = this.cursor.sceneObject.getTransform()
    t.setWorldPosition(worldPos)
    t.setWorldRotation(this.sceneObject.getTransform().getWorldRotation())
  }

  /**
   * Look-down timer: a small ring that fills where the operator is looking (60 cm ahead) while
   * they hold their head down, so the 4 s gesture is visible. p <= 0 hides it.
   */
  setLookDownProgress(p: number, camPos: vec3, viewDir: vec3): void {
    if (!this.lookDownRoot) return
    const show = p > 0.04 && !this._isOpen
    if (this.lookDownRoot.enabled !== show) this.lookDownRoot.enabled = show
    if (!show) return
    const t = this.lookDownRoot.getTransform()
    t.setWorldPosition(camPos.add(viewDir.uniformScale(60)))
    const right = vec3.up().cross(viewDir.uniformScale(-1))
    const up = right.length > 0.01 ? viewDir.uniformScale(-1).cross(right.normalize()) : vec3.forward()
    t.setWorldRotation(quat.lookAt(viewDir.uniformScale(-1), up))
    this.lookDownFill.setProgress(p)
  }

  /** First-run hint, a little below the centre of view; fades out after `sec` or when hidden. */
  showHint(text: string, sec: number): void {
    if (!this.hintText) return
    this.hintText.text = text
    this.hintLeft = sec
  }

  hideHint(): void {
    this.hintLeft = 0
  }

  isHintShowing(): boolean {
    return this.hintAlpha > 0.01
  }

  private updateHint(): void {
    if (!this.hintRoot || !this.cameraObject) return
    const dt = getDeltaTime()
    this.hintLeft = Math.max(0, this.hintLeft - dt)
    const target = this.hintLeft > 0 && !this._isOpen ? 1 : 0
    this.hintAlpha += Math.sign(target - this.hintAlpha) * Math.min(Math.abs(target - this.hintAlpha), dt / 0.4)
    const show = this.hintAlpha > 0.01
    if (this.hintRoot.enabled !== show) this.hintRoot.enabled = show
    if (!show) return
    const ct = this.cameraObject.getTransform()
    const camRot = ct.getWorldRotation()
    const fwd = camRot.multiplyVec3(new vec3(0, 0, -1))
    const up = camRot.multiplyVec3(new vec3(0, 1, 0))
    const t = this.hintRoot.getTransform()
    t.setWorldPosition(ct.getWorldPosition().add(fwd.uniformScale(100)).add(up.uniformScale(-6)))
    t.setWorldRotation(quat.lookAt(fwd.uniformScale(-1), up))
    const c = this.hintColor
    this.hintText.textFill.color = new vec4(c.x, c.y, c.z, c.w * this.hintAlpha)
    this.hintText.backgroundSettings.fill.color = new vec4(0.02, 0.04, 0.06, 0.7 * this.hintAlpha)
  }

  getItemWorldCenter(index: number): vec3 {
    return this.items[index].root.getTransform().getWorldPosition()
  }

  /**
   * Gaze ray vs menu: returns the item index hit, -1 if the ray hits the panel but no item,
   * -2 if it misses the menu entirely. Also returns the hit point (for the cursor).
   */
  pickItem(origin: vec3, dir: vec3): { index: number; point: vec3 | null } {
    if (!this._isOpen) return { index: -2, point: null }
    const t = this.sceneObject.getTransform()
    const rot = t.getWorldRotation()
    const n = rot.multiplyVec3(new vec3(0, 0, 1))
    const p0 = t.getWorldPosition()
    const denom = dir.dot(n)
    if (Math.abs(denom) < 1e-4) return { index: -2, point: null }
    const s = p0.sub(origin).dot(n) / denom
    if (s <= 0) return { index: -2, point: null }
    const hit = origin.add(dir.uniformScale(s))
    const right = rot.multiplyVec3(new vec3(1, 0, 0))
    const up = rot.multiplyVec3(new vec3(0, 1, 0))
    for (let i = 0; i < this.items.length; i++) {
      const c = this.getItemWorldCenter(i)
      const d = hit.sub(c)
      if (Math.abs(d.dot(right)) <= this.itemSizeCm.x / 2 && Math.abs(d.dot(up)) <= this.itemSizeCm.y / 2) {
        return { index: i, point: hit }
      }
    }
    const d0 = hit.sub(p0)
    const halfW = (this.itemSizeCm.x * 3 + 6) / 2
    const halfH = this.itemSizeCm.y / 2 + 2
    if (Math.abs(d0.dot(right)) <= halfW && Math.abs(d0.dot(up)) <= halfH) return { index: -1, point: hit }
    return { index: -2, point: hit }
  }

  private targetPose(): { pos: vec3; rot: quat } | null {
    if (!this.cameraObject) return null
    const ct = this.cameraObject.getTransform()
    const camPos = ct.getWorldPosition()
    const fwd = ct.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    let flat = new vec3(fwd.x, 0, fwd.z)
    flat = flat.length < 0.01 ? new vec3(0, 0, -1) : flat.normalize()
    const pos = camPos.add(flat.uniformScale(this.distanceCm)).add(new vec3(0, -this.belowEyeCm, 0))
    const toCam = camPos.sub(pos).normalize()
    return { pos, rot: quat.lookAt(toCam, vec3.up()) }
  }

  private snapToHead(): void {
    const p = this.targetPose()
    if (!p) return
    this.sceneObject.getTransform().setWorldPosition(p.pos)
    this.sceneObject.getTransform().setWorldRotation(p.rot)
  }

  private onUpdate(): void {
    if (!this.started) {
      this.started = true
      this.panel.enabled = this._isOpen
    }
    this.updateHint()
    if (!this._isOpen) return
    const p = this.targetPose()
    if (!p) return
    const t = this.sceneObject.getTransform()
    const k = Math.min(1, getDeltaTime() * this.followRate)
    t.setWorldPosition(vec3.lerp(t.getWorldPosition(), p.pos, k))
    t.setWorldRotation(quat.slerp(t.getWorldRotation(), p.rot, k))
  }

  private build(): void {
    this.panel = global.scene.createSceneObject("MenuPanel")
    this.panel.setParent(this.sceneObject)
    this.panel.createComponent("Component.Canvas")
    this.plate = this.panel.createComponent(BackPlate.getTypeName()) as BackPlate

    const content = global.scene.createSceneObject("Content")
    content.setParent(this.panel)
    content.getTransform().setLocalPosition(new vec3(0, 0, 0.6))
    const row = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    row.direction = FlexDirection.Row
    row.alignItems = FlexAlign.Center
    row.justifyContent = FlexJustify.Center
    row.columnGap = 1.5
    row.paddingTop = 1.5
    row.paddingBottom = 1.5
    row.paddingLeft = 1.5
    row.paddingRight = 1.5
    row.width = -1
    row.height = -1
    row.onLayoutComplete.add((r) => {
      this.plate.size = new vec2(r.containerWidth, r.containerHeight)
    })

    const icons = [ICON_MODE0, ICON_MODE1, ICON_MODE2]
    const flexItems: FlexItem[] = []
    for (let i = 0; i < 3; i++) {
      const it = this.buildItem(content, i, icons[i], this.captions[i] || "")
      flexItems.push(it.root.getComponent(FlexItem.getTypeName()) as FlexItem)
      this.items.push(it)
    }
    // items carry FlexItem and exist before OnStart: FlexLayout auto-discovers them

    if (this.ringMaterial) {
      this.cursor = new BlindersRingMesh(this.sceneObject, "GazeCursor", 0, 0.45, 20, this.ringMaterial, new vec4(1, 1, 1, 0.9))
      this.cursor.sceneObject.enabled = false

      // Look-down timer ring (not part of the panel: it shows while the menu is closed)
      this.lookDownRoot = global.scene.createSceneObject("LookDownTimer")
      this.lookDownRoot.setParent(this.sceneObject.getParent() || this.sceneObject)
      this.lookDownTrack = new BlindersRingMesh(this.lookDownRoot, "Track", 1.6, 1.9, 48, this.ringMaterial, new vec4(1, 1, 1, 0.3))
      this.lookDownFill = new BlindersRingMesh(this.lookDownRoot, "Fill", 1.6, 1.9, 48, this.ringMaterial, this.accentColor)
      this.lookDownFill.sceneObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
      this.lookDownFill.setProgress(0)
      this.lookDownRoot.enabled = false
    }

    // First-run hint (world-unit Canvas so Text.size maps to cm like the other panels)
    this.hintRoot = global.scene.createSceneObject("StartHint")
    this.hintRoot.setParent(this.sceneObject.getParent() || this.sceneObject)
    this.hintRoot.createComponent("Component.Canvas")
    const hs = global.scene.createSceneObject("Text")
    hs.setParent(this.hintRoot)
    const ht = hs.createComponent("Component.Text") as Text
    ht.font = UI_FONT
    ht.size = 70
    ht.depthTest = false
    ht.setRenderOrder(110)
    ht.horizontalAlignment = HorizontalAlignment.Center
    ht.verticalAlignment = VerticalAlignment.Center
    ht.horizontalOverflow = HorizontalOverflow.Overflow
    ht.verticalOverflow = VerticalOverflow.Overflow
    ht.layoutRect = Rect.create(-20, 20, -1.5, 1.5)
    ht.backgroundSettings.enabled = true
    ht.backgroundSettings.margins = Rect.create(1.2, 1.2, 0.7, 0.7)
    ht.backgroundSettings.cornerRadius = 0.25
    this.hintText = ht
    this.hintRoot.enabled = false
    this.setCurrentMode(this.currentMode)
  }

  private buildItem(parent: SceneObject, index: number, icon: Texture, caption: string): MenuItem {
    const W = this.itemSizeCm.x
    const H = this.itemSizeCm.y
    const root = global.scene.createSceneObject("Item " + index)
    root.setParent(parent)
    const item = root.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideWidth = W
    item.overrideHeight = H

    // child 0: the UIKit Button face (pinch / mouse click)
    const btnSo = global.scene.createSceneObject("Button")
    btnSo.setParent(root)
    const btn = btnSo.createComponent(Button.getTypeName()) as Button
    btn.size = new vec3(W, H, 1)
    btn.onInitialized.add(() => {
      btn.size = new vec3(W, H, 1)
    })
    btn.onTriggerUp.add(() => this._onModePicked.invoke(index))

    // child 1: the face content (icon + rings, digit, caption) in a FlexLayout column,
    // lifted in front of the button face
    const face = global.scene.createSceneObject("Face")
    face.setParent(root)
    face.getTransform().setLocalPosition(new vec3(0, 0, 0.8))
    const col = face.createComponent(FlexLayout.getTypeName()) as FlexLayout
    col.direction = FlexDirection.Column
    col.justifyContent = FlexJustify.Center
    col.alignItems = FlexAlign.Center
    col.rowGap = 0.4
    col.width = W
    col.height = H

    // icon cell with dwell rings
    const iconCell = global.scene.createSceneObject("IconCell")
    iconCell.setParent(face)
    const iconItem = iconCell.createComponent(FlexItem.getTypeName()) as FlexItem
    iconItem.overrideWidth = 6.2
    iconItem.overrideHeight = 6.2
    const img = global.scene.createSceneObject("Icon")
    img.setParent(iconCell)
    const image = img.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = icon
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    image.clearMaterials()
    image.addMaterial(mat)
    img.getTransform().setLocalScale(new vec3(3.2, 3.2, 1))

    let ringTrack: BlindersRingMesh
    let ringFill: BlindersRingMesh
    if (this.ringMaterial) {
      ringTrack = new BlindersRingMesh(iconCell, "RingTrack", 2.5, 2.9, 48, this.ringMaterial, new vec4(1, 1, 1, 0.35))
      ringTrack.sceneObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
      ringTrack.sceneObject.enabled = false
      ringFill = new BlindersRingMesh(iconCell, "RingFill", 2.5, 2.9, 48, this.ringMaterial, this.accentColor)
      ringFill.sceneObject.getTransform().setLocalPosition(new vec3(0, 0, 0.1))
      ringFill.setProgress(0)
      ringFill.sceneObject.enabled = false
    }

    const digit = this.text(face, "Digit", "" + index, 100, W - 1, 3.4)
    const cap = this.text(face, "Caption", caption, 40, W - 0.5, 1.6)
    // FlexLayout auto-discovers the FlexItem children on start
    return { root, button: btn, caption: cap, digit, ringTrack, ringFill }
  }

  /** Raw Text placed by the parent FlexLayout column (FlexItem with explicit size). */
  private text(parent: SceneObject, name: string, s: string, size: number, widthCm: number, heightCm: number): Text {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    const t = so.createComponent("Component.Text") as Text
    t.text = s
    t.font = UI_FONT
    t.depthTest = true
    t.size = size
    ;(t as Text & { weight?: number }).weight = 700
    t.textFill.color = new vec4(1, 1, 1, 1)
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -heightCm / 2, heightCm / 2)
    const fi = so.createComponent(FlexItem.getTypeName()) as FlexItem
    fi.overrideWidth = widthCm
    fi.overrideHeight = heightCm
    return t
  }
}
