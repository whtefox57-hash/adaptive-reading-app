# Reading Studio

A working, US-only adaptive reading prototype. React and TypeScript provide an editorial reading surface; Express and Node 24's SQLite store accounts, editions, notes, preferences, routines, and server-scheduled occurrences. A separate worker prepares editions without an open browser.

## View and test in your browser

[Open this review version on GitHub](https://github.com/whtefox57-hash/adaptive-reading-app/tree/reading-studio-preview) · [Open in GitHub Codespaces](https://codespaces.new/whtefox57-hash/adaptive-reading-app?ref=reading-studio-preview)

To test the app, open the Codespaces link and choose **Create codespace**. The included configuration installs Node 24 dependencies, builds the app, seeds the library and starts both the web server and scheduling worker. Once setup completes, use **Ports → Reading Studio (3000) → Open in Browser** if the app did not open automatically. Keep the port private. Confirm US access and choose **Try a sample** to begin; no model key is needed.

The Codespaces link creates your own browser development environment; it is not an already-running public website. Availability and usage limits follow your GitHub account. The startup configuration and forwarded HTTPS-origin handling have been validated locally; a fresh GitHub Codespace has not been provisioned here. The worker runs while your Codespace is active, and its SQLite database remains inside that Codespace until you delete it.

![Reading Studio Today page on desktop](docs/screenshots/today-desktop.png)

<details>
<summary>Mobile reader and dark theme</summary>

<img src="docs/screenshots/reader-mobile.png" alt="Mobile reader showing a prepared introduction and exact original source passage" width="375" />
<img src="docs/screenshots/dark-mobile.png" alt="Reading Studio Today page in its dark theme on mobile" width="375" />

</details>

## Run

Requires Node 24.x, npm, and a writable persistent filesystem. No model key or delivery provider is required for the prepared library. Start commands enable Node’s documented environment-proxy support for authorized cloud routes, preserving TLS verification.

```bash
cd adaptive-reading-app
bash scripts/install.sh
bash scripts/start.sh
```

For development, run `npm run dev` and `npm run worker` in separate terminals. The web process defaults to port 3000. The startup script runs the production build, writes logs/PIDs in `.runtime`, checks the worker heartbeat, and can be repeated without starting duplicate managed processes. Each cloud task already has an isolated environment: use this checkout; do not create a worktree unless explicitly requested.

The five destinations are Today, Library, Journeys, Schedule, and Notebook. Preferences are accessible in the sidebar and top bar. Try the guest sample immediately after confirming US access, or register a test account (12-character minimum password), confirm timezone, and create a routine. Guest data is isolated by an HttpOnly browser cookie and expires after seven days on the worker. Account data is server-persistent, not localStorage, and follows authenticated logins across browsers.

## Implemented

- Ten substantial prepared starting points across three full source editions. Original text is retrieved from immutable stored spans. Prepared introductions, explanations and conceptual maps are explicitly labeled as editorial content, never live AI.
- Cold-start tag ranking, exclusions, explicit book choices, pins, continuity, duration assembly, feedback, memory disablement and personalization reset. Single-book mode advances chronologically through unopened prepared starting points. Starting weights are unvalidated defaults in `server/types.ts`.
- Expand/Condense, original-text mode, exact surrounding-source views and full source/license access, private notes, saved progress, source search, report-error flow, and reading history. Completion marks the edition, never the whole book. Coverage reports included source spans and a reading checkpoint, not comprehension.
- Multiple editable routines, timezone confirmation, seven-day preview, move/skip/replace/pause/delete, persistent occurrence keys, early preparation, atomic claims, limited retries, and bounded catch-up. A real separate Node worker runs every 30 seconds; browser timers are not used for scheduling.
- Account authorization, server-side admin authorization, rights checks on generation and cached access, plain-text admin ingestion, source hashes, usage limits, minimal event records, and account deletion.
- Warm ivory/dark themes, adjustable reading type, responsive layouts, keyboard controls, reduced motion, SVG concept maps with text alternatives. No unsupported numeric charts.

## Deliberate limitations

This is a prepared-content prototype, not a production AI service. There is no model connection in this instance. A replaceable OpenAI-compatible HTTPS adapter supports optional source-grounded questions and selected-section explanations/condensation when securely connected. It uses structured outputs, authorized source-window references, exact quotation checks, conservative quantity rejection, bounded context/response sizes and a timeout; output remains labeled fidelity-review-pending. It never generates original passages. Provider failures retain existing editions. Adapter tests use mocked transport, not live-provider verification. Scheduled editions currently use the prepared editorial pipeline, even when an optional model is connected. Source search without a model returns matching original paragraphs and makes no generated answer claim.

The default 15% discovery preference and original-text share are recorded, but automatic exploration sampling and adaptive summary allocation are not implemented. Depth contributes a simple ranking input. The finite prepared library eventually exhausts unread starting points and asks readers to choose another selection or explicitly request review. Importing a new source does not invent an edition: rights review and editorial preparation are still required.

Email/push delivery, password reset, email verification, audio, private uploads and billing are off. In-app readiness is functional and distinct from a sent notification. Travel follow mode requires confirming a detected timezone change. No modern bestseller manuscripts are supplied or licensed. Walter Isaacson and modern Napoleon biographies are reference-only taste requests.

Sources were retrieved from pinned GITenberg mirrors and their metadata, text hashes, embedded full licenses and US public-domain statements inspected. Direct official Gutenberg verification is pending because its domain was blocked at runtime. Worldwide clearance is not asserted. See `docs/SOURCES.md` and `data/sources/manifest.json`.

Sites is not connected in this workspace. No public deployment or shareable preview URL has been created. See `docs/DEPLOYMENT.md` for the requirements of an actual persistent full-stack deployment; a static-only host will not run the API or scheduler.

## Tests

```bash
npm run build
npm test
npm run test:browser
```

Browser tests use the system Chromium at `/usr/bin/chromium` (override `CHROMIUM_PATH`), a separate production server and a separate actual worker, with a fresh isolated SQLite database. Core tests use temporary databases and controlled clocks. See `docs/ACCEPTANCE.md` for outcomes and limits.

## Administration

Register the intended operator account in the app, then use server filesystem access:

```bash
npm run admin -- your-existing-account@example.com
```

The script grants admin authorization to that specific existing account. Ordinary registration never grants administration. Optional `ADMIN_EMAIL` plus securely injected `ADMIN_BOOTSTRAP_PASSWORD` reserve a bootstrap address and require that password; do not put this password in a checkout, command argument, or cloud draft. `MODEL_API_KEY` is never returned to the browser. Binding presence alone is not proof of provider access. This instance has no key and no live provider request has been made.

Catalog administration includes source status, evidence-backed rights state and expiry, plain-text import in unknown/denied rights state, failed jobs, editorial reports, actual provider status, worker heartbeat, and Run scheduler now. Imported sources need explicit per-use grants via the rights API; unknown use permissions deny access. Private tenant uploads are disabled.

## Configuration

| Variable | Meaning |
| --- | --- |
| `DATABASE_PATH` | Absolute SQLite path; default `.runtime/reading.sqlite`. API and worker must share it. |
| `PORT` | API port; default 3000. |
| `APP_ORIGIN` | Exact external HTTPS origin for cross-origin checks. |
| `COOKIE_SECURE` | Set `true` behind HTTPS. Local acceptance uses `false`. |
| `MAX_DAILY_EDITIONS` | Default 30, range 1–1000 per account per rolling 24 hours. |
| `GENERATION_INTERVAL_MS` | Minimum manual preparation interval, default 1000. |
| `MAX_SOURCE_CHARACTERS` | Administrator import limit, default/max 1,500,000. |
| `CHROMIUM_PATH` | Browser testing executable. |
| `MODEL_API_KEY` | Secure server-side/provider-proxy credential; absent in this instance. |
| `MODEL_API_BASE` | Authorized HTTPS OpenAI-compatible base; default `https://api.openai.com/v1/`. |
| `MODEL_NAME` | Replaceable model; default `gpt-4.1-mini`. |

Operational backup retention must be configured by the deployment operator. Account deletion cascades personal records in the live database; already-existing operator-managed backups require their own deletion/retention policy. Public source span records carry no user IDs and may remain as shared public-domain corpus data. See `docs/SCHEMA.md`.
