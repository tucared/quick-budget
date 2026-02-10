# Project guidelines

- Read @PROGRESS.md when JTBD are mentionned
- Read @DATA_MODEL.md when planning for data changes
- Read @README.md to know about the stack and how to launch server
- Keep all *.md files mentionned up to date when you perform changes or see drift
- Supabase seeds follow the pattern `supabase/seeds/**/*.sql`

# Development guidelines

- Use Supabase MCP instead of docker for interactive with the database
- DO NOT WRITE ANY new migrations, just edit @supabase/migrations/20260116_initial_schema.sql and run `supabase db reset`
- When editing the seeds, dont forget to update @supabase/seeds/prod/.template files as well
- After modifying the database schema in migrations, regenerate TypeScript types with `npm run types:generate`
- ESLint is configured via `.eslintrc.json` (extends `next/core-web-vitals`). Run `npm run lint` to check for issues
