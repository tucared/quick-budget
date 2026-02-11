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

The app uses an API-based exchange rate system with on-demand caching:

- **API**: Uses ExchangeRate-API (requires `EXCHANGE_RATE_API_KEY` in `.env.local`)
- **Table**: `exchange_rates` is a cache populated automatically (starts empty)
- **API Route**: `/api/exchange-rates?currency=BRL&date=2024-01-15` fetches rates with caching
- **Client Function**: `fetchExchangeRateFromAPI(currency, date)` in `@src/lib/currency.ts`
- **Expense Form**: Automatically fetches correct rate when logging expenses

### How it works:

**Historical expenses (CSV import)**:
- Exchange rates are preserved from the original CSV export
- Stored directly on each expense record
- No need to populate exchange_rates table

**New expenses (app usage)**:
- On-demand: API route fetches rate when logging an expense
- Automatic caching: Rate is stored in `exchange_rates` table
- Efficient: Only fetches unique (currency, date) combinations once

### Fallback Behavior

- If API fails, falls back to hardcoded rates in `FALLBACK_RATES_TO_EUR` (BRL, USD, GBP, etc.)
- Unknown currencies default to 1:1 with warning
- Free API plan only provides current rates (historical rates require paid plan)
