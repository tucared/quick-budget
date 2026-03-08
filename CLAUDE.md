# Project guidelines

- Read @PROGRESS.md when JTBD are mentionned
- Read @DATA_MODEL.md when planning for data changes
- Read @README.md to know about the stack and how to launch server
- Keep all *.md files mentionned up to date when you perform changes or see drift

# Development guidelines

- Use Supabase MCP instead of docker for interacting with the database
- Use the `dogfood` skill for exploratory UI testing (test one viewport in general, 2 for larger changes)
   - Safari on iOS: run `agent-browser --session <s> viewport 402 714` after `open`
   - Firefox on Android: run `agent-browser --session <s> viewport 427 804` after `open`

## Cloud environment (Claude Code web)

- The cloud security proxy requires special browser launch flags for agent-browser:
  ```bash
  npx agent-browser --proxy "$HTTP_PROXY" --proxy-bypass "localhost,127.0.0.1" open http://localhost:3000 --ignore-https-errors
  ```
- To test mobile viewports after opening, run:
  ```bash
  npx agent-browser --session <s> viewport 402 714   # Safari on iOS
  npx agent-browser --session <s> viewport 427 804   # Firefox on Android
  ```
- `src/instrumentation.ts` configures Node.js to route server-side fetch through the proxy (via undici `EnvHttpProxyAgent`)
- The dev server is started with `NODE_TLS_REJECT_UNAUTHORIZED=0` to accept the proxy's TLS certificates
- Seeds are committed directly in `supabase/seeds/` with fake data
- Database schema is declarative: edit files in `supabase/schemas/`, then run `supabase db diff -f migration_name` to generate a migration
- After modifying the database schema, regenerate TypeScript types with `npm run types:generate`
- ESLint is configured using the flat config format in `eslint.config.js`. Run `npm run lint` to check for issues
- Local credentials: `user1@example.com` / `password1` (see `supabase/seeds/01_create_users.sql`)
