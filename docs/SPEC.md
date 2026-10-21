# Blinders - spec

Supersedes sections 1-2 of `blinders-plan.md` where they differ. The plan still owns phases, tests, video and schedule.

## 0. What changed since the plan, and why

| # | Change | Reason |
|---|---|---|
| C1 | Repo root becomes the Lens Studio project folder (the one with `.esproj` and `.mcp.json`). Not a `lens/` subfolder. | The plan-lens skill and the Lens Studio MCP only load when the agent starts in the folder with `.esproj`. The rules also want the `devpost/` folder next to the project. |
| C2 | Box labels identify a handling unit (one physical box), not a material. Key is an SSCC. | That is how a real warehouse does it, and it makes "wrong shelf" exact: one box has one bin in the ERP. Two boxes of the same material can be in different bins. |
| C3 | The ERP is a real local web app with three tables and a movement log, not a hand-written JSON. The Lens gets a generated export, `data/erp.json`. | Reviewers see a believable ERP in the video. The Lens still reads only a local file. |
| C4 | Label codes are allow-listed by format, not just by "code type". | See P4 below. Any QR in the world is a QR. The format is what makes it ours. |
| C5 | The preview can not run vision on real frames (skill pack, preview-limits). The Lens logic runs on a stand-in input in the preview. | Spike S1 decides which stand-in. See section 3. |
| C6 | The checks grow from "wrong shelf" to four: location, expiry, box count per shelf, open action. | That is what a person doing a shelf check actually checks. |
| C7 | BLIND triggers on people and on other sensitive things in view (screens, documents, ID cards). | Same reason as people: the glasses have no business looking at them. |
| C8 | All codes use GS1 prefix 952. | GS1 reserves 952 for demos and examples. The codes are valid GS1 and can never belong to a real company. |

## 0.1 Main product and bonus

Main product, in order:

1. **Blind.** Nothing runs while a person or a sensitive object is in view. This is the entry.
2. **Read every code in view, sort it.** Shelf label or box label. Anything else is dropped (P4).
3. **Check each box against the ERP** for the shelf label in view:
   - R1 Location: box belongs on another shelf. Red, "belongs in B-01-02".
   - R6 Expiry: best before is past. Red, "expired 28.10". Expiring within 7 days: amber, "expires 28.10".
   - R7 Count: per material, boxes seen on this shelf vs boxes the ERP expects. "2 of 3". Shown once per material, on the shelf label, not on every box.
   - R2 Action: amber, the ERP's action text.
   - R3 Unknown code: grey "?".
   - R4 All fine: small green dot. Quiet.
   - Priority when several hit one box: R1 > R6 > R2. R5 (max 3 text lines) still applies.

Bonus, only if time:

- Point at a box (hand ray, pinch) for detail: material, batch-free short name, best before. Detail closes on its own after 4 s.
- Highlight the physical box the label is on (outline or glow sized from the label position), not just the label.

## 0.2 Where things live

From the concept video and the skill pack's design rules: keep everything where the user is already looking. No head tilts, no eyes to the edges.

- Markers sit on the label they are about, a few cm above it. Never a panel at the edge of the view.
- Count result (R7) sits on the shelf label.
- Text is short (max 4 words), light colour, readable at 1 m. The display is additive, so no dark plates.
- The BLIND indicator is a small grey pill just below the centre of view, not in a corner. The user should notice it without looking for it, then look past it. (Changes plan section 1, which said top-left.)
- Nothing follows the head except the BLIND indicator.

## 1. Privacy: where processing happens

The point of the project is that nothing leaves the glass before it is censored. So the first question is whether SPECS lets us keep it there.

What the platform does (Snap docs, Permissions & Privacy, checked 2026-10-21):

- A Lens that reads the camera (CameraModule) can not use the internet at the same time. The platform blocks it.
- Two ways around that block exist: **Transparent Permission** (published Lens, user sees a prompt listing camera + internet, LED blinks) and **Extended Permissions** (experimental Lenses only, unpublishable).
- **Exception:** Snap's own Remote Service Gateway (cloud AI) does not count as internet. A published Lens may send camera data to it with no extra prompt.

What that means for us:

- The default path is on-glass. Camera frames reach Lens code and SnapML on the device. Good.
- The leak paths are the exception and the two permission modes. Blinders uses none of them. No RemoteServiceModule, no Remote Service Gateway, no InternetModule, no Transparent or Extended Permissions.
- Then the platform enforces P1 for us: if anyone later adds a network call next to the camera, the Lens stops working instead of leaking. That is the pitch line.

Goal posts we accept moving:

- If code reading is only possible through cloud decoding: no. Fall back to image markers. (Plan S3.)
- If person detection is only possible through a cloud model: no. The project is dead in its current form. (Plan S2 kill switch.)

### Invariants (revised)

- P1 No camera frame or derived image leaves the Lens. No network module of any kind in the project. Static test fails on `RemoteServiceModule`, `InternetModule`, `RemoteServiceGateway`, `fetch`, `WebSocket`.
- P2 No code decoding runs while state is BLIND. Not hidden: not called.
- P3 Nothing persists between sessions. No `PersistentStorageSystem`.
- P4 Decoded payloads are checked against two formats and anything else is dropped in the same function call: not shown, not logged, not kept.
  - Bin: `BIN:` + warehouse + `:` + bin id, e.g. `BIN:WH01:A-01-02`
  - Box: `00` + 18-digit SSCC starting with `09521234` (extension 0 + demo company prefix 9521234), check digit valid. This is the GS1 element string for AI (00), so it stays numeric and the QR stays small.
  - A URL QR, a vendor EAN, a shipping label: dropped.
  - Text OCR is never run.
- P5 Sensitive-content detection outputs one boolean per frame: "something sensitive is in view". No boxes kept, no count, no tracking id, no face landmarks, no class kept after the decision.
  - Must: person (whole or part: face, hand of another person, arm).
  - Should, if the detector has the class: screen or monitor, phone, laptop, paper document, ID or payment card.
  - The wearer's own hands are not a trigger. Spike S2 has to show the detector can tell them apart, or the hand-pointing bonus is dropped.

## 2. ERP mockup

Local web app in `erp/`. Node, one dependency (`bwip-js` for barcodes). Runs on `localhost:4100`. Database is one JSON file, `data/erp-db.json`. Fake data, labelled fake in the UI header and README.

Look: dark, clean, slightly sci-fi (thin cyan lines, monospace numbers, transaction codes in the corner). It has to read as "real ERP with taste", not a game UI. Labels print black on white whatever the screen theme.

### 2.1 Material master (MM03)

| Field | Example | Note |
|---|---|---|
| Material | 100101 | Internal number. Relabel at receipt uses this. |
| Description | Arc reactor cell, palladium core, Mk II | |
| Vendor | Stark Industries | |
| Vendor material | SI-ARC-MK2 | The vendor's code, printed on their box. Not ours. |
| GTIN (EAN-13) | 9521234001010 | GS1 demo prefix 952. Check digit valid. |
| Base UoM | EA | ISO-ish codes: EA, PR, BX, RM, L, KG |
| Units per case | 4 | |
| Shelf life (days) | 1825 | 0 = not shelf-life managed |
| Min. remaining shelf life at GR (days) | 365 | Goods receipt is refused below this |
| Storage condition | Ambient / Cool / Hazmat / ESD | |
| Batch managed | yes | |
| Gross weight per case (kg) | 2.4 | |

### 2.2 Storage bins (LS03)

| Field | Example | Note |
|---|---|---|
| Warehouse | WH01 | "Garage" |
| Bin | A-01-02 | Rack - section - level |
| Check digits | 47 | Two digits printed big on the label. Voice picking uses them in real warehouses. Derived from the bin id. |
| Storage type | SHELF / QUAR / GR | Quarantine and goods receipt zone are bins too |
| Description | Rack A, left, level 2 | |
| Max weight (kg) | 40 | |
| Blocked | no | |

### 2.3 Stock: handling units (LX02 / MMBE)

One row per physical box.

| Field | Example |
|---|---|
| SSCC | 006401230000000018 |
| Material | 100101 |
| Batch | SI-2610-A |
| Vendor batch | MK2-0042 |
| Quantity + UoM | 4 EA |
| Bin | A-01-02 |
| Manufactured | 2026-09-14 |
| Received | 2026-10-03 |
| Best before | computed: manufactured + shelf life |
| Stock status | Unrestricted / Quality inspection / Blocked |
| Action | free text, max 4 words, e.g. "move to quarantine". Read by the Lens (rule R2). |
| GR document | 5000000012 |

### 2.4 Transactions

- **MIGO Goods receipt.** Pick material, enter qty, batch, vendor batch, manufacture date. ERP checks remaining shelf life, assigns a new SSCC, puts the box in the GR zone, and offers the box label right away. That is the relabel-at-receipt step.
- **LT01 Transfer.** Move a box to another bin. Logged.
- **Status change.** Unrestricted / QI / Blocked, and the action text.
- **MB51 Movement log.** Every change as a material document: 101 GR, 311 transfer, 343/344 status, 701 inventory correction.
- **Labels.** Print shelf labels (all or selected) and box labels (all or selected) on A4.
- **Publish to Lens.** Writes `data/erp.json`, the small export the Lens reads. Shows a diff count.

### 2.5 Lens export, `data/erp.json`

```json
{
  "generated": "2026-10-21T08:00:30Z",
  "today": "2026-10-21",
  "warehouse": "WH01",
  "bins": [
    { "code": "BIN:WH01:A-01-02", "bin": "A-01-02", "name": "Rack A, level 2",
      "expected": [ { "material": "100101", "short": "Arc reactor Mk II", "boxes": 2 } ] }
  ],
  "boxes": [
    { "code": "00095212340000000013", "bin": "A-01-02", "material": "100101", "short": "Arc reactor Mk II",
      "bestBefore": "2031-09-13", "status": "Unrestricted", "action": null }
  ]
}
```

Only what the checks need. No vendors, batches, prices or per-box quantities. If the glasses were lost, this is all they hold.

## 3. Labels

Printed on plain A4, cut by hand. Tape to shelf edge and box.

| Label | Size | Content |
|---|---|---|
| Shelf | 100 x 50 mm, 10 per A4 | Bin id big, check digits, description, QR 36 mm, Code 128 |
| Box | 100 x 70 mm, 8 per A4 | Our material no + description, batch, qty, best before, vendor (small), QR 34 mm with SSCC, GS1-128 with SSCC |

The QR is the thing the glasses read. It is sized for about 1 m. The Code 128 is there because a real warehouse scanner would read it, and it makes the label look right.

QR payloads are numeric or short alphanumeric so they stay at QR version 1-2. Big modules read from further away.

### Preview stand-in (C5)

Ordered by preference. Spike S1 picks one.

1. Recorded clip of the garage shelf as the camera texture, decoder runs on it in preview.
2. Photos of the real labelled shelf as textures in the scene. Decoder runs on the photo texture.
3. Decoding faked: a debug panel lists the codes "seen". Logic and overlays still run for real.

Whatever is picked, the video says it on screen.

## 4. Demo data

Fake. Fictional companies. Garage shelf, two racks.

- Bins: A-01-01 .. A-01-03, B-01-01 .. B-01-03, Q-01-01 (quarantine), GR-ZONE.
- 10 materials from Stark Industries, Wayne Enterprises, Acme, Cyberdyne Systems, Weyland-Yutani, Oscorp, Vandelay Industries, Dunder Mifflin, Wonka Industries.
- 14 boxes. Seeded so every Lens rule shows up once:
  - R1 one box physically on the wrong shelf: Cyberdyne neural net CPU, ERP says B-01-02, put it on A-01-02
  - R2 one box with action "move to quarantine" (Oscorp, B-01-03)
  - R3 one label not in the ERP: print a box label, then post goods issue for that box
  - R6 Fizzy lifting drink in A-01-03 expires 28.10.2026, a week after the seed date. Expired by the time the video is shot, which is fine: re-seed or edit the date to choose.
  - R7 two Arc reactor boxes expected in A-01-02. Put one on the shelf: "1 of 2".
  - R4 the rest

Fixture setup for the plan's F1-F8 goes in `test/acceptance.md` once the shelf exists.
