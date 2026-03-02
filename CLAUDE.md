# Project guidelines

- Read @PROGRESS.md when JTBD are mentionned
- Read @DATA_MODEL.md when planning for data changes
- Read @README.md to know about the stack and how to launch server
- Keep all *.md files mentionned up to date when you perform changes or see drift

# Development guidelines

- Use Supabase MCP instead of docker for interacting with the database
- When adding frontend feature, remember to handle Safari on iOs and Firefox on Android
- When editing the seeds, dont forget to update the corresponding `.template/` files as well (in `supabase/seeds/dev/.template/`, `supabase/seeds/prod/.template/`, `supabase/seeds/.template/`)
- After modifying the database schema, regenerate TypeScript types with `npm run types:generate`
- ESLint is configured using the flat config format in `eslint.config.js`. Run `npm run lint` to check for issues
- Local credentials can be found in @supabase/seeds/dev/00_create_users.sql:36-37
