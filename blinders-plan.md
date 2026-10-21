# Blinders - build plan

Entry for Learn AR with SPECS (Devpost). Deadline Nov 9 2026, 17:00 EST = Nov 10 00:00 Helsinki. Treat Nov 9 18:00 Helsinki as the real deadline.

## One line

Smart glasses for the warehouse floor that are allowed to see one thing: labels. They check every label against the ERP and flag what is on the wrong shelf. The moment a person enters the view, they go blind until that person leaves.

## Why it exists

Smart glasses are being banned from factories, hospitals and offices because of the camera. Blinders is the version a security manager can sign off: it processes only allow-listed codes, keeps nothing, sends nothing, and refuses to look at people.

## Hackathon rules that shape the plan

- New project. Created during the submission period. No old code copied in.
- Must be planned with the Devpost Learn skill pack. The `devpost/` folder it writes goes in the repo.
- Must be built by a coding agent through CLAD and the Lens Studio MCP.
- Runs in the Lens Studio preview. No glasses needed.
- Submit: public repo, YouTube video under 3 minutes, short description.
- Reviewers will not run it. The video is the proof.
- Judging: Design, Technical Implementation (incl. use of CLAD / MCP), Innovation, Presentation.

Practical consequence: we do not hand-write the Lens. We write the spec, run the skill pack, and drive CLAD slice by slice. Hand edits are limited to fixing what the agent can not, and get noted in docs/NOTES.md.

## Non-goals

- Real ERP integration. The ERP is a local JSON file, and the video says so.
- Best-before date OCR. Out.
- Damaged barcode recovery (Arpi). Out.
- Recording, screenshots, logging of frames. Never.
- Running on real SPECS hardware.

---

## 1. Behaviour spec

### States

| State | Meaning | Visible to wearer |
|---|---|---|
| IDLE | No shelf label in view | Nothing |
| SCANNING | Shelf label in view, items being matched | Small neutral dot on each recognised item |
| FLAGGED | At least one item on this shelf is wrong or needs action | Red marker on the item, one short line: where it belongs or what to do |
| BLIND | A person is in view | Everything removed. One small grey marker top-left: "person in view - paused" |

### Transitions

- Any state -> BLIND when a person is detected in 2 consecutive detection frames (or 150 ms, whichever comes first). Immediate. No fade.
- BLIND -> previous state only after no person detected for 2.0 s continuously.
- While BLIND: code detection is not run, not just hidden. Overlays are destroyed, not faded.
- IDLE <-> SCANNING follows the shelf label being in view, with 500 ms hold so it does not flicker.
- SCANNING <-> FLAGGED is derived each frame from the rules below.

### Rules

- R1 Wrong shelf: item's ERP location != location of the shelf label in view. Marker: red, text "belongs in B3".
- R2 Action required: item has an `action` in ERP. Marker: amber, text is the action, max 4 words ("count this", "move to quarantine").
- R3 Unknown code: code not in ERP. Marker: grey "?". No text.
- R4 Correct item: tiny green dot, no text. Quiet when things are fine.
- R5 Max 3 text lines on screen at once. Nearest items win. Hands and eyes stay free.

### Privacy invariants (these are tested, not just claimed)

- P1 No camera frame or derived image leaves the Lens. No network calls at all in the shipped Lens.
- P2 No code detection runs while state is BLIND.
- P3 Nothing is stored between sessions. No persistent storage API used.
- P4 Only allow-listed code types are decoded. Text OCR is never run.
- P5 Faces are never identified, tracked across frames, or counted. Detection result is a single boolean: person present yes/no.

---

## 2. Data

`data/erp.json`, loaded at Lens start. Fake, and labelled as fake in the README.

```json
{
  "shelves": [
    { "label_id": "SHELF_A1", "location": "A1", "name": "Cleaning" },
    { "label_id": "SHELF_B3", "location": "B3", "name": "Sauces" }
  ],
  "items": [
    { "code_id": "ITEM_001", "name": "Ketchup 1kg", "location": "B3", "batch": "K-2611", "action": null },
    { "code_id": "ITEM_002", "name": "Dish soap", "location": "A1", "batch": "D-0927", "action": null },
    { "code_id": "ITEM_003", "name": "Mustard", "location": "B3", "batch": "M-1101", "action": "move to quarantine" }
  ]
}
```

`label_id` and `code_id` are whatever the detection spike (S3) can produce: barcode value, QR payload or marker name. The logic does not care.

6-10 items total. Two shelves. Enough to show every rule once.

---

## 3. Repository layout

```
blinders/
  devpost/            written by the skill pack, committed as-is
  lens/               Lens Studio project
    Assets/Scripts/
      logic/          pure TypeScript, no Lens Studio imports
        rules.ts      R1-R5
        state.ts      state machine
        erp.ts        loads and validates erp.json
      lens/           Lens Studio glue: detection, overlays, blind mode
  data/erp.json
  test/
    unit/             node tests for logic/
    fixtures/         recorded shelf videos (see section 6)
    acceptance.md     expected result per fixture, filled during test runs
  docs/
    SPEC.md           this file, trimmed
    NOTES.md          what broke, what the agent got wrong, hand edits
  README.md
```

The `logic/` folder is the key design choice. State machine and rules have no Lens Studio dependency, so they are unit tested in node in seconds. Lens Studio code only feeds events in and draws what comes out.

---

## 4. Phases and gates

### Phase 0 - Setup (Oct 21-22)

Tasks:
1. Install Lens Studio, Node, Git. Claude Code as the coding agent.
2. Install Lens Studio MCP and the CLAD plugin per the Resources tab.
3. `npx skills add challengepost/learn-specs --all -y`
4. Watch the concept video. Note the judging language they use.
5. Attend or watch the Live Build Session (Oct 22, 19:00 Helsinki).
6. Create the repo. Public from day one, so the "started in the period" history is visible.

Gate G0: Claude Code, through the MCP, creates a new Spectacles project and places a text object that renders in the preview. If this takes more than one evening, ask in their Discord, not in a third evening.

### Phase 1 - Spikes (Oct 23-26)

Three questions decide whether this idea survives. Timebox each to one evening. Do them in this order.

S1 - Recorded video as preview input
- Can the Spectacles preview use a recorded video as the world camera feed?
- Test: phone clip of a shelf, fed into preview, a camera-texture debug view shows it.
- Fallback if no: build the scene in Lens Studio with photo textures of shelf and labels. Weaker video, still valid.

S2 - Person detection on the world camera
- Options in order of preference: built-in person/body/face detection usable on the Spectacles world camera, then an object detection ML component with a person class.
- Test: clip of someone walking into the shelf shot. Detection flips within 300 ms of them entering, back within 300 ms of leaving.
- This is the core feature. If no option works, the idea is dead. Pivot to the blink-code lens idea and keep this doc for parts.

S3 - Reading codes
- Options in order of preference: native barcode/QR reading in Lens Studio, image/marker tracking with printed marker labels, cloud decoding.
- Cloud decoding contradicts P1. Do not choose it. If it is the only path that reads real barcodes, use markers instead and say in the video that markers stand in for barcodes in the preview.
- Test: 6 printed labels on a shelf, all identified with stable IDs at 50 cm.

Also check in Phase 1: whether Spectacles restricts combining camera access with network access. If it does, that is a gift for the pitch: the platform already enforces part of P1. Note it in NOTES.md.

Gate G1: a filled decision table in docs/NOTES.md:

| Spike | Result | Chosen option | Fallback used |
|---|---|---|---|
| S1 | | | |
| S2 | | | |
| S3 | | | |

S2 must be a pass. S1 and S3 may pass via fallback.

### Phase 2 - Plan with the skill pack (Oct 27)

Tasks:
1. "Run the plan-lens skill." Answer its interview using sections 1 and 2 of this document. Do not let it talk the face rule out of the design.
2. Let it check against its AR best practices. Accept changes to layout and wording. Reject changes to the privacy invariants.
3. Commit the `devpost/` output untouched. If the brief conflicts with this plan, record the conflict and the decision in NOTES.md.

Gate G2: the brief in `devpost/` contains the four states, rules R1-R5 and invariants P1-P5 in some form. Diff it by eye against this document.

### Phase 3 - Build through CLAD, slice by slice (Oct 28 - Nov 4)

One slice per CLAD session. Each slice ends with its tests green and a commit. Never two slices in one prompt.

Slice A - Logic, no Lens Studio
- `logic/erp.ts`, `logic/rules.ts`, `logic/state.ts`.
- Pure functions. Input: list of detected IDs, shelf ID, person flag, timestamp. Output: state and list of markers.
- Unit tests, see section 5. This slice can be built and tested before CLAD is involved in any visual work.
- Gate: all unit tests pass in node.

Slice B - Detection glue
- Code detection from S3 emits `{ id, screenPos or worldPos }` per frame.
- Person detection from S2 emits a boolean.
- Both feed the logic each frame.
- Gate: debug text shows detected IDs and person flag correctly on fixtures F1 and F3.

Slice C - Overlays
- Markers anchored to the detected label position, not floating screen UI. Colour and text per rules.
- Max 3 text lines (R5).
- Gate: F1 and F2 look right in preview, screenshots saved to docs/.

Slice D - Blind mode
- On BLIND: stop code detection component, destroy all markers, show the paused marker.
- On resume: restart detection, rebuild markers from fresh detections only. Nothing cached from before BLIND.
- Gate: F3 passes acceptance. A debug counter of "code detections run while BLIND" stays at 0 across all fixtures.

Slice E - Polish
- Timing tuning, marker sizes, text legibility at preview resolution.
- Remove debug overlays behind a single flag.
- Gate: full acceptance run, section 6, all rows pass or have a documented reason.

Live Project Review Nov 5 (19:00 Helsinki): have Slices A-D done and a rough cut of the video. Use their feedback in Slice E and the final video.

### Phase 4 - Video and submission (Nov 5-9)

See section 7 for the script. Submission checklist in section 8.

Gate G4: video under 2:55, uploaded public, plays logged out. Repo public, README links the video, `devpost/` present.

---

## 5. Unit tests (Slice A)

Node, no Lens Studio. Vitest or plain node assert, whichever the agent sets up fastest.

ERP
- U1 Loads valid erp.json.
- U2 Rejects duplicate code_id.
- U3 Rejects item with location that matches no shelf.

Rules
- U4 Item on correct shelf -> green, no text.
- U5 Item on wrong shelf -> red, text names the correct location.
- U6 Item with action -> amber, text is the action.
- U7 Item wrong shelf and with action -> red wins, action shown second only if line budget allows.
- U8 Unknown code -> grey "?".
- U9 Five text-bearing items in view -> only 3 nearest get text.

State machine
- U10 Person flag true for 2 frames -> BLIND.
- U11 Person flag true for 1 frame then false -> stays in previous state.
- U12 In BLIND, person false for 1.9 s -> still BLIND.
- U13 In BLIND, person false for 2.0 s -> resumes.
- U14 In BLIND, the logic reports `detectionAllowed = false`.
- U15 In BLIND, any detected IDs passed in are ignored and produce no markers.
- U16 Leaving BLIND produces no markers until a fresh detection arrives.
- U17 Shelf label lost for 400 ms -> stays SCANNING. 600 ms -> IDLE.

Invariant tests
- U18 Static check: no file under `lens/` calls a network API. Grep in the test, fail on match.
- U19 Static check: no persistent storage API used anywhere.
- U20 Static check: no OCR or text recognition component referenced.

---

## 6. Fixtures and acceptance

Shoot on the phone at home. Pantry shelf or garage shelf. Two printed shelf labels, 6-10 printed item labels on real products. 10-20 s per clip, landscape, steady, eye height.

| ID | Clip | Expected |
|---|---|---|
| F1 | Shelf B3, all items correct | Green dots only. No text. |
| F2 | Shelf B3, ketchup correct, dish soap placed here | Dish soap red "belongs in A1". Others green. |
| F3 | F2, then a person walks into frame for 4 s, leaves | Markers vanish within 300 ms of entry. Grey paused marker. Markers return 2 s after exit. |
| F4 | Person only partly in frame, arm or shoulder | Document what happens. Fail-safe preference: BLIND. |
| F5 | Poster or photo of a face on the wall behind the shelf | Expect BLIND. That is correct behaviour: it can not tell a photo from a person, and it errs toward not looking. Say so in the video. |
| F6 | Mustard (action) on its correct shelf | Amber "move to quarantine". |
| F7 | Unlabelled product and a label not in ERP | Grey "?" on the unknown label, nothing on the unlabelled product. |
| F8 | Shelf A1 then pan to B3 | Shelf context switches, markers re-evaluated. |

Record each run in test/acceptance.md: date, fixture, pass/fail, note. A fail with a written reason is acceptable. A fail without one is not.

---

## 7. Video (under 3 minutes)

Recorded mostly from the Lens Studio preview, plus a few seconds of real footage.

| Time | Content |
|---|---|
| 0:00-0:20 | Problem. "Smart glasses are getting banned from factories. I'm the person who writes those rules." |
| 0:20-0:35 | The rule. "These glasses can see labels. Nothing else. And they don't look at people." |
| 0:35-1:15 | F1 then F2. Wrong shelf flagged, hands free, eyes up. F6 action prompt. |
| 1:15-1:50 | F3. Person walks in, everything goes dark. Leaves, it comes back. The quiet moment is the point, let it breathe. |
| 1:50-2:20 | Under the hood. The five invariants on screen. The debug counter at zero. CLAD and the MCP building it, the devpost/ brief. |
| 2:20-2:45 | Honest limits. Fake ERP. Markers instead of barcodes if S3 forced it. F5: it can't tell a poster from a person, and that's the right failure. |
| 2:45-2:55 | Close in own words. Something like: "Most AR wants to see more. This one earns its way in by seeing less." |

Rough cut for the Nov 5 review. Final cut after.

---

## 8. Submission checklist

- [ ] Repo public, created after Oct 21 history-wise, licence chosen
- [ ] `devpost/` folder from the skill pack committed
- [ ] Lens Studio project files committed
- [ ] README: what it does, who it's for, what's fake, how it was built (skill pack -> CLAD -> MCP), invariants P1-P5, test results summary
- [ ] docs/NOTES.md: spike results, agent mistakes, hand edits
- [ ] test/acceptance.md filled
- [ ] Unit tests pass, command in README
- [ ] Video public on YouTube, under 3 minutes, plays logged out
- [ ] Devpost description: what, who, what I learned
- [ ] Submitted before Nov 9 18:00 Helsinki

---

## 9. Risks and kill switches

| Risk | Signal | Action |
|---|---|---|
| S2 fails, no person detection on world camera | G1 not reached by Oct 26 | Kill Blinders. Pivot to blink-code lens. |
| CLAD can not build a slice | 2 sessions without progress on one slice | Narrow the slice, hand-fix the glue, document in NOTES.md |
| Preview can not take recorded video | S1 fails | Photo-texture scene. Keep F3 as a real-world clip with a phone overlay mock, clearly labelled as mock. |
| Barcodes not readable | S3 fails on native | Markers. Say so on screen. |
| Time | Nov 5 without Slice D done | Drop Slice E polish, ship A-D. Blind mode is the entry, polish is not. |

## 10. Schedule

| Date | Target |
|---|---|
| Oct 21-22 | Phase 0, G0. Live Build Session Oct 22. |
| Oct 23-26 | Spikes S1-S3, G1. Shoot fixtures F1-F8 alongside. |
| Oct 27 | Phase 2, skill pack plan, G2. |
| Oct 28-30 | Slices A, B. |
| Oct 31-Nov 3 | Slices C, D. |
| Nov 4 | Rough cut. |
| Nov 5 | Live Project Review. |
| Nov 6-7 | Slice E, final acceptance run. |
| Nov 8 | Final video, README. |
| Nov 9 | Submit by 18:00 Helsinki. |
