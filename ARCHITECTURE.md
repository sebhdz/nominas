# Architecture and extension points

Start with the [README](README.md). Follow [project guidance](AGENTS.md) for scope and human decisions, the [pipeline guide](scripts/nominas/README.md) for input/prepared data, and [DESIGN.md](DESIGN.md) for visual rules. This document owns application structure and browser contracts, not source preparation or deployment procedures.

## Execution boundaries

```text
Payroll preparation: PNT JSON → scripts/nominas/ → data/processed/ + local reports
Pension preparation: data/pensions/raw/*.json → scripts/pensiones/ → data/pensions/processed/
Static build:        prepared data → catalog + payroll/pension search JSONs + HTML pages
Browser:             catalog → selected dataset → shared search/area + dataset-specific filters
```

Preparation runs only when invoked manually. The build reads prepared files already in the repository; it does not need raw downloads. Payroll browser requests retrieve static files, not a runtime API or filesystem listing. The separate [opinion service](aws/README.md) uses AWS and Turnstile; it is not part of payroll loading or preparation. Only each institution's latest prepared year is emitted. Older years may remain in Git but are not accessible as historical pages or search files.

## Responsibilities

| Location | Responsibility |
| --- | --- |
| [src/lib/payroll.js](src/lib/payroll.js) | Discover institution/year directories, validate the selected prepared file, build catalog metadata, and project prepared records into browser fields. |
| [src/pages/data/universities.json.js](src/pages/data/universities.json.js) | Generate the static catalog during build. |
| [src/pages/data/[university]/[year].json.js](src/pages/data/[university]/[year].json.js) | Generate static search files for catalog entries. Dynamic file paths do not imply a runtime server. |
| [src/pages/index.astro](src/pages/index.astro) | Discover institutions at build time and pass them to the directory component. |
| [UniversityDirectory.astro](src/components/UniversityDirectory.astro) | Directory composition, local styles, and browser filtering by institution name or identifier. |
| [src/pages/nomina.astro](src/pages/nomina.astro) | One shared payroll document, controls, table, and person dialog. |
| [src/scripts/search.js](src/scripts/search.js) | Load the selected dataset, bind controls, render results, paginate, manage the dialog, and preserve URL state. It expects the payroll page's DOM; do not load it on unrelated pages. |
| [src/scripts/search-utils.js](src/scripts/search-utils.js) | Pure normalization, record filtering, and sorting. It does not manage DOM, network requests, URL state, or browser history. |
| [Page.astro](src/layouts/Page.astro) | Shared document/head, marquee, skip link, and footer. |
| [Footer.astro](src/components/Footer.astro) | Footer markup and local styles. |
| [src/styles/global.css](src/styles/global.css) | Theme variables and shared/payroll styles. Directory-specific styles stay in its component. |

Discovery chooses the highest four-digit directory name under each prepared institution. A missing, blocked, empty, or mismatched selected file fails the build; it does not silently select an older year. Browser title, institution, reporting period, and source dates derive from the selected data. Display formatting does not modify prepared files.

## Static JSON contracts

The source of these projections is `src/lib/payroll.js`. Changing a contract requires reviewing its producers, browser consumers, and relevant tests together. Prepared record fields are defined in the pipeline guide; they are not the browser contract.

### Catalog: `/data/universities.json`

An array with one entry per institution:

| Field | Type and meaning |
| --- | --- |
| `id` | String; institution directory identifier, matched exactly against the URL. |
| `name` | String; published institution name with the portal's leading three-letter region/scope prefix removed when present. |
| `year` | Four-digit string; latest prepared year. |
| `period` | Object with ISO `inicio` and `fin` reporting dates. |
| `updates` | Sorted array of distinct nonempty ISO source update dates. |
| `records` | Number of records, not verified unique people. |
| `url` | Static payroll search-file path `/data/<id>/<year>.json`. |
| `pensionUrl` | Static pension search-file path `/data/pensions/<id>.json`, or `null` when no prepared pension dataset exists. |

The directory is rendered from payroll discovery. The payroll controller fetches the catalog, looks up `university`, then fetches that entry's `url`. Pension URLs are joined only for matching payroll institutions; pension-only institutions do not enter the university directory. Missing/unknown identifiers produce a directory-oriented message; no different institution is loaded as a fallback. The Pensionados tab is present but disabled when `pensionUrl` is `null`; no unavailable or zero-record claim is implied.

### Pension search file: `/data/pensions/<id>.json`

PNT source files are stored in `data/pensions/raw/<ID>-pensiones.json`; `scripts/pensiones/` writes prepared files to `data/pensions/processed/<id>/pensiones.json`. The build discovers prepared files and emits `{ records, notes }`: a reduced array of person-level rows plus distinct source notes shown once above the results. Files containing only anonymous/explanatory rows do not create a static search route or enable the Pensionados tab. Source rows without a person name remain in prepared data but are not represented as people in the search file. Each browser record contains a source-hash/row ID, full name, area, pension type/status, reported amount, source periodicity, reporting period, and source update date. Amounts are not converted across periodicities or inferred as gross/net unless the source explicitly establishes that distinction. The page shares text search and area filtering between tabs; pension type/status filters and reported-amount ordering apply only to Pensionados, while professor-group filters and gross-pay ordering apply only to Nómina.

### Search file: `/data/<id>/<year>.json`

An array of browser records:

| Field | Type and source |
| --- | --- |
| `id` | String: first 16 characters of the original SHA-256, a hyphen, and source row number. Identifies a source row, not a persistent employee. |
| `nombre` | String; full display/search name assembled from published components. |
| `nombres`, `apellidos` | Strings for two-line display. When the given-name field already ends with the complete available surname sequence, the display avoids appending it twice. Missing components are not filled. |
| `puesto` | String or null; source `cargo` when present, otherwise source `puesto`. |
| `puesto_base` | String or null; original source position description (`puesto` in prepared data). |
| `area` | String or null; source affiliation. |
| `bruto`, `neto` | Numbers or null; prepared monthly remuneration values, without recalculation. |
| `actualizacion` | ISO source update date or null, per record. |

The browser formats names/labels for readability, amounts in MXN, and missing amounts as “Sin dato”. Null gross amounts sort after numeric amounts in either direction. The search file omits original notes and benefit subtables; do not infer their content from the reduced projection.

## Current search and URL behavior

`search.js` owns URL serialization (`queryURL`) and restoration (`restoreLocation` and `restorePerson`). Keep those responsibilities in the browser controller; the pure helpers receive filter values, not URL state.

All terms must appear somewhere in the combined name, area, displayed role, or base position description. Matching ignores case and accents. Area is an exact source-value filter. Group and area filters combine with the text query; sorting follows filtering. The existing professor helper uses base position, falling back to displayed role; its classification limits belong in [DESIGN.md](DESIGN.md).

| Query parameter | Meaning |
| --- | --- |
| `university` | Required catalog identifier. Preserved in search and record links. |
| `q` | Text query; omitted when empty. |
| `area` | Exact source area; omitted when unset. |
| `grupo` | `professors` or `others`; absent means all records. |
| `orden` | `menor` for gross ascending; absent means gross descending. |
| `persona` | Source-row identifier to open the dialog. |

Pagination uses 15 records and is not encoded in the URL. Changing search/filter/order resets pagination and removes the open-record parameter. Opening a record adds `persona`; closing it removes it. Browser back/forward restores the supported state. The latest year comes from discovery, not a `year` URL control.

A link shared before replacing a download can stop finding its row because the source hash changes. Once a newer year is selected, an older row identifier may likewise be absent. The current page displays a missing-record message and allows name search; it does not redirect to another person or retrieve historical data. This is a current link limitation, not a historical-profile feature.

## Extend behavior

For an approved payroll filter:

1. Confirm the requested source field and match semantics with the human requirement; do not silently substitute `puesto` for `puesto_base` or introduce a classification.
2. Check the browser contract above. Change the build projection only if a required field is absent; preparation is not where browser filter state belongs.
3. Add the control to `nomina.astro`, bind its state/loading/reset behavior in `search.js`, and implement pure filtering in `search-utils.js`.
4. If the filter must be shareable, update URL serialization and restoration together. Preserve institution selection, combined filters, pagination reset, and existing loading behavior.
5. Add focused behavior tests in the relevant existing test files, then follow [project validation rules](AGENTS.md).

This is an extension route, not approval for a particular new filter. Read the implementation before editing; documentation does not enumerate every handler or prescribe undefined product semantics.

## Add a screen

Astro uses files under `src/pages/` as routes: `src/pages/acerca.astro` would generate `/acerca/`. No route registry is required. Use `Page.astro` as the outer layout; it already provides `<html>`, `<head>`, `<body>`, banner, and footer. Do not duplicate them inside a page.

The layout accepts `title` (document title; defaults to the project brand) and `showDefinitions` (footer dictionary; defaults to true). The directory passes `showDefinitions={false}` for its simplified footer; the footer itself still comes from the layout. Page content goes in the default slot. Optional head content goes in the named `head` slot; use a `Fragment` for processed script content, following the payroll page. No other layout props are currently implemented.

The current skip link targets `#search`. A screen without a search control needs a deliberate accessible target/layout adjustment; there is no configurable skip-target prop yet. Do not invent a search field merely to satisfy this assumption.

Use locally scoped Astro `<style>` blocks for screen/component styles and existing CSS variables for shared values. Change global CSS only for genuinely shared rules. A static content page needs no browser controller; add JavaScript only for an actual interaction. Extract a component for an independent responsibility or reuse, not as a mandatory wrapper for every new page.

Run the required checks, inspect the generated route in `dist/`, and verify its URL through `npm run preview`. Check relevant mobile/desktop views when authorized browser access is available. The owning validation rules remain in [AGENTS.md](AGENTS.md).
