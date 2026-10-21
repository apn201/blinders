/**
 * BlindersQuad - code-authored flat rectangle (leader lines, terminals, floor markings).
 * Owns: one RenderMeshVisual + MeshBuilder under the given parent, in the parent's local XY plane,
 *       facing local +Z. The caller owns the material (colour, alpha, depth settings).
 */

export function createQuad(parent: SceneObject, name: string, x0: number, y0: number, x1: number, y1: number, material: Material): RenderMeshVisual {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  const builder = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3, normalized: true },
    { name: "texture0", components: 2 },
  ])
  builder.topology = MeshTopology.Triangles
  builder.indexType = MeshIndexType.UInt16
  builder.appendVerticesInterleaved([
    x0, y0, 0, 0, 0, 1, 0, 0,
    x1, y0, 0, 0, 0, 1, 1, 0,
    x1, y1, 0, 0, 0, 1, 1, 1,
    x0, y1, 0, 0, 0, 1, 0, 1,
  ])
  builder.appendIndices([0, 1, 2, 0, 2, 3])
  builder.updateMesh()
  const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  rmv.mainMaterial = material
  rmv.mesh = builder.getMesh()
  return rmv
}
