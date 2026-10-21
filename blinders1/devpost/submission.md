# Blinders - submission drafts

Drafts for the Devpost entry. Lines marked `[fill: ...]` need your facts. Nothing in them was guessed.

## Short description (Devpost)

Blinders is safety glasses that check warehouse shelves against the ERP while you walk past. And they stop looking when a person walks in.

The operator looks at a rack. The glasses read the shelf label and the box labels, ask the ERP (local copy) what should be there, and stay quiet if it matches. If something is wrong, a short callout appears on the label: shelf seems empty, box belongs in another shelf, best before is close, count does not match, ERP has an open action. Mode 2 shows everything, with a green dot on labels that match. Mode 0 is just glasses, camera off.

The part I actually care about is the camera. A camera in a warehouse sees people, screens and ID cards. A security director will not approve that, so it has to be provable that it only looks at barcodes. When a person comes into view the camera pauses before any frame is read, a small "PERSON DETECTED · CAMERA PAUSED" shows, and every 5 s it takes one test frame to see if they are gone. Every step goes to a plain text audit log: what was read, what was asked from the ERP, when it paused and resumed. Only allow-listed label formats are accepted (GS1 SSCC with demo prefix 952, and our own bin codes), anything else is dropped without logging. There is no network module in the project at all, so on SPECS the platform itself would block it if someone added one next to the camera.

Who it is for: [fill: who you had in mind, e.g. warehouse operators doing shelf checks, and the security / IT people who have to approve a camera on the floor].

In the preview the labels are virtual and "reading" means looking straight at the shelf. The person is a simple hi-vis figure walking a loop. Real barcode decoding and real person detection are the next step and only real glasses can tell if they are fast enough. The ERP is a small local web app I made for this (fake data, fictional companies like Stark Industries and Cyberdyne), it prints the labels and exports the json the Lens reads.

How it was made: I planned it with the plan-lens skill (an interview, then a design brief in the devpost folder), and Claude Code built it in Lens Studio through CLAD and the Lens Studio MCP. Five LEAF tests, one per done criterion in the brief, all pass in the preview.

What I learned: [fill: your own points. Candidates from this build, keep only the ones that are true for you: text sizes in AR are hard to judge from code, the first build had about 3 cm letters and needed tuning; look down for 4 s felt too long, now 2 s at 60 degrees; the stand-in person was in view most of the time at first, so the demo never showed callouts; on an additive display a dark backing behind text costs nothing on the glasses but makes the video readable.]

## Video script (under 3 min)

Screen recording of the Lens Studio preview, Logger panel visible next to it. Voice over in your words; the lines below are a starting point.

| Time | Picture | Voice |
|---|---|---|
| 0:00-0:15 | Racks in preview, nothing on screen | "This is Blinders. Safety glasses that check shelves against the ERP. And a camera that can prove it only looks at barcodes." |
| 0:15-0:35 | ERP mockup in the browser, printed labels | "I made a small fake ERP for this. It has bins, materials, boxes with SSCC codes, and it exports a json the Lens reads. No network." |
| 0:35-1:05 | Mode 1. Look at A-01-01: "Seems empty" callout. Look at B-01-01: nothing | "Mode 1 is what an operator would use. Empty shelf, it tells what should be there. This shelf matches, so nothing shows." |
| 1:05-1:35 | Look down 2 s, ring fills, menu, gaze on 2. Sweep rack A and B | "Look down to change mode. Mode 2 shows everything: wrong shelf, expiring, count, open ERP action, unknown label. Green dot means matches the ERP." |
| 1:35-2:10 | Person walks in. Callouts gone, pill shows. Zoom on Logger: PAUSED, recheck, RESUMED | "When a person comes into view the camera stops before reading anything. The log shows what was sent and when it paused. Every 5 seconds one test frame, and it resumes when they are gone." |
| 2:10-2:40 | Claude Code terminal, devpost/design-brief.md, LEAF panel with 5 passed | "Planned with the plan-lens skill, built with Claude Code through CLAD and the Lens Studio MCP. Five LEAF tests from the brief's done criteria, all pass." |
| 2:40-2:55 | Back to racks | "Barcode reading and person detection are stand-ins in the preview. [fill: what's next for you, one sentence]" |

On screen at 0:35, once: "Preview stand-in: a label counts as read when you look at it. Shelves, boxes and the person are virtual."
