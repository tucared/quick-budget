# Quick Budget

Fast expense tracking and flexible budgeting for partners.

## Quick Start

```bash
# Install dependencies
npm install

# Start Supabase (requires Docker Desktop running)
supabase start

# Start app
npm run dev
```

Visit http://localhost:3000

### Test Accounts

- user1@test.com / password123
- user2@test.com / password123

## Key Commands

```bash
# Database
supabase start          # Start Supabase
supabase stop           # Stop Supabase
supabase db reset       # Reset database (reapply migrations + seed)
supabase status         # View connection info

# Development
npm run dev             # Start dev server
npm run build           # Build for production
npm run lint            # Run linter

# Database UI
open http://localhost:54323   # Supabase Studio
```

## Stack

- Next.js 14 + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Auth + Real-time)
- shadcn/ui components
- React Hook Form + Zod

## Documentation

- [SETUP.md](./SETUP.md) - Detailed setup and deployment
- [DATA_MODEL.md](./DATA_MODEL.md) - Database schema
- [PROGRESS.md](./PROGRESS.md) - Development roadmap
