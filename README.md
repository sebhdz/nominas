# ¿Cuánto gana mi profe?

An independent portal for finding the reported remuneration of professors and staff at public universities in Mexico. Help people find a person, read their reported pay, and share the result. Actual coverage comes from the prepared data included in this repository, not a claim of complete national coverage.

The website is static Astro with CSS and browser JavaScript. Payroll preparation is a separate local Node.js tool. Payroll browsing has no runtime backend or database. The separate [AWS opinion service](aws/README.md) stores public opinions and uses Turnstile; it is not required to browse payrolls.

## Find your task

| You need to… | Read |
| --- | --- |
| Understand principles, scope, and human responsibility | [Project guidance](AGENTS.md) |
| Add a university or update an existing university's data | [Payroll preparation](scripts/nominas/README.md) |
| Prepare or update teacher performance evaluations | [Evaluation preparation](scripts/evaluaciones/README.md) |
| Extend behavior, understand data contracts, or add a screen | [Architecture](ARCHITECTURE.md) |
| Change appearance or interaction design | [Visual design](DESIGN.md) |
| Publish or verify production behavior | [Deployment](DEPLOYMENT.md) |

Data instructions are intended to be usable without understanding application code. For code changes, the architecture guide explains responsibilities and extension points; read the relevant implementation and tests before editing. Documentation does not replace code inspection or decide unapproved product behavior.

## Run locally

Use the Node.js version required by [package.json](package.json). From the repository root:

```sh
npm install
npm run dev
```

Open the URL printed by Astro. `/` is the university directory; `/nomina/?university=<id>` is the one shared payroll page. No university-specific HTML page or institution registry is needed.

```sh
npm test
npm run build
npm run preview
```

The build reads versioned prepared data and writes `dist/`. It does not download or prepare payrolls, deploy, or grant production approval. A fresh checkout can build using `data/processed/` without the local raw downloads. Follow the owning guide above for your task and the validation requirements in [AGENTS.md](AGENTS.md).

Repository: [sebhdz/nominas-uaa](https://github.com/sebhdz/nominas-uaa). Keep documentation concise: link to the document that owns a rule instead of copying it. Describe current behavior, distinguish pending configuration from implemented features, and keep user-facing copy in Spanish.
