/**
 * BlindersRackBuilder - builds one virtual warehouse rack (stand-in for the real shelf) under its
 * authored root ("Rack A" / "Rack B"). Move the authored root to move the whole rack.
 * Owns: rack frame geometry (regular, parametric), the seeded boxes and their printed labels
 *       from BlindersPhysicalLayout, and the per-shelf "gaze zone" used as the barcode-read stand-in.
 * @inputs: rackId, size, level heights, box mesh, lit + label materials, colours.
 * Must not: read the ERP, decide problems, or show callouts (BlindersMain / BlindersRules / UI do).
 *
 * Rack-local frame: origin on the floor at the centre of the rack's FRONT edge, rack extends to -Z.
 */
import { LABEL_TEXTURES, PHYSICAL_RACKS, PhysicalShelf } from "./BlindersPhysicalLayout"

export interface BoxInfo {
  /** All payloads printed on this box (main label first, then stickers). */
  payloads: string[]
  /** Main label SceneObject (callout anchor). */
  labelObject: SceneObject
}

export interface ShelfInfo {
  binId: string
  /** Shelf label payload, e.g. BIN:WH01:A-01-01. */
  payload: string
  labelObject: SceneObject
  boxes: BoxInfo[]
  /** Gaze zone on the rack's front plane (rack-local, z = 0). */
  zoneMin: vec2
  zoneMax: vec2
  /** Owning rack root, for world <-> local transforms. */
  rackRoot: SceneObject
}

@component
export class BlindersRackBuilder extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BlindersRackBuilder – virtual rack stand-in</span>')
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Cube mesh used for posts, shelves, boxes and labels (any size; normalised at runtime)")
  boxMesh: RenderMesh

  @input
  @hint("Lit material cloned and tinted for rack frame and cartons")
  litMaterial: Material

  @input
  @hint("Unlit material cloned per printed label (baseTex = label artwork)")
  labelMaterial: Material
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Which rack this is; contents come from BlindersPhysicalLayout")
  @widget(new ComboBoxWidget([new ComboBoxItem("Rack A", "A"), new ComboBoxItem("Rack B", "B")]))
  rackId: string = "A"

  @input
  @hint("Rack outer width, height, depth in cm")
  rackSizeCm: vec3 = new vec3(120, 180, 50)

  @input
  @hint("Shelf board heights above the floor, bottom to top (cm)")
  levelHeightsCm: vec3 = new vec3(25, 85, 145)

  @input("vec3", "{0.55,0.62,0.72}")
  @widget(new ColorWidget())
  @hint("Upright post colour")
  uprightColor: vec3

  @input("vec3", "{0.22,0.36,0.58}")
  @widget(new ColorWidget())
  @hint("Shelf beam colour (steel blue: keeps red/amber callouts readable)")
  beamColor: vec3

  @input("vec3", "{0.86,0.66,0.42}")
  @widget(new ColorWidget())
  @hint("Carton colour")
  cartonColor: vec3
  @ui.group_end

  private shelves: ShelfInfo[] = []
  private unitSize: vec3 = new vec3(1, 1, 1)
  private built = false

  onAwake(): void {
    this.build()
  }

  /** Shelves of this rack, bottom to top. Builds on first call if needed. */
  getShelves(): ShelfInfo[] {
    if (!this.built) this.build()
    return this.shelves
  }

  private build(): void {
    if (this.built) return
    this.built = true
    if (!this.boxMesh || !this.litMaterial || !this.labelMaterial) {
      print("[BlindersRackBuilder] ERROR: boxMesh / litMaterial / labelMaterial not wired")
      return
    }
    const mn = this.boxMesh.aabbMin
    const mx = this.boxMesh.aabbMax
    this.unitSize = new vec3(Math.max(mx.x - mn.x, 0.0001), Math.max(mx.y - mn.y, 0.0001), Math.max(mx.z - mn.z, 0.0001))

    const W = this.rackSizeCm.x
    const H = this.rackSizeCm.y
    const D = this.rackSizeCm.z
    const post = 5
    const frame = this.group(this.sceneObject, "Frame")
    const uprightMat = this.tinted(this.uprightColor)
    const beamMat = this.tinted(this.beamColor)
    const boardMat = this.tinted(new vec3(0.7, 0.72, 0.75))
    const cartonMat = this.tinted(this.cartonColor)

    // Uprights
    for (const sx of [-1, 1]) {
      for (const zf of [0, 1]) {
        const x = sx * (W / 2 - post / 2)
        const z = zf === 0 ? -post / 2 : -(D - post / 2)
        this.block(frame, "Upright", new vec3(x, H / 2, z), new vec3(post, H, post), uprightMat)
      }
    }

    const levels = [this.levelHeightsCm.x, this.levelHeightsCm.y, this.levelHeightsCm.z]
    const layout: PhysicalShelf[] = PHYSICAL_RACKS[this.rackId] || []
    for (let i = 0; i < levels.length; i++) {
      const h = levels[i]
      const next = i + 1 < levels.length ? levels[i + 1] : H
      const level = this.group(this.sceneObject, "Level " + (i + 1))
      // Shelf board, front beam, back beam
      this.block(level, "Board", new vec3(0, h, -D / 2), new vec3(W - 2 * post, 2, D - 2), boardMat)
      this.block(level, "FrontBeam", new vec3(0, h - 3, -1.5), new vec3(W - 2 * post, 7, 3), beamMat)
      this.block(level, "BackBeam", new vec3(0, h - 3, -(D - 1.5)), new vec3(W - 2 * post, 7, 3), beamMat)

      const shelfData = layout.filter((s) => s.level === i)[0]
      const binId = shelfData ? shelfData.binId : this.rackId + "-01-0" + (i + 1)
      const payload = "BIN:WH01:" + binId
      // Shelf label: 10 x 5 cm on the front beam, left side
      const shelfLabel = this.label(level, "ShelfLabel " + binId, payload, new vec3(-(W / 2 - post - 7), h - 3, 0.25), new vec2(10, 5))

      const boxes: BoxInfo[] = []
      if (shelfData) {
        for (const b of shelfData.boxes) {
          const bw = 28
          const bh = 26
          const bd = 36
          const carton = this.group(level, "Carton " + b.label)
          const cz = -(2 + bd / 2)
          this.block(carton, "Body", new vec3(b.x, h + 1 + bh / 2, cz), new vec3(bw, bh, bd), cartonMat)
          const frontZ = -2 + 0.2
          const main = this.label(carton, "BoxLabel " + b.label, b.label, new vec3(b.x - 3, h + 1 + bh / 2 + 4, frontZ), new vec2(10, 7))
          const payloads = [b.label]
          if (b.stickers) {
            for (const s of b.stickers) {
              this.label(carton, "Sticker " + s, s, new vec3(b.x + 8, h + 1 + bh / 2 - 6, frontZ), new vec2(7, 4.2))
              payloads.push(s)
            }
          }
          boxes.push({ payloads, labelObject: main })
        }
      }
      this.shelves.push({
        binId,
        payload,
        labelObject: shelfLabel,
        boxes,
        zoneMin: new vec2(-W / 2, h - 7),
        zoneMax: new vec2(W / 2, next - 7),
        rackRoot: this.sceneObject,
      })
    }
  }

  private group(parent: SceneObject, name: string): SceneObject {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    return so
  }

  private tinted(rgb: vec3): Material {
    const m = this.litMaterial.clone()
    m.mainPass.baseColor = new vec4(rgb.x, rgb.y, rgb.z, 1)
    return m
  }

  private block(parent: SceneObject, name: string, center: vec3, sizeCm: vec3, mat: Material): SceneObject {
    const so = this.group(parent, name)
    const t = so.getTransform()
    t.setLocalPosition(center)
    t.setLocalScale(new vec3(sizeCm.x / this.unitSize.x, sizeCm.y / this.unitSize.y, sizeCm.z / this.unitSize.z))
    const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = this.boxMesh
    rmv.mainMaterial = mat
    return so
  }

  /** Printed label: thin plate with the artwork. Returns an anchor at the label's top-left corner. */
  private label(parent: SceneObject, name: string, payload: string, center: vec3, sizeCm: vec2): SceneObject {
    const root = this.group(parent, name)
    root.getTransform().setLocalPosition(center)
    const mat = this.labelMaterial.clone()
    const tex = LABEL_TEXTURES[payload]
    if (tex) mat.mainPass.baseTex = tex
    mat.mainPass.baseColor = new vec4(1, 1, 1, 1)
    this.block(root, "Plate", new vec3(0, 0, 0), new vec3(sizeCm.x, sizeCm.y, 0.3), mat)
    // Anchor for callouts: top-left corner of the label, just in front of it
    const anchor = this.group(root, "CalloutAnchor")
    anchor.getTransform().setLocalPosition(new vec3(-sizeCm.x / 2, sizeCm.y / 2, 0.3))
    return anchor
  }
}
