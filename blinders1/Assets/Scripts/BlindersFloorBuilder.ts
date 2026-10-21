/**
 * BlindersFloorBuilder - stand-in warehouse floor markings: yellow safety lines along the rack
 * fronts and the aisle edge. No slab: on the additive display a grey slab only adds light and
 * outlines the display area. Preview set dressing only (like the racks, it stands in for the
 * real world), so it is obvious in the scene and never read by the Lens logic.
 * Owns: flat quads under its own SceneObject (origin = floor level, racks at local z = -150).
 * Must not: take part in reading, callouts, or person detection.
 */
import { createQuad } from "./BlindersQuad"

@component
export class BlindersFloorBuilder extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BlindersFloorBuilder – stand-in floor and aisle lines</span>')
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Lit material cloned and tinted for the lines")
  litMaterial: Material
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec3", "{0.98,0.78,0.1}")
  @widget(new ColorWidget())
  @hint("Safety line colour")
  lineColor: vec3
  @ui.group_end

  onAwake(): void {
    if (!this.litMaterial) {
      print("[BlindersFloorBuilder] ERROR: litMaterial not wired")
      return
    }
    // Lay the local XY plane flat: quads face +Z, rotated to face up
    const flat = global.scene.createSceneObject("FloorPlane")
    flat.setParent(this.sceneObject)
    flat.getTransform().setLocalRotation(quat.angleAxis(-Math.PI / 2, vec3.right()))
    // In FloorPlane space: x = world x, y = -world z, z = up
    const line = this.tinted(this.lineColor)
    const lift = (so: RenderMeshVisual) => so.getSceneObject().getTransform().setLocalPosition(new vec3(0, 0, 0.3))
    // Line just in front of the rack fronts (world z = -140) and the aisle edge at the
    // operator's feet (world z = -30); the stand-in person walks inside the aisle
    lift(createQuad(flat, "RackLine", -140, 136, 140, 144, line))
    lift(createQuad(flat, "AisleLine", -260, 26, 260, 34, line))
  }

  private tinted(rgb: vec3): Material {
    const m = this.litMaterial.clone()
    m.mainPass.baseColor = new vec4(rgb.x, rgb.y, rgb.z, 1)
    return m
  }
}
