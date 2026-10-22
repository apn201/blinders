# BLINDERS - Smart but safe

Video: [fill: YouTube link]
Code: https://github.com/apn201/blinders

## Tagline

Safety glasses that check warehouse shelves against the ERP, and stop looking when a person walks in.

## About the project

Blinders is safety glasses that check warehouse shelves against the ERP while you walk past. And they stop looking when a person walks in.

The operator looks at a rack. The glasses read the shelf label and the box labels, ask the ERP (local copy) what should be there, and stay quiet if it matches. If something is wrong, a short callout appears on the label: shelf seems empty, box belongs in another shelf, best before is close, count does not match, ERP has an open action. Mode 1 shows only the problems. Mode 2 shows everything, with a green dot on labels that match. Mode 0 is just glasses, camera off. Look down for 2 s to change the mode.

The part I care about is the camera. A camera in a warehouse sees people, screens and ID cards. A security director will not approve that, so it has to be provable that it only looks at barcodes. When a person comes into view the camera pauses before any frame is read and a small "PERSON DETECTED · CAMERA PAUSED" shows. Every 5 s it takes one test frame to see if they are gone. Every step goes to an audit log, one line per event: what was read, what was asked from the ERP, when it paused and resumed. Lines have sequence numbers, so a removed line shows as a gap. A small script counts a summary from the log (frames read while a person was in view, codes outside the allow-list, gaps). Only allow-listed label formats are accepted (GS1 SSCC with demo prefix 952, and our own bin codes), anything else is dropped without logging. There is no network module in the project at all, so on SPECS the platform itself would block it if someone added one next to the camera.

Who it is for: warehouse operators, production supervisors etc. but it could be fit also to work in other environments like pharmacies etc.

In the preview the labels are virtual and "reading" means looking straight at the shelf. The person is a simple hi-vis figure walking a loop. Real barcode decoding and real person detection are the next step, and only real glasses can tell if they are fast enough. The ERP is a small local web app I made for this (fake data, fictional companies like Stark Industries and Cyberdyne). It prints the labels and exports the json the Lens reads.

How it was made: I planned it with the plan-lens skill (an interview, then a design brief in the devpost folder), and Claude Code built it in Lens Studio through CLAD and the Lens Studio MCP. Five LEAF tests, one per done criterion in the brief, all pass in the preview.

What I learned: Building an ar app for smart glasses without glasses is easier than I thought. It has challenges, but different than I thought. CLAD and the MCP makes it surprisingly easy. Even a bit scary to so quickly develop on platform you have never used. I learned about the basic workflow, Lens Studio itself and also about SPECS themselves. Had not encountered it before.

## Built with

Lens Studio 5.24, Spectacles Interaction Kit, Spectacles UI Kit, LEAF, TypeScript, Node.js, Claude Code, CLAD
