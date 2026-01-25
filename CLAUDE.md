# Project guidelines

- Read @PROGRESS.md when JTBD are mentionned
- Read @DATA_MODEL.md when planning for data changes
- Read @README.md to know about the stack and how to launch server
- Keep all *.md files mentionned up to date when you perform changes or see drift
- Supabase seeds follow the pattern `supabase/seeds/**/*.sql`

# Development guidelines

- Use Playwright MCP on a 402x714 mobile viewport to verify your changes before commiting
- Use Supabase MCP instead of docker for querying the db etc.
- DO NOT WRITE ANY migrations, just edit the initial migration file and run `supabase db reset`
- When editing the seeds, dont forget to update .template files as well
