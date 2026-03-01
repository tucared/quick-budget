# Project guidelines

- Read @PROGRESS.md when JTBD are mentionned
- Read @DATA_MODEL.md when planning for data changes
- Read @README.md to know about the stack and how to launch server
- Keep all *.md files mentionned up to date when you perform changes or see drift
- Supabase seeds follow the pattern `supabase/seeds/{dev,prod}/**/*.sql`

# Development guidelines

- Use Supabase MCP instead of docker for interactive with the database
- DO NOT WRITE ANY new migrations, just edit @supabase/migrations/20260116_initial_schema.sql and run `supabase db reset`
- When editing the seeds, dont forget to update the corresponding `.template/` files as well (in `supabase/seeds/dev/.template/`, `supabase/seeds/prod/.template/`, `supabase/seeds/.template/`)
- After modifying the database schema in migrations, regenerate TypeScript types with `npm run types:generate`
- ESLint is configured using the flat config format in `eslint.config.js`. Run `npm run lint` to check for issues
- Local credentials can be found in @supabase/seeds/dev/00_create_users.sql:36-37

## Exchange Rate System

The app uses an API-based exchange rate system with on-demand caching:

- **API**: Uses [Frankfurter](https://www.frankfurter.dev) (free, no API key, ECB data) — **no env var needed**
- **Table**: `exchange_rates` is a cache populated automatically (starts empty)
- **API Route**: `/api/exchange-rates?currency=BRL&date=2024-01-15` fetches rates with caching
- **Client Function**: `fetchExchangeRateFromAPI(currency, date)` in `@src/lib/currency.ts`
- **Expense Form**: Automatically fetches correct rate when logging expenses
- **Weekend handling**: Dates falling on Sat/Sun are adjusted to the preceding Friday (ECB doesn't publish rates on weekends)
- **Fallback**: If Frankfurter is unreachable, hardcoded approximate rates are used; these are **not cached** so the next request retries the API
