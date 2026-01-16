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

Visit http://localhost:3000 and log in with:
- **user1@test.com** / password123
- **user2@test.com** / password123

Database is pre-seeded with sample accounts and expenses for each user.

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
```

## Troubleshooting

**"Cannot connect to Docker daemon"**
- Ensure Docker Desktop is running

**"Port already in use"**
- Check ports 54321-54324 are available
- Stop other Supabase instances: `supabase stop`

**Auth or data issues**
- Reset database: `supabase db reset`

**Environment variables not loading**
- Ensure `.env.local` exists with correct values
- Restart dev server: `npm run dev`

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
│   ├── types.ts           # TypeScript types
│   ├── validations.ts     # Zod schemas
│   └── utils.ts           # Utilities
└── middleware.ts          # Auth middleware

supabase/
├── migrations/            # Database migrations
├── seed.sql              # Test data (local dev only)
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

## Production Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for production deployment instructions.

## Other Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **[DATA_MODEL.md](./DATA_MODEL.md)** - Database schema and design
- **[PROGRESS.md](./PROGRESS.md)** - Development roadmap and JTBDs
