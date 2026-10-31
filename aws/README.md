# Opinion service (AWS)

Start with the [project principles](../AGENTS.md) and [application architecture](../ARCHITECTURE.md). Payroll browsing stays static. Lambda, DynamoDB and Hono store recommendations and salary opinions independently of payroll loading.

## Voting interface and Turnstile

The approved scope uses Turnstile **only to enable voting buttons in the browser**. It is an interface check, not server-side bot protection. The backend does not validate Turnstile tokens, and direct API requests can bypass the browser check. CORS does not change that limitation. Do not describe this as verified voters, one person per vote, or protection against AWS spending.

The university page starts a background widget on entry. Managed mode uses `appearance: 'interaction-only'`: automatic checks run quietly and the widget appears only if Cloudflare requires interaction. A successful check is reused when opening profiles. If the check is still pending or has failed when a profile opens, the background widget is removed and verification continues inside the modal so any required interaction stays accessible. Only one widget remains active. Buttons stay disabled until the widget succeeds and opinion counts load. Closing or changing profiles preserves the current verification; reloading the page starts fresh. No verification flag is persisted in browser storage. Requests are serialized in the dialog. Expiration or widget errors disable voting until verification succeeds again. Browsing payrolls does not require verification.

## Frontend configuration

Configure a Managed widget in Cloudflare Turnstile and authorize the site's hostname. Set `PUBLIC_TURNSTILE_SITE_KEY` in the frontend build environment, then rebuild/redeploy. This key is public and embedded in HTML. No Turnstile secret or hostname environment variable is used by Lambda.

For local development:

```sh
cp .env.example .env
npm run dev
```

Without the public key, voting buttons remain disabled. For widget experiments use Cloudflare's [official test site keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/), never production test keys. The visible always-pass key is `1x00000000000000000000AA`. Use an isolated API for manual voting tests: the API URL is currently configured in `src/scripts/votes.js`.

## Backend deployment

AWS CLI and SAM CLI are needed only for deployment:

```sh
sam build -t aws/template.yaml
sam deploy --guided
```

If the previous server-side Turnstile integration was deployed, deploy the simplified backend as well; removing environment variables alone will not remove its validation. `TURNSTILE_SECRET_KEY` and `TURNSTILE_HOSTNAME` are no longer used and can be removed from that Lambda's configuration.

The frontend currently calls a Lambda Function URL, while `template.yaml` creates an API Gateway HTTP API. Configure CORS on the entry point actually used. This change does not migrate endpoints.

| Method | Route | Responsibility |
| --- | --- | --- |
| GET | `/health` | Service health. |
| GET | `/votes/{prof_key}` | Public opinion counts. |
| POST | `/votes/{prof_key}` | Record, change or withdraw an opinion using `choice`, `category` and `voter_token`. |

## Checks and limitations

Run `npm test` and `npm run build`. Automated tests mock the widget and API, without live votes. They cover disabled buttons before verification, concurrent clicks, widget errors/expiration, missing configuration and stale responses when switching profiles. Check the widget manually on mobile and desktop after deployment.

The university/name identity and database counter concurrency behavior remain unchanged. AWS request/concurrency limits, cost monitoring and service shutdown are separate account-owner decisions; a browser-only widget does not enforce them.
