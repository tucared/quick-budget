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

- The cloud security proxy requires special browser launch flags for agent-browser:
  ```bash
  npx agent-browser --proxy "$HTTP_PROXY" --proxy-bypass "localhost,127.0.0.1" --executable-path "$(find /opt/pw-browsers/chromium-*/chrome-linux -name chrome -type f 2>/dev/null | head -1)" open http://localhost:3000 --ignore-https-errors
  ```
- To test mobile viewports after opening, run:
  ```bash
  npx agent-browser set viewport 402 714   # Safari on iOS
  npx agent-browser set viewport 427 804   # Firefox on Android
  ```
- `src/instrumentation.ts` configures Node.js to route server-side fetch through the proxy (via undici `EnvHttpProxyAgent`)
- The dev server is started with `NODE_TLS_REJECT_UNAUTHORIZED=0` to accept the proxy's TLS certificates
- Seeds are committed directly in `supabase/seeds/` with fake data
- Database schema is declarative: edit files in `supabase/schemas/`, then run `supabase db diff -f migration_name` to generate a migration. **From a cloud session without local Docker, you can skip step 2: just commit the schema change and push. The `Generate Migration from Schema` GitHub Action (`.github/workflows/generate-migration.yml`) runs `supabase db diff` and auto-commits the generated migration to your PR branch — pull the bot's commit before continuing work locally. The action is a no-op if your schemas are already in sync with the migration chain (e.g. you wrote the migration by hand).**
- After modifying the database schema, regenerate TypeScript types with `npm run types:generate`
- ESLint is configured using the flat config format in `eslint.config.js`. Run `npm run lint` to check for issues
- `npm run lint` runs ESLint only — it does not invoke `tsc`. Run `npm run typecheck` after touching TS types, component props, or memo return shapes; otherwise structural type errors only surface during `npm run build` (or on Vercel)
- Local credentials: `user1@example.com` / `password1` (see `supabase/seeds/01_create_users.sql`)

## Browser agent guardrails

- **Dialog overlays block clicks.** Dialogs render a full-screen overlay with `pointer-events: none` on elements behind it. Never try to click the backdrop to dismiss — use the Cancel/X button inside the dialog, or press Escape.
- **Test data cleanup.** If a UI action (e.g., deleting an expense) fails or times out during testing, do not retry the same broken flow in a loop. Fall back to SQL cleanup via `mcp execute_sql` immediately.
- **Seed data awareness.** Creating real expenses during testing affects budget summaries and category totals. Clean up test data immediately after verification, preferably via SQL.
