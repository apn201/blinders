/**
 * BlindersPhysicalLayout - what is PHYSICALLY on the virtual racks (demo seeding, SPEC section 4).
 * This is the stand-in for the real garage shelf, deliberately different from the ERP:
 *  - A-01-01 empty                       -> "Seems empty"
 *  - Neural net CPU (ERP B-01-02) on A-01-02 -> R1 wrong shelf (and B-01-02 "0 of 1")
 *  - only one Arc reactor on A-01-02     -> R7 "1 of 2"
 *  - Fizzy lifting drink on A-01-03, BBE 28.10.2026 -> R6 amber
 *  - OZ-2 enhancer on B-01-03, ERP action "move to quarantine" -> R2
 *  - box label 00095212340000000150 not in ERP (goods issue posted), on B-01-02 -> R3 "?"
 *  - Acme vendor EAN sticker on the rocket skates -> dropped by P4, never shown or logged
 *  - B-01-01 matches the ERP fully -> mode 1 shows nothing there
 *  - the rest match -> R4 green dot in mode 2
 * Owns: slot positions and label payloads + label textures. Must not: hold ERP truth.
 */

export interface PhysicalBox {
  /** Slot centre X in rack-local cm (rack interior spans about -58..58). */
  x: number
  /** Main box label payload (SSCC element string). */
  label: string
  /** Extra stickers on the same box (e.g. vendor EAN) - must be dropped by P4. */
  stickers?: string[]
}

export interface PhysicalShelf {
  binId: string
  level: number // 0 = bottom
  boxes: PhysicalBox[]
}

export const PHYSICAL_RACKS: { [rackId: string]: PhysicalShelf[] } = {
  A: [
    { binId: "A-01-01", level: 0, boxes: [] },
    {
      binId: "A-01-02",
      level: 1,
      boxes: [
        { x: -20, label: "00095212340000000013" },
        { x: 16, label: "00095212340000000068" },
      ],
    },
    {
      binId: "A-01-03",
      level: 2,
      boxes: [
        { x: -20, label: "00095212340000000037" },
        { x: 16, label: "00095212340000000112" },
      ],
    },
  ],
  B: [
    {
      binId: "B-01-01",
      level: 0,
      boxes: [
        { x: -22, label: "00095212340000000051", stickers: ["9521234003014"] },
        { x: 16, label: "00095212340000000105" },
      ],
    },
    {
      binId: "B-01-02",
      level: 1,
      boxes: [
        { x: -20, label: "00095212340000000129" },
        { x: 16, label: "00095212340000000150" },
      ],
    },
    {
      binId: "B-01-03",
      level: 2,
      boxes: [
        { x: -20, label: "00095212340000000075" },
        { x: 16, label: "00095212340000000082" },
      ],
    },
  ],
}

/** Printed label artwork (generated PNGs), keyed by payload. */
export const LABEL_TEXTURES: { [payload: string]: Texture } = {
  "BIN:WH01:A-01-01": requireAsset("../Textures/Labels/BIN_A-01-01.png") as Texture,
  "BIN:WH01:A-01-02": requireAsset("../Textures/Labels/BIN_A-01-02.png") as Texture,
  "BIN:WH01:A-01-03": requireAsset("../Textures/Labels/BIN_A-01-03.png") as Texture,
  "BIN:WH01:B-01-01": requireAsset("../Textures/Labels/BIN_B-01-01.png") as Texture,
  "BIN:WH01:B-01-02": requireAsset("../Textures/Labels/BIN_B-01-02.png") as Texture,
  "BIN:WH01:B-01-03": requireAsset("../Textures/Labels/BIN_B-01-03.png") as Texture,
  "00095212340000000013": requireAsset("../Textures/Labels/BOX_00095212340000000013.png") as Texture,
  "00095212340000000037": requireAsset("../Textures/Labels/BOX_00095212340000000037.png") as Texture,
  "00095212340000000051": requireAsset("../Textures/Labels/BOX_00095212340000000051.png") as Texture,
  "00095212340000000068": requireAsset("../Textures/Labels/BOX_00095212340000000068.png") as Texture,
  "00095212340000000075": requireAsset("../Textures/Labels/BOX_00095212340000000075.png") as Texture,
  "00095212340000000082": requireAsset("../Textures/Labels/BOX_00095212340000000082.png") as Texture,
  "00095212340000000105": requireAsset("../Textures/Labels/BOX_00095212340000000105.png") as Texture,
  "00095212340000000112": requireAsset("../Textures/Labels/BOX_00095212340000000112.png") as Texture,
  "00095212340000000129": requireAsset("../Textures/Labels/BOX_00095212340000000129.png") as Texture,
  "00095212340000000150": requireAsset("../Textures/Labels/BOX_00095212340000000150.png") as Texture,
  "9521234003014": requireAsset("../Textures/Labels/VENDOR_9521234003014.png") as Texture,
}
