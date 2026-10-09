# Reading Studio

Use the existing checkout. Cloud tasks are isolated; do not create a worktree unless the user explicitly requests one.

Node 24 is required. Run `npm ci --cache /workspace/.npm-cache`, `npm run build`, `npm test`, and `npm run test:browser` for meaningful behavior changes. Browser tests use system Chromium, a separate production API process, a separate scheduler worker and an isolated database.

Keep exact source text, embedded full licenses and provenance hashes intact. Do not fabricate passages, page numbers, modern book access, factual charts or model output. Unknown permissions deny access; check cached editions too. Use prepared-editorial labels until a real provider and reviewed generation adapter are working.

Run the API and worker against the same SQLite file. The worker runs independently of the browser. Preserve idempotent occurrence keys, transactional creation and unique notifications. No browser timer may replace scheduled execution.

Check authorization server-side for every personal-resource endpoint and administrator route. Never print credential values, put secrets in bundles, or dump process environments. Account registration does not automatically grant admin based on an unverified email.

No paid subscriptions, domains, publisher contacts, billing activation or marketing messages are authorized by this prototype build. Sites is preferred if available and capable of running the persistent backend/worker. Do not claim hosting, AI generation or delivery from local validation alone.
