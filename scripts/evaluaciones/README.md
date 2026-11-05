# Teacher evaluation preparation

Prepare teacher performance evaluation spreadsheets locally using Node.js, with no external dependencies. The tool generates a processed JSON file per institution and preserves the original spreadsheet locally; it does not run during website builds or deployment.

Read [project guidance](../../AGENTS.md) for data fidelity and human production approval. See the [root README](../../README.md) for setup and [architecture](../../ARCHITECTURE.md) for how prepared data becomes browser data.

## Accepted input and scope

The pipeline reads `data/evaluations/raw/Evaluacion_Docentes_UAA.xlsx` using Node's built-in `node:zlib` decompression on the standard `.xlsx` XML structure (`xl/sharedStrings.xml` and `xl/worksheets/sheet1.xml`).

The worksheet (`Hoja1`) must contain a header row with `NOMBRE` and `PUNTOS` columns (matched after normalizing case, accents, and whitespace). Summary or trailing formula rows without a teacher name in `NOMBRE` are ignored; any named row with a missing or non-numeric score in `PUNTOS` fails preparation explicitly.

## Quick start

1. Place `Evaluacion_Docentes_UAA.xlsx` inside `data/evaluations/raw/`.
2. From the repository root, run:

```sh
npm run evaluaciones:prepare
```

3. The script writes `data/evaluations/processed/uaa.json` without changing or deleting the original spreadsheet.
4. Run `npm test` and `npm run build` to verify that the processed evaluations link cleanly into the static dataset (`/data/uaa/<year>.json`).

## Directory layout

```text
data/evaluations/raw/Evaluacion_Docentes_UAA.xlsx   (local, preserved)
data/evaluations/processed/uaa.json                 (versioned in Git)
```

`data/evaluations/raw/` retains only `.gitkeep` in Git; raw files in `data/evaluations/raw/*` are ignored by `.gitignore`. A fresh checkout builds from `data/evaluations/processed/uaa.json` without needing the original spreadsheet.

## What preparation does

1. **Hash and provenance**: Records the relative source path (`data/evaluations/raw/Evaluacion_Docentes_UAA.xlsx`) and its SHA-256 digest before parsing.
2. **Name normalization and grouping**: Collapses repeated whitespace and normalizes accents and case (`normalizeEvaluationName` in [`prepare.js`](prepare.js)) so rows with the same normalized name are grouped together; this does not verify identity or distinguish namesakes.
3. **Score averaging**: Rounds each row score and each teacher's arithmetic mean across appearances to two decimal places (`Math.round((value + Number.EPSILON) * 100) / 100`), avoiding IEEE-754 floating-point noise from Excel XML values.
4. **Output**: Writes the formatted JSON artifact to `data/evaluations/processed/uaa.json` without modifying or deleting the raw `.xlsx` input.

## Output contract

`data/evaluations/processed/uaa.json` contains:

| Field | Meaning |
| --- | --- |
| `version` | Schema version (`1`). |
| `identificadorInstitucion` | Institution identifier (`"uaa"`), matched against `data/processed/<id>`. |
| `periodo` | Source reporting label configured for this input (`2026-01`); independent of the payroll period. |
| `puntajeMaximo` | Maximum score scale (`40`). |
| `fuente` | Original relative path (`archivo`) and SHA-256 hash (`sha256`). |
| `filasEntrada` | Count of valid teacher evaluation rows processed from the sheet. |
| `totalPersonas` | Count of unique normalized teacher names in `registros`. |
| `registros` | Array of `{ nombre, nombreNormalizado, calificacion, evaluaciones }`. |

During `npm run build`, [`src/lib/payroll.js`](../../src/lib/payroll.js) matches evaluations to payroll rows by normalized name (`apellidos + nombres` or `nombres + apellidos`). This is a name match, not verified identity; namesakes may be confused. See the [browser contract](../../ARCHITECTURE.md#institutional-evaluations) for emitted fields.

The interface separates institutional evaluations from accumulated visitor opinions. It presents an equivalent score out of 10 (`calificacion / puntajeMaximo * 10`, displayed to two decimals), with the original scale underneath. Multiple matched source rows are explicitly labeled as an arithmetic average with their count and reporting period; a single row is labeled as one institutional result. No match means no evaluation display, never zero or a claim that the institution publishes no evaluations. Display conversion does not change the prepared scores.
