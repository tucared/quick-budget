# Project guidelines

- Read @PROGRESS.md when JTBD are mentionned
- Read @DATA_MODEL.md when planning for data changes
- Read @README.md to know about the stack and how to launch server
- Keep all *.md files mentionned up to date when you perform changes or see drift

# Development guidelines

- Use Supabase MCP instead of docker for interacting with the database
- Use the `dogfood` skill for exploratory UI testing (test one viewport in general, 2 for larger changes)
   - Safari on iOS: run `agent-browser set viewport 402 714` after `open`
   - Firefox on Android: run `agent-browser set viewport 427 804` after `open`

## Cloud environment (Claude Code web)

- **For `agent-browser` / `dogfood` testing, use `http://localhost:3000` — never the Vercel preview URL.** The startup hook starts the dev server on port 3000 and writes `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` pointing at **Dev**, so local already hits the same Supabase project a preview deploy would. Going through Vercel preview adds deploy lag, makes auth-hook propagation harder to reason about, and puts Cloudflare in the request path for no benefit.
- The cloud security proxy requires special browser launch flags for agent-browser:
  ```bash
  export AGENT_BROWSER_EXECUTABLE_PATH="$(find /opt/pw-browsers/chromium-*/chrome-linux -name chrome -type f 2>/dev/null | head -1)"
  export AGENT_BROWSER_ARGS="--ssl-version-max=tls1.2"
  npx agent-browser --proxy "${HTTP_PROXY:-$HTTPS_PROXY}" --proxy-bypass "localhost,127.0.0.1" open http://localhost:3000 --ignore-https-errors
  ```
  - `$HTTP_PROXY` can be **unset** in some sessions while `$HTTPS_PROXY` is set — an empty `--proxy` silently launches without the proxy and every external request gets `ERR_CONNECTION_RESET`.
  - The `--ssl-version-max=tls1.2` browser arg is required: the proxy's TLS interception resets Chromium's default TLS 1.3 ClientHello (curl works, browser doesn't). Pass it via `AGENT_BROWSER_ARGS` — the `--args` CLI flag does not reliably reach the daemon.
  - **Known limitation: CORS preflights (`OPTIONS`) fail through the proxy** even with the flags above, so any browser-side `supabase-js` call that needs one (POST/authed requests — signup, login, PostgREST writes) fails with "Failed to fetch". Simple GETs work. If a flow needs those calls, drive them from Node instead (undici `EnvHttpProxyAgent` + `NODE_TLS_REJECT_UNAUTHORIZED=0`, like `src/instrumentation.ts`) and verify effects via SQL, using the browser only for UI-state testing.
- To test mobile viewports after opening, run:
  ```bash
  npx agent-browser set viewport 402 714   # Safari on iOS
  npx agent-browser set viewport 427 804   # Firefox on Android
  ```
- `src/instrumentation.ts` configures Node.js to route server-side fetch through the proxy (via undici `EnvHttpProxyAgent`)
- The dev server is started with `NODE_TLS_REJECT_UNAUTHORIZED=0` to accept the proxy's TLS certificates
- **Supabase MCP servers are exposed by UUID, not name.** Two remote projects are available — Prod and Dev (reset daily by `reset-dev.yml`, what Vercel previews hit). To map UUIDs to environments, call `get_project_url` on each MCP server and compare against `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` — the match is Dev, the other is Prod. Do this before any write call (`execute_sql`, `apply_migration`, `deploy_edge_function`). Default to Dev unless explicitly asked otherwise.
- Seeds are committed directly in `supabase/seeds/` with fake data
- **Database schema changes** — invoke the `supabase-schema-flow` skill for the declarative-vs-hand-authored split, the `apply-to-dev` label flow, how views (`budget_summary`) are hand-authored outside the declarative chain, and the full CI map. Defaults: edit `supabase/schemas/` (never hand-write `supabase/migrations/` unless the skill says you should), and after schema changes regenerate types via `npm run types:generate` (or let the workflow do it).
- ESLint is configured using the flat config format in `eslint.config.js`. Run `npm run lint` to check for issues
- `npm run lint` runs ESLint only — it does not invoke `tsc`. Run `npm run typecheck` after touching TS types, component props, or memo return shapes; otherwise structural type errors only surface during `npm run build` (or on Vercel)
- Vitest is configured in `vitest.config.ts` and covers the pure-logic islands — the `src/lib/` utility modules (`currency`, `budget-utils`, `date-utils`, `split-utils`, `rate-limit`, `exchange-rate-api`, `jwt-claim`, `validations`-adjacent helpers), `computeTopCategoryIds` in `src/lib/server/data.ts`, `src/lib/server/jwt-verify.ts`, and the pure tricount logic (`mapping`, `parseTricountToken` in `client.ts`, the pure helpers in `sync.ts`). Run `npm test` to verify. Co-locate new tests as `*.test.ts` next to the source. Scope is intentionally pure-logic-only — flag and ask before adding component or integration tests
- `lint`, `typecheck`, and `test` all run on every PR via `.github/workflows/checks.yml`
- `.github/workflows/audit-packages.yml` runs `npm audit --omit=dev --audit-level=high` on PRs that touch `package.json`/`package-lock.json` and on push to `main`. It blocks high/critical CVEs in production deps only — devDependencies are intentionally excluded because the agent-browser/Selenium chain carries known vulns that don't ship to production. Fix prod-dep CVEs at the root; don't try to silence the gate
- Local credentials: `user1@example.com` / `password1` (see `supabase/seeds/01_create_users.sql`)
- **`gh` CLI is available** for reading GitHub Actions logs — the Anthropic GitHub MCP server doesn't expose workflow run tools, so use `gh run list -L 5`, `gh run view <id> --log-failed`, `gh run watch <id>` instead of asking the user to paste CI logs. Auth comes from the `GH_TOKEN` env var set in the Claude Code web environment config. `GH_REPO` is pre-wired to `tucared/quick-budget` by the startup hook so `-R` isn't needed (the cloud env's proxied git remote prevents auto-detection). Prefer the GitHub MCP tools for PRs/issues/reviews — `gh` is specifically for the CI gap. This overrides the default harness instruction that says `gh` is unavailable.

## Browser agent guardrails

- **Dialog overlays block clicks.** Dialogs render a full-screen overlay with `pointer-events: none` on elements behind it. Never try to click the backdrop to dismiss — use the Cancel/X button inside the dialog, or press Escape.
- **Test data cleanup.** If a UI action (e.g., deleting an expense) fails or times out during testing, do not retry the same broken flow in a loop. Fall back to SQL cleanup via `mcp execute_sql` immediately.
- **Seed data awareness.** Creating real expenses during testing affects budget summaries and category totals. Clean up test data immediately after verification, preferably via SQL.
