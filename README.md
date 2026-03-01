# Quick Budget

Fast expense tracking and flexible budgeting for partners.

## Local Development Setup

### Prerequisites

- Node.js 18+
- Docker Desktop ([download](https://docs.docker.com/desktop/))
- Supabase CLI: `brew install supabase/tap/supabase`

### Quick Start

```bash
# Install dependencies
npm install

# Start Supabase (first run takes ~3 min to download images)
supabase start

# Start dev server
npm run dev
```

Visit http://localhost:3000

Default credentials are configured in `supabase/seeds/prod/scripts/config.local.js`.

### Development URLs

- **App**: http://localhost:3000
- **Database UI**: http://localhost:54323 (Supabase Studio)
- **Email Testing**: http://localhost:54324 (Mailpit)
- **API**: http://localhost:54321/rest/v1

## Key Commands

```bash
# Supabase
supabase start              # Start all services
supabase stop               # Stop all services
supabase status             # View connection info
supabase db reset           # Reset database + reapply migrations + seed

# Database
supabase migration new name # Create new migration
open http://localhost:54323 # Open Supabase Studio

# Development
npm run dev                 # Start Next.js dev server (port 3000)
npm run build               # Build for production
npm run lint                # Run ESLint
npm run types:generate      # Generate TypeScript types from database schema
```

## Project Structure

```
src/
├── app/                    # Next.js pages (App Router)
│   ├── expenses/          # Expense tracking page
│   ├── login/             # Login page
│   └── page.tsx           # Landing page
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── expense-form.tsx   # Expense entry form
│   └── expense-list.tsx   # Recent expenses list
├── lib/
│   ├── supabase.ts        # Supabase client (browser + server variants)
│   ├── types.ts           # Application types + localStorage helpers
│   ├── database.types.ts  # Generated Supabase database types
│   ├── validations.ts     # Zod schemas
│   ├── currency.ts        # Currency formatting + fetchExchangeRateFromAPI()
│   ├── exchange-rate-api.ts # Frankfurter API client (server-side)
│   ├── utils.ts           # Utilities
│   ├── contexts/
│   │   └── user-context.tsx # UserProvider + useUser() hook (client auth)
│   ├── hooks/             # Custom React hooks (e.g. useExpenseSubscription)
│   └── server/
│       └── data.ts        # Server-side data fetching utilities

supabase/
├── migrations/            # Database migrations
├── seeds/
│   ├── dev/              # Dev-only seeds (user creation with passwords)
│   ├── prod/             # Shared seeds (categories, historical data)
│   └── prod-setup.sql    # Production household merge (manual, no passwords)
└── config.toml           # Supabase config
```

## Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **UI**: shadcn/ui (Radix UI + Tailwind v4)
- **Forms**: React Hook Form + Zod
- **Deployment**: Vercel (see [DEPLOYMENT.md](./DEPLOYMENT.md))

### Tailwind CSS v4 Configuration

This project uses Tailwind CSS v4 with CSS-first configuration:
- Configuration is in `src/app/globals.css` via `@theme inline` directive
- No JavaScript config file needed (`tailwind.config.ts` has been removed)
- Uses `tw-animate-css` for animations (replaces `tailwindcss-animate`)

### ESLint Configuration

This project uses ESLint v9 with the flat config format:
- Configuration is in `eslint.config.js` (Next.js 16+ removed the `next lint` command)
- Run `npm run lint` to check for linting issues
- The configuration extends Next.js core-web-vitals rules with TypeScript support

## Database Migrations

```bash
# Create a new migration
supabase migration new add_new_column

# Edit the migration file in supabase/migrations/
# Then apply it locally:
supabase db reset

# Push to production (see DEPLOYMENT.md)
supabase db push
```

## TypeScript Type Generation

The project uses auto-generated TypeScript types from the Supabase schema to ensure type safety and prevent drift between the database and application code.

```bash
# Generate types from local database
npm run types:generate
```

**Important:** After modifying the database schema (editing migrations or running `supabase db reset`), always regenerate types to keep them in sync:

```bash
supabase db reset           # Apply schema changes
npm run types:generate      # Regenerate types
```

The generated types are stored in `src/lib/database.types.ts` and provide:
- Row types for SELECT queries
- Insert types for INSERT operations
- Update types for UPDATE operations
- Relationship metadata for joins

Application-specific types in `src/lib/types.ts` can extend or compose these generated types as needed.

## Database Seeding

Seeds are split into dev-only (user credentials) and shared (categories, data):

```
supabase/seeds/
  dev/
    00_create_users.sql            — Dev user creation with passwords (git-ignored)
    .template/00_create_users.sql  — Template with example values
  prod/
    01_seed_categories.sql         — Categories (git-ignored)
    02_import_normalized.sql       — Historical data (auto-generated)
    03_import_exchange_rates.sql   — Exchange rates (auto-generated)
    .template/                     — Committed templates
  prod-setup.sql                   — Production household merge (git-ignored)
  .template/prod-setup.sql         — Template
```

`supabase db reset` runs: `dev/00_create_users.sql` → `prod/01_*` → `prod/02_*` → `prod/03_*`

```bash
# Full workflow: Transform CSVs → SQL, then reset DB
npm run seed:full

# Or run steps individually:
npm run seed:transform  # Regenerate 02_import_normalized.sql from raw CSVs
npm run seed:reset      # Reset database with migrations and seeds
```

> **Important:** After modifying categories in `01_seed_categories.sql`, always re-run `npm run seed:transform` because the generated file references categories by name. If a category is renamed or removed, the generated SQL will fail with a NULL constraint violation.

## Other Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **[DATA_MODEL.md](./DATA_MODEL.md)** - Database schema and design
- **[PROGRESS.md](./PROGRESS.md)** - Development roadmap and JTBDs
