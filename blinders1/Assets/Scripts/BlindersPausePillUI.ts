/**
 * BlindersPausePillUI - the "PERSON DETECTED · CAMERA PAUSED" pill.
 * Owns: a small UIKit BackPlate pill (icon + text) about 1 m ahead, a little below eye level,
 *       gently following the head while shown. The only head-locked-ish element besides the menu.
 * Public API (Main -> UI): show(), hide(), isShowing(), getText().
 * Must not: decide when to pause (BlindersMain owns the pause state).
 */
import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import { FlexAlign, FlexDirection, FlexJustify } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material
const UI_FONT = requireAsset("../Fonts/Chakra Petch.ttf") as Font
const ICON_PAUSED: Texture = requireAsset("../Icons/videocam_off.png") as Texture

@component
export class BlindersPausePillUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BlindersPausePillUI – camera paused pill</span>')
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The world camera (head) the pill follows")
  cameraObject: SceneObject
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Pill text")
  pillText: string = "PERSON DETECTED · CAMERA PAUSED"

  @input
  @hint("Distance ahead of the eyes (cm)")
  @widget(new SliderWidget(50, 200, 5))
  distanceCm: number = 100

  @input
  @hint("How far below the centre of view (cm, at the pill's distance)")
  @widget(new SliderWidget(0, 50, 1))
  belowEyeCm: number = 14

  @input
  @hint("Follow smoothing (higher = snappier)")
  @widget(new SliderWidget(0.5, 10, 0.5))
  followRate: number = 3

  @input("vec4", "{0.85,0.87,0.9,1}")
  @widget(new ColorWidget())
  @hint("Text and icon colour (light grey)")
  textColor: vec4
  @ui.group_end

  private pill: SceneObject
  private label: Text
  private wantVisible = false
  private started = false

  onAwake(): void {
    this.buildPill()
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  show(): void {
    this.wantVisible = true
    this.snapToHead()
    if (this.started) this.pill.enabled = true
  }

  hide(): void {
    this.wantVisible = false
    if (this.started) this.pill.enabled = false
  }

  isShowing(): boolean {
    return this.wantVisible
  }

  getText(): string {
    return this.pillText
  }

  private targetPose(): { pos: vec3; rot: quat } | null {
    if (!this.cameraObject) return null
    const ct = this.cameraObject.getTransform()
    const camPos = ct.getWorldPosition()
    // Follow the gaze (not just the yaw): the operator is usually looking down at a shelf
    // when the person walks in, and the pill must land in view, just below the centre.
    const camRot = ct.getWorldRotation()
    const fwd = camRot.multiplyVec3(new vec3(0, 0, -1)).normalize()
    const up = camRot.multiplyVec3(new vec3(0, 1, 0)).normalize()
    const pos = camPos.add(fwd.uniformScale(this.distanceCm)).add(up.uniformScale(-this.belowEyeCm))
    const rot = quat.lookAt(camPos.sub(pos).normalize(), up)
    return { pos, rot }
  }

  private snapToHead(): void {
    const p = this.targetPose()
    if (!p) return
    this.sceneObject.getTransform().setWorldPosition(p.pos)
    this.sceneObject.getTransform().setWorldRotation(p.rot)
  }

  private onUpdate(): void {
    if (!this.started) {
      // First frame after OnStart: UIKit components have initialised; apply requested visibility
      this.started = true
      this.pill.enabled = this.wantVisible
    }
    if (!this.wantVisible) return
    const p = this.targetPose()
    if (!p) return
    const t = this.sceneObject.getTransform()
    const k = Math.min(1, getDeltaTime() * this.followRate)
    t.setWorldPosition(vec3.lerp(t.getWorldPosition(), p.pos, k))
    t.setWorldRotation(quat.slerp(t.getWorldRotation(), p.rot, k))
  }

  private buildPill(): void {
    this.pill = global.scene.createSceneObject("Pill")
    this.pill.setParent(this.sceneObject)
    this.pill.createComponent("Component.Canvas")
    const plate = this.pill.createComponent(BackPlate.getTypeName()) as BackPlate

    const content = global.scene.createSceneObject("Content")
    content.setParent(this.pill)
    content.getTransform().setLocalPosition(new vec3(0, 0, 0.6))
    const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    flex.direction = FlexDirection.Row
    flex.alignItems = FlexAlign.Center
    flex.justifyContent = FlexJustify.Start
    flex.columnGap = 0.6
    flex.paddingTop = 0.5
    flex.paddingBottom = 0.5
    flex.paddingLeft = 1.0
    flex.paddingRight = 1.2
    flex.width = -1
    flex.height = -1
    flex.onLayoutComplete.add((r) => {
      plate.size = new vec2(r.containerWidth, r.containerHeight)
    })

    // Icon
    const iconSo = global.scene.createSceneObject("Icon")
    iconSo.setParent(content)
    const img = iconSo.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = ICON_PAUSED
    mat.mainPass.baseColor = this.textColor
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    iconSo.getTransform().setLocalScale(new vec3(1.8, 1.8, 1))
    const iconItem = iconSo.createComponent(FlexItem.getTypeName()) as FlexItem

    // Text (row child: explicit rect sized for the string)
    const textSo = global.scene.createSceneObject("Text")
    textSo.setParent(content)
    const t = textSo.createComponent("Component.Text") as Text
    t.text = this.pillText
    t.font = UI_FONT
    t.depthTest = true
    t.size = 36
    ;(t as Text & { weight?: number }).weight = 700
    t.textFill.color = this.textColor
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    const w = 17
    t.layoutRect = Rect.create(-w / 2, w / 2, -1, 1)
    const textItem = textSo.createComponent(FlexItem.getTypeName()) as FlexItem
    textItem.overrideWidth = w
    textItem.overrideHeight = 2
    this.label = t

    // children carry FlexItem and exist before OnStart: FlexLayout auto-discovers them
  }
}
