# Blinders

Smart glasses for the warehouse floor that are allowed to see one thing: labels. They check every box against the ERP: right shelf, not expired, right number of boxes. The moment a person enters the view, they go blind until that person leaves.

Entry for [Learn AR with SPECS](https://learn-specs.devpost.com/). Spec: [docs/SPEC.md](docs/SPEC.md). Build plan: [blinders-plan.md](blinders-plan.md).

## What is fake

All ERP data is fictional demo data. Companies are fictional (Stark Industries, Wayne Enterprises, Acme...). All GTINs and SSCCs use GS1 prefix 952, which GS1 reserves for demonstrations, so the codes are valid but belong to nobody.

## ERP mockup

A small local warehouse system the Lens reads from: material master, storage bins, stock by box, goods receipt, movement log, label printing.

```bash
npm install
```

```bash
npm run erp
```

Open http://localhost:4100. Transaction codes work in the command field (MIGO, LX02, MM03, LS03, MB51).

- Print shelf labels: LBL1, or http://localhost:4100/?sheet=shelf and print.
- Print box labels: LBL2, or http://localhost:4100/?sheet=box.
- Publish to Lens (LENS) writes `data/erp.json`, the only ERP data the glasses get.
- Reset the demo data: `npm run seed`.

## Tests

```bash
npm test
```
