/**
 * BlindersPersonController - the stand-in "person" (preview substitute for real person detection).
 * Owns: a simple hi-vis figure built from cubes/spheres under its authored root, walking a loop
 *       between the operator and the racks (walk in, stand ~8 s in front, walk out, off-stage).
 *       Exposes isInView() = the one boolean a real detector would output (SPEC P5).
 * @inputs: meshes + lit material, loop timing, path.
 * Must not: track, identify, or record anything; it only answers "in view, yes/no".
 *
 * Path is in the authored root's local space: walks along X at local Z = 0. Place the root
 * between the operator and the racks (default world z = -90).
 */

@component
export class BlindersPersonController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BlindersPersonController – stand-in person loop</span>')
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Cube mesh for torso, limbs (normalised at runtime)")
  boxMesh: RenderMesh

  @input
  @hint("Sphere mesh for the head (normalised at runtime)")
  sphereMesh: RenderMesh

  @input
  @hint("Lit material cloned and tinted for the figure")
  litMaterial: Material
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Turn the walking person on/off")
  walkEnabled: boolean = true

  @input
  @hint("Seconds after Lens start before the first walk-in")
  @widget(new SliderWidget(0, 30, 0.5))
  startDelaySec: number = 12

  @input
  @hint("Full loop length (walk in + stand + walk out + off-stage), seconds. 36 = about 20 s off stage between visits")
  @widget(new SliderWidget(10, 60, 1))
  loopSec: number = 36

  @input
  @hint("Seconds standing in front of the racks")
  @widget(new SliderWidget(2, 20, 0.5))
  standSec: number = 8

  @input
  @hint("Seconds to walk in (and out)")
  @widget(new SliderWidget(1, 8, 0.5))
  walkSec: number = 4

  @input
  @hint("Start / end of the path, cm left and right of the centre (local X)")
  @widget(new SliderWidget(100, 500, 10))
  pathHalfLengthCm: number = 260
  @ui.group_end

  private figure: SceneObject
  private legL: SceneObject
  private legR: SceneObject
  private armL: SceneObject
  private armR: SceneObject
  private chest: SceneObject
  private elapsed = 0
  /** Test hook: when >= 0, the loop time is forced to this value. */
  private forcedLoopTime = -1

  onAwake(): void {
    this.buildFigure()
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  /** Seconds into the current loop, or -1 before the first walk-in. */
  getLoopTime(): number {
    if (this.forcedLoopTime >= 0) return this.forcedLoopTime
    if (!this.walkEnabled || this.elapsed < this.startDelaySec) return -1
    return (this.elapsed - this.startDelaySec) % this.loopSec
  }

  /** Test hook: force the loop clock (seconds into loop), or pass -1 to release. */
  setLoopTime(t: number): void {
    this.forcedLoopTime = t
    this.applyPose()
  }

  /** Test hook / demo: restart the clock so the next walk-in starts after `delaySec`. */
  restartLoop(delaySec: number): void {
    this.forcedLoopTime = -1
    this.elapsed = this.startDelaySec - delaySec
    this.applyPose()
  }

  isVisibleInScene(): boolean {
    return this.figure ? this.figure.enabled : false
  }

  /** Chest position (world), used for the "in view" decision. */
  getChestWorldPosition(): vec3 {
    return this.chest.getTransform().getWorldPosition()
  }

  /**
   * The single detector output (SPEC P5): is any part of the figure in view?
   * Checks chest, head and feet against a view cone.
   */
  isInView(camPos: vec3, viewDir: vec3, halfAngleDeg: number, maxDistCm: number): boolean {
    if (!this.figure || !this.figure.enabled) return false
    const cosLimit = Math.cos((halfAngleDeg * Math.PI) / 180)
    const chest = this.getChestWorldPosition()
    const pts = [chest, chest.add(new vec3(0, 40, 0)), chest.add(new vec3(0, -100, 0))]
    for (const p of pts) {
      const d = p.sub(camPos)
      const len = d.length
      if (len < 1 || len > maxDistCm) continue
      if (d.uniformScale(1 / len).dot(viewDir) >= cosLimit) return true
    }
    return false
  }

  private onUpdate(): void {
    this.elapsed += getDeltaTime()
    this.applyPose()
  }

  private applyPose(): void {
    if (!this.figure) return
    const t = this.getLoopTime()
    const L = this.pathHalfLengthCm
    let x = 0
    let visible = true
    let walking = false
    let dir = 1
    if (t < 0) {
      visible = false
    } else if (t < this.walkSec) {
      x = -L + (L * t) / this.walkSec
      walking = true
    } else if (t < this.walkSec + this.standSec) {
      x = 0
    } else if (t < 2 * this.walkSec + this.standSec) {
      x = (L * (t - this.walkSec - this.standSec)) / this.walkSec
      walking = true
    } else {
      visible = false
    }
    if (this.figure.enabled !== visible) this.figure.enabled = visible
    if (!visible) return
    const ft = this.figure.getTransform()
    ft.setLocalPosition(new vec3(x, 0, 0))
    // Face the walking direction while walking (+X), face the operator (+Z) while standing
    const yaw = walking ? Math.PI / 2 * dir : 0
    ft.setLocalRotation(quat.angleAxis(yaw, vec3.up()))
    const swing = walking ? Math.sin(t * 7) * 0.5 : 0
    this.legL.getTransform().setLocalRotation(quat.angleAxis(swing, vec3.right()))
    this.legR.getTransform().setLocalRotation(quat.angleAxis(-swing, vec3.right()))
    this.armL.getTransform().setLocalRotation(quat.angleAxis(-swing * 0.8, vec3.right()))
    this.armR.getTransform().setLocalRotation(quat.angleAxis(swing * 0.8, vec3.right()))
  }

  private buildFigure(): void {
    if (!this.boxMesh || !this.sphereMesh || !this.litMaterial) {
      print("[BlindersPersonController] ERROR: meshes / material not wired")
      return
    }
    const vest = this.tint(new vec3(1.0, 0.55, 0.1))
    const shirt = this.tint(new vec3(0.55, 0.7, 0.95))
    const trousers = this.tint(new vec3(0.45, 0.5, 0.65))
    const skin = this.tint(new vec3(0.95, 0.8, 0.68))
    const helmet = this.tint(new vec3(1.0, 0.92, 0.3))

    this.figure = this.node(this.sceneObject, "StandInFigure", new vec3(0, 0, 0))
    // Hips at 95 cm above the floor (root sits on the floor)
    this.legL = this.node(this.figure, "LegL", new vec3(-10, 95, 0))
    this.part(this.legL, this.boxMesh, new vec3(0, -47, 0), new vec3(14, 94, 16), trousers)
    this.legR = this.node(this.figure, "LegR", new vec3(10, 95, 0))
    this.part(this.legR, this.boxMesh, new vec3(0, -47, 0), new vec3(14, 94, 16), trousers)
    this.chest = this.node(this.figure, "Chest", new vec3(0, 125, 0))
    this.part(this.chest, this.boxMesh, new vec3(0, 0, 0), new vec3(42, 60, 24), vest)
    this.armL = this.node(this.figure, "ArmL", new vec3(-27, 152, 0))
    this.part(this.armL, this.boxMesh, new vec3(0, -32, 0), new vec3(11, 64, 12), shirt)
    this.armR = this.node(this.figure, "ArmR", new vec3(27, 152, 0))
    this.part(this.armR, this.boxMesh, new vec3(0, -32, 0), new vec3(11, 64, 12), shirt)
    this.part(this.figure, this.sphereMesh, new vec3(0, 168, 0), new vec3(22, 25, 22), skin)
    this.part(this.figure, this.sphereMesh, new vec3(0, 176, 0), new vec3(25, 14, 25), helmet)
    this.figure.enabled = false
  }

  private tint(rgb: vec3): Material {
    const m = this.litMaterial.clone()
    m.mainPass.baseColor = new vec4(rgb.x, rgb.y, rgb.z, 1)
    return m
  }

  private node(parent: SceneObject, name: string, pos: vec3): SceneObject {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    so.getTransform().setLocalPosition(pos)
    return so
  }

  private part(parent: SceneObject, mesh: RenderMesh, center: vec3, sizeCm: vec3, mat: Material): void {
    const so = this.node(parent, "Part", center)
    const mn = mesh.aabbMin
    const mx = mesh.aabbMax
    so.getTransform().setLocalScale(
      new vec3(sizeCm.x / Math.max(mx.x - mn.x, 0.0001), sizeCm.y / Math.max(mx.y - mn.y, 0.0001), sizeCm.z / Math.max(mx.z - mn.z, 0.0001)),
    )
    const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = mesh
    rmv.mainMaterial = mat
  }
}
