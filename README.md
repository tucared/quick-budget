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
│   ├── supabase.ts        # Supabase client
│   ├── types.ts           # Application types
│   ├── database.types.ts  # Generated Supabase database types
│   ├── validations.ts     # Zod schemas
│   └── utils.ts           # Utilities
└── middleware.ts          # Auth middleware

supabase/
├── migrations/            # Database migrations
├── seeds/
│   └── prod/             # Production seeds (real historical data)
└── config.toml           # Supabase config
```

## Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **UI**: shadcn/ui (Radix UI + Tailwind)
- **Forms**: React Hook Form + Zod
- **Deployment**: Vercel (see [DEPLOYMENT.md](./DEPLOYMENT.md))

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

```bash
# Full workflow: Transform CSVs and reset database
npm run seed:full

# Or run steps individually:
npm run seed:transform  # Transform raw CSVs to SQL
npm run seed:reset      # Reset database with migrations and seeds
```

Seeds are automatically run when you execute `supabase db reset`.

## Other Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **[DATA_MODEL.md](./DATA_MODEL.md)** - Database schema and design
- **[PROGRESS.md](./PROGRESS.md)** - Development roadmap and JTBDs
