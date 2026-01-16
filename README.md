# quick-budget

Fast expense tracking and flexible budgeting for partners who share finances.

## Description

A personal finance app designed for busy couples to track spending in seconds, manage fair allowances, rebalance budgets mid-month, and anticipate irregular bills without friction.

## Quick Start (Local Development)

Get up and running in under 5 minutes:

```bash
# 1. Install dependencies
npm install

# 2. Start local Supabase (requires Docker Desktop)
supabase start

# 3. Start Next.js dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign up to start tracking expenses!

### What You Get Out of the Box

- ✅ Full local development environment (no cloud account needed)
- ✅ PostgreSQL database with migrations auto-applied
- ✅ 10+ pre-seeded expense categories
- ✅ Authentication (email/password)
- ✅ Real-time expense updates
- ✅ Database UI at [http://localhost:54323](http://localhost:54323) (Supabase Studio)

### Prerequisites

- Node.js 18+
- Docker Desktop ([Download here](https://docs.docker.com/desktop/))
- Supabase CLI (install via `brew install supabase/tap/supabase`)

See **[SETUP.md](./SETUP.md)** for detailed setup instructions, deployment guides, and troubleshooting.

## Technologies

- **Frontend**: Next.js 14+ (App Router) + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **UI Library**: shadcn/ui
- **Forms**: React Hook Form + Zod
- **Deployment**: Vercel

## Features (JTBD #17 Complete)

- ⚡ **Frictionless Logging**: Add expenses in under 10 seconds
- 🧠 **Smart Defaults**: Remembers your last category, account, and currency
- 📝 **Batch Entry**: Form stays open for quick consecutive entries
- 🔄 **Real-time Updates**: See your expenses appear instantly
- 📱 **Mobile-First**: Optimized for on-the-go expense tracking
- 🎯 **Auto-onboarding**: Default account created automatically for new users

## Project Status

See **[PROGRESS.md](./PROGRESS.md)** for the full roadmap and implementation status.

**Current Status**: JTBD #17 (Frictionless Expense Logging) ✅ Complete

**Next Up**:
- JTBD #1-5: Monthly planning & budget setting
- JTBD #6-9: Monthly review & progress tracking
- JTBD #19: Foreign currency conversion

## Documentation

- **[SETUP.md](./SETUP.md)** - Complete setup guide (local & production)
- **[DATA_MODEL.md](./DATA_MODEL.md)** - Database schema and design decisions
- **[PROGRESS.md](./PROGRESS.md)** - Development roadmap and JTBD tracking
- **[JTBD.md](./JTBD.md)** - Jobs To Be Done (user requirements)

## Development Commands

```bash
# Start local Supabase
supabase start

# Start Next.js dev server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Stop local Supabase
supabase stop

# Reset database (reapply migrations)
supabase db reset

# View Supabase status
supabase status
```

## Contributing

This is a personal project, but feedback and suggestions are welcome! Open an issue to discuss any changes.

## License

Private project - All rights reserved.
