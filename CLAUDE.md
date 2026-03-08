# Project guidelines

- Read @PROGRESS.md when JTBD are mentionned
- Read @DATA_MODEL.md when planning for data changes
- Read @README.md to know about the stack and how to launch server
- Keep all *.md files mentionned up to date when you perform changes or see drift

# Development guidelines

- Use Supabase MCP instead of docker for interacting with the database
- Use the `dogfood` skill for exploratory UI testing & remember to pass the `--viewport` flag to `agent-browser` (test one viewport in general, 2 for larger changes)
   - Safari on iOs (target 402x714)
   - Firefox on Android (target 427x804)
- When editing the seeds, dont forget to update the corresponding `.template/` files as well (in `supabase/seeds/dev/.template/`, `supabase/seeds/prod/.template/`, `supabase/seeds/.template/`)
- Database schema is declarative: edit files in `supabase/schemas/`, then run `supabase db diff -f migration_name` to generate a migration
- After modifying the database schema, regenerate TypeScript types with `npm run types:generate`
- ESLint is configured using the flat config format in `eslint.config.js`. Run `npm run lint` to check for issues
- Local credentials can be found in @supabase/seeds/dev/00_create_users.sql:36-37
