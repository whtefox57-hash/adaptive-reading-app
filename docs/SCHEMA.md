# Storage and authorization

The executable schema is `server/db.ts`. SQLite uses WAL, foreign keys and a five-second busy timeout; the web process and independent worker share the same database file on a persistent local volume. Do not put it on an unreliable network filesystem or start separate replicas with independent copies.

| Records | Purpose and scope |
| --- | --- |
| users, auth | Account/guest preferences and admin role; salted scrypt passwords; SHA-256 session-token hashes; expiry; HttpOnly SameSite cookies. |
| books, editions, rights | Separate books/source editions, full source, hashes, provenance and individual use grants; unknown/expired/blocked deny. |
| source_spans, templates | Exact source offsets and prepared editorial openings. Shared corpus is public US content only. |
| sessions | User-scoped edition blocks, source manifest, occurrence key, estimated duration, status, progress and expansion state. Stable after creation. |
| notes, feedback, reports | User-owned annotations, explicit reactions and editorial error reports. Admin may review reports; ordinary users cannot read another user's data. |
| routines, occurrences | User-scoped recurrence intent, IANA timezone, revisions, UTC schedule, stable unique occurrence key, status, retries/backoff. |
| notifications | One row per occurrence. Current status is in-app-ready, never email-sent. |
| events | Minimal event name and timestamp, never private reading/annotation text. |
| generation_jobs | User-owned optional model requests, preparing/ready/failed states, source-window manifest, model/prompt version, token usage when returned, unknown cost and editorial-review status. |
| worker_status | Actual independent worker heartbeat and tick result. |

Routine occurrence keys include routine ID, revision and intended local date/time. Materialization is INSERT OR IGNORE. Worker preparation and session creation are transactional, with a unique occurrence reference on sessions and a unique notification occurrence key. A five-minute stale preparing lease can be retried. Retries use one-, two- and four-minute backoff, capped at three attempts. Generation is bounded to ten jobs per tick and a 24-hour catch-up window. Editing invalidates obsolete future jobs; history remains. Spring gaps move to the next valid minute; autumn repeats pick the first occurrence once.

API ownership checks apply to session, routine, occurrence and note operations. Administrator endpoints check a server-side role. Shared source endpoints require authentication and current territory/display rights; they expose only public-source content, not private manuscripts. Private uploads are disabled. Imports are plain text, bounded and reject active embeds. React renders text as text, not HTML. SQL values use bound parameters. Authentication is rate-limited; preparation has interval/daily limits. Mutating requests reject foreign origins and cookies use SameSite strict; HTTPS deployments must set APP_ORIGIN and COOKIE_SECURE.

Account deletion cascades all personal rows, including notes, sessions, routines/occurrences, reports, feedback, auth and analytics. Guest cleanup runs in the worker at seven days. Public span rows have no user identifiers and remain corpus artifacts. The application has no personal-data retention exception; deployment backups/logs are an operator-managed concern and require a policy before real users are invited. SQLite WAL backups must be taken with a consistent SQLite backup mechanism, not by copying a live database alone.
