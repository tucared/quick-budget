# Project guidelines

- Read the comments in `supabase/schemas/` when planning for data changes: they carry the invariants and gotchas the schema alone doesn't show
- Use the vocabulary of @GLOSSARY.md for domain terms
- Read @README.md to know about the stack and how to launch server
- Keep all *.md files mentionned up to date when you perform changes or see drift

# Development guidelines

- Use the `dogfood` skill for exploratory UI testing (test one viewport in general, 2 for larger changes)
   - Safari on iOS: run `agent-browser set viewport 402 714` after `open`
   - Firefox on Android: run `agent-browser set viewport 427 804` after `open`
- Use Supabase MCP instead of docker for interacting with the database
- Seeds are committed directly in `supabase/seeds/` with fake data
- **Database schema changes** — invoke the `supabase-schema-flow` skill for the declarative-vs-hand-authored split, the `apply-to-dev` label flow, how views (`budget_summary`) are hand-authored outside the declarative chain, and the full CI map. Defaults: edit `supabase/schemas/` (never hand-write `supabase/migrations/` unless the skill says you should), and after schema changes regenerate types via `npm run types:generate` (or let the workflow do it).
- ESLint is configured using the flat config format in `eslint.config.js`. Run `npm run lint` to check for issues
- `npm run lint` runs ESLint only — it does not invoke `tsc`. Run `npm run typecheck` after touching TS types, component props, or memo return shapes; otherwise structural type errors only surface during `npm run build` (or on Vercel)
- Vitest (`npm test`, config in `vitest.config.ts`) covers pure-logic modules only (`src/lib/`, `src/lib/server/`, pure tricount logic). Co-locate new tests as `*.test.ts` next to the source. Flag and ask before adding component or integration tests
- `lint`, `typecheck`, and `test` all run on every PR via `.github/workflows/checks.yml`
- `.github/workflows/audit-packages.yml` runs `npm audit --omit=dev --audit-level=high` on PRs that touch `package.json`/`package-lock.json` and on push to `main`. It blocks high/critical CVEs in production deps only — devDependencies are intentionally excluded because the agent-browser/Selenium chain carries known vulns that don't ship to production. Fix prod-dep CVEs at the root; don't try to silence the gate
- Local credentials: `user1@example.com` / `password1` (see `supabase/seeds/01_create_users.sql`)
- For `agent-browser` / `dogfood` testing against Dev, use `http://localhost:3000` with `.env.local` pointing at Dev — never the Vercel preview URL (deploy lag, harder-to-reason auth-hook propagation, Cloudflare in the path)
- `src/instrumentation.ts` routes server-side fetch through `HTTPS_PROXY`/`HTTP_PROXY` when set (via undici `EnvHttpProxyAgent`)

## Browser agent guardrails

- **Dialog overlays block clicks.** Dialogs render a full-screen overlay with `pointer-events: none` on elements behind it. Never try to click the backdrop to dismiss — use the Cancel/X button inside the dialog, or press Escape.
- **Test data cleanup.** If a UI action (e.g., deleting an expense) fails or times out during testing, do not retry the same broken flow in a loop. Fall back to SQL cleanup via Supabase MCP `execute_sql` if you have it.
- **Seed data awareness.** Creating real expenses during testing affects budget summaries and category totals. Clean up test data immediately after verification, preferably via SQL.

## Agent skills

### Issue tracker

GitHub Issues via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

# Claude Code only

On Claude Code web (cloud environment), read `docs/agents/cloud-environment.md` before starting the dev server, using `agent-browser`, or calling Supabase MCP.
