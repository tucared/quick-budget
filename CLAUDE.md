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

## Exchange Rate System

The app uses an API-based exchange rate system with database caching:

- **Table**: `exchange_rates` stores daily rates for each currency (not household-scoped)
- **API Route**: `/api/exchange-rates?currency=BRL&date=2024-01-15` fetches rates with caching
- **Client Function**: `fetchExchangeRateFromAPI(currency, date)` in `@src/lib/currency.ts`
- **Expense Form**: Automatically fetches correct rate when logging expenses (uses expense date, not today)

### For Historical Data Seeding

When importing historical expenses from CSV:
1. Run `npm run seed:transform` to generate expense SQL
2. Run `npm run seed:exchange-rates` to fetch historical rates for dates in your CSV
3. Run `npm run seed:reset` to apply everything

The `generate-exchange-rates.js` script:
- Reads `normalized/expenses.csv`
- Extracts unique (currency, date) pairs where currency != EUR
- Fetches historical rates from exchangerate.host API (free, no key needed)
- Generates `03_import_exchange_rates.sql` seed file
- Throttles to 100ms between API requests to avoid rate limiting

### Fallback Behavior

- If API fails, falls back to hardcoded rates in `FALLBACK_RATES_TO_EUR` (BRL, USD, GBP, etc.)
- Unknown currencies default to 1:1 with warning
- Historical expenses preserve their original exchange_rate (stored on expense record)
