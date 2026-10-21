/**
 * BlindersRingMesh - code-authored annulus / disc used as the gaze-dwell timer circle and the
 * gaze cursor dot. Progress 0..1 fills the ring clockwise from 12 o'clock.
 * Owns: one RenderMeshVisual + MeshBuilder under the given parent. Faces local +Z.
 * Must not: hold mode or selection state (BlindersModeMenuUI drives it).
 */

export class BlindersRingMesh {
  readonly sceneObject: SceneObject
  private builder: MeshBuilder
  private material: Material
  private segments: number
  private shownSegments = -1

  constructor(parent: SceneObject, name: string, innerR: number, outerR: number, segments: number, material: Material, color: vec4) {
    this.segments = segments
    this.sceneObject = global.scene.createSceneObject(name)
    this.sceneObject.setParent(parent)
    this.builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3, normalized: true },
      { name: "texture0", components: 2 },
    ])
    this.builder.topology = MeshTopology.Triangles
    this.builder.indexType = MeshIndexType.UInt16
    const verts: number[] = []
    for (let i = 0; i <= segments; i++) {
      // clockwise from 12 o'clock when viewed from +Z
      const a = Math.PI / 2 - (i / segments) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      verts.push(c * innerR, s * innerR, 0, 0, 0, 1, 0.5, 0.5)
      verts.push(c * outerR, s * outerR, 0, 0, 0, 1, 0.5, 0.5)
    }
    this.builder.appendVerticesInterleaved(verts)
    const rmv = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    this.material = material.clone()
    this.material.mainPass.baseColor = color
    rmv.mainMaterial = this.material
    this.setProgress(1)
    rmv.mesh = this.builder.getMesh()
  }

  setColor(color: vec4): void {
    this.material.mainPass.baseColor = color
  }

  /** 0..1 portion of the ring drawn. */
  setProgress(p: number): void {
    const n = Math.max(0, Math.min(this.segments, Math.round(p * this.segments)))
    if (n === this.shownSegments) return
    this.shownSegments = n
    const count = this.builder.getIndicesCount()
    if (count > 0) this.builder.eraseIndices(0, count)
    const idx: number[] = []
    for (let i = 0; i < n; i++) {
      const in0 = 2 * i
      const out0 = 2 * i + 1
      const in1 = 2 * (i + 1)
      const out1 = 2 * (i + 1) + 1
      // CCW seen from +Z (vertices advance clockwise, so order inner0, in1, out0 ...)
      idx.push(in0, in1, out0, out0, in1, out1)
    }
    if (idx.length === 0) idx.push(0, 0, 0) // degenerate keeps the mesh valid
    this.builder.appendIndices(idx)
    this.builder.updateMesh()
  }
}
