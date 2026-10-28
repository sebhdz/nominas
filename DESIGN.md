# Visual design

Start with the [README](README.md) for contribution instructions and [AGENTS.md](AGENTS.md) for product principles. This document owns visual direction and current interface behavior; it does not define data preparation rules.

## Direction

Keep an editorial, youthful, direct presentation: a public-information strip, poster headline, brief description, wide search field, compact filters, results table, and footer. Avoid excessive decoration.

The brand is **¿Cuánto gana mi profe?**. **Nómina [university name]** identifies the selected institution above the question and in the document title. All institution names, reporting periods, and update dates come from the selected dataset. The top marquee repeats “Información pública”, without the project name or a pause button, and respects reduced-motion preferences.

## Palette

The design may evoke an institutional relationship without reproducing official branding, seals, or emblems. Salary colors do not express judgments about amounts.

| Role | Color |
| --- | --- |
| Sand background | `#EAE2D2` |
| Near-black ink | `#242321` |
| Mustard accent and salary column | `#D9AD42` |
| Dark mustard text on sand | `#86610E` |
| Warm-white rows | `#FFFEF8` |

Mustard accents the marquee, search action, salary column, footer statement, and open-source link. The headline accent uses dark mustard for contrast on sand, without a background strip. The final footer section has a dark background. Preserve contrast and readability.

## Typography and composition

The university directory has its own composition in `UniversityDirectory.astro`: a public archive with an editorial intervention. Use a compact brand masthead, oversized cropped “PÚBLICO” typography, one mustard consultation stamp, a brief italic annotation, and numbered university rows. Keep search visible early on mobile. The directory footer uses only the project closing; payroll definitions belong on the payroll page. This direction does not change the payroll table's visual rules below.

- Use a heavy condensed uppercase headline. Controls, column headings, and general body text use monospace. Georgia is reserved for editorial accents, including the introduction, dictionary terms, and footer statement. Table text uses sans serif, with condensed gross amounts. Do not add external font downloads.
- Use straight borders, simple blocks, and clear rules. Avoid shadows, gradients, decorative arrows, and extra elements competing with search. The directory's single consultation stamp is the approved decorative exception; do not add stickers to the payroll interface.
- On desktop, show name, position, area/department, and monthly pay. Give names priority: 22px sans serif, weight 700, line-height 1.3. The current interface splits published given names and surnames into two lines; preserve source accents and display interior name particles in lowercase. The full name remains available through the record details and accessible labeling.
- Payroll and pension tables share their table component, row renderer, name typography and responsive layout. Pension names retain the same two-line presentation, without implying a payroll detail or voting action.
- Position and area use bold centered sans serif. Gross pay is large and condensed, followed closely by its label and bold net pay. Open details from the name.
- At widths up to 700px, compact each row into information on the left and pay on the right, with corresponding headings. Preserve the light information background, mustard salary background, outer border, and row separators. Keep name and pay together without horizontal scrolling or duplicated rendering.

## Current interface behavior

The introduction reads: “Sueldos de profesores y funcionarios. Se pagan con dinero público, así que se leen con ojos públicos.” User-facing text stays in Spanish.

University pages provide two tabs: **Nómina** and **Pensionados**. Text search and area selection are shared and retained when switching tabs. Payroll search accepts names, positions, and areas. Default order is gross pay descending; a compact selector allows ascending order and retains the choice when searching, filtering, or sharing. Payroll filters are Todos, Profesores, Otros puestos, and area. Pension search covers names, pension type/status, and area; source notes remain in prepared data and are not displayed in the pension interface. Pension filters use source type/status and area. Pension amounts sort by the reported numeric value only, without periodicity conversion, and always display the source periodicity. The Pensionados tab is hidden when there are no pension records available; this does not imply zero pensioners. Show fifteen records per page; records are not verified unique people.

The current teacher filter matches source position descriptions beginning with PROF. or PROFESOR. It is a browsing aid, not an official classification or exhaustive identification of teaching duties. Area and department share a control because the source has one affiliation field. Do not assume this classification covers future institutions without a human decision.

## Footer

Use four dictionary-style definitions: nómina, fuente, bruto, and neto. Show one row on desktop and two columns on mobile, with compact mobile text and dotted dividers. Keep the independence statement outside the dictionary. Source update dates appear in individual record details, not in the footer.

Link the source directly to the Plataforma Nacional de Transparencia and the open-source seal to the repository. Place the editorial statement and project information in the dark final section, with the open-source link vertically centered alongside the text on desktop. Center the GitHub profile links in a wrapping row at the bottom. Avoid ASCII drawings, expandable source sections, and data download controls.
