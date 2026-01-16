# Setup Guide

## Prerequisites

- Node.js 18+
- Docker Desktop ([download](https://docs.docker.com/desktop/))
- Supabase CLI: `brew install supabase/tap/supabase`

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start Supabase (first run takes ~3 min)
supabase start

# 3. Start Next.js
npm run dev
```

Visit http://localhost:3000 and log in with:
- user1@test.com / password123
- user2@test.com / password123

### Useful URLs

- **App**: http://localhost:3000
- **Database UI**: http://localhost:54323 (Supabase Studio)
- **Email Testing**: http://localhost:54324 (Mailpit)

## Production Deployment

### Option 1: Vercel + Cloud Supabase

1. Create Supabase project at https://app.supabase.com
2. Push migrations:
   ```bash
   supabase link --project-ref your-project-ref
   supabase db push
   ```
3. Deploy to Vercel with environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Option 2: Self-hosted

Deploy Next.js and Supabase separately following their official guides.

## Database

### Migrations

```bash
# Create new migration
supabase migration new migration_name

# Apply migrations locally
supabase db reset

# Push to production
supabase db push
```

### Seed Data

Local development includes pre-seeded test accounts in `supabase/seed.sql`. Runs automatically on `supabase db reset`.

## Troubleshooting

**Docker issues:** Ensure Docker Desktop is running

**Port conflicts:** Check ports 54321-54324 are available

**Auth issues:** Run `supabase db reset` to recreate database

## Environment Variables

Local (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

Production: Get values from your Supabase project settings.
