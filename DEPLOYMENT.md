# Deployment and performance

This document owns hosting, data distribution, performance, and audience measurement decisions. Start with the [README](README.md) for setup, [AGENTS.md](AGENTS.md) for project principles, and the [pipeline guide](scripts/nominas/README.md) for preparing source data.

## Agreed approach

- Host the static Astro build on Cloudflare Pages, using the maintainer's existing Cloudflare domain. No runtime backend is required.
- Store gzip-compressed prepared JSON in `data/processed/` in the repository. The pipeline writes it directly so contributors do not need a manual transfer step. Node decompresses it during build; no bucket, release-download workflow, or browser decompression library is required. Original downloads and preparation reports remain local; prepared records are not published automatically.
- Generate a separate static search dataset for each university's latest prepared year. A visitor loads only the selected university's data, with only the fields needed by the interface. Keep full preparation artifacts out of browser downloads. Routes and contracts belong in [ARCHITECTURE.md](ARCHITECTURE.md).
- Use Cloudflare's HTTP response compression, with supported algorithms negotiated by the browser. This is separate from gzip storage of prepared artifacts; original source downloads stay uncompressed and local.
- Use Pages' default asset caching and browser revalidation before introducing custom cache rules. Data updates must become visible without serving outdated data indefinitely; verify this after deployment.
- Use Cloudflare Web Analytics for visits, page views, and real-user performance measurements. Its browser script adds an external request; do not add other analytics tools without a human decision. Audience metrics are estimates, not exact counts of unique people.

HTTP compression reduces transfer size, not the amount of decoded JSON the browser processes. Prepared-artifact gzip reduces storage in Git; review it through local decompression, reports, and source comparison as described in the pipeline guide. Public benefit blocks load only when expanded. Additional performance machinery should follow measured needs rather than hypothetical scale.

## Implementation status

The pipeline exports prepared data into a directory included in Git. The static build discovers the latest institutional datasets and generates a university directory, a single shared payroll HTML page, and separate search files. Domain configuration, analytics activation, and deployed cache/compression verification remain pending. No account configuration or deployment has been performed.

## Configure Cloudflare Pages

Use the Git integration with the repository, so the build has the versioned prepared data. No Cloudflare adapter, runtime server, Wrangler dependency, or raw downloads are needed for this static site.

| Setting | Value |
| --- | --- |
| Repository | `sebhdz/nominas-uaa` |
| Framework preset | Astro |
| Root directory | Repository root |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Build environment | `NODE_VERSION=24` |
| Production branch | The branch approved by the maintainer for release; it must contain the current application and prepared data. |

In Workers & Pages, create a Pages project using the Git repository and these settings. Check the chosen branch before starting the build: choosing an older default branch can publish an older application even when the local feature branch works. Local changes are not part of a Git-triggered deployment until present in the remote revision being built. Obtain human production approval as described below before publishing data changes.

After the first deployment, check its `pages.dev` address, then associate the chosen domain under the project's Custom domains settings. Use that flow to configure the domain instead of creating a guessed DNS target manually. Domain and Pages project names are account-specific and are not yet recorded here.

Under the project's Metrics, enable Web Analytics. Pages injects its script on the next deployment; do not also add a second beacon manually.

Pages serves compressed responses when possible and uses ETags with browser revalidation by default. Start with that behavior rather than custom `_headers` rules. Provider behavior and deployed headers still need verification; a local build cannot establish that compression or analytics is active.

## Verify before launch

Obtain the explicit human go-ahead for the data changes being published, following [human responsibility](AGENTS.md#human-decisions-and-agent-autonomy). An agent can assist review; successful preparation, tests, and build do not replace approval. Do not assume that `pendiente_revision` is a software gate: the current build accepts nonblocked data and does not record approval.

1. Follow the [project validation requirements](AGENTS.md), build the site, and inspect `dist/`. Confirm that only intended website assets are included, with no raw downloads or preparation reports.
2. Check the selected university/year in the browser's Network panel. Confirm that other universities are not downloaded and that each response uses the expected JSON content type.
3. On the deployed site, inspect `Content-Encoding` and transferred versus decoded sizes to confirm compression. Local compression experiments do not prove deployed behavior.
4. Verify repeat-visit caching and the visibility of a newly deployed data version. Test on a mobile device or representative throttled connection, including search responsiveness after loading.
5. Enable Web Analytics once, verify that it records page views on the public domain, and check performance measurements. Script blockers can prevent reporting; analytics must not be required for search to work.

## Provider references

Consult current provider documentation before changing deployment settings or making capacity claims:

- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Astro build settings](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/)
- [Build environment and Node version](https://developers.cloudflare.com/pages/configuration/build-image/)
- [Default serving, compression, and cache behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Content compression](https://developers.cloudflare.com/speed/optimization/content/compression/)
- [Web Analytics for Pages](https://developers.cloudflare.com/pages/how-to/web-analytics/)
- [GitHub file and repository size guidance](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
