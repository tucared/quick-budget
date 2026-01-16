# Quick Budget - Setup Guide

This guide will help you get Quick Budget up and running locally and in production.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- **Docker Desktop** (for local Supabase development) - [Install Docker Desktop](https://docs.docker.com/desktop/)
- Supabase CLI (already installed via Homebrew)

## Local Development Setup (Recommended)

This approach runs Supabase locally using Docker, giving you a full development environment without needing a cloud account.

### 1. Install Dependencies

```bash
npm install
```

### 2. Verify Docker is Running

Ensure Docker Desktop is installed and running:

```bash
docker --version
# Should output: Docker version X.X.X...
```

If Docker is not installed, download it from [https://docs.docker.com/desktop/](https://docs.docker.com/desktop/)

### 3. Start Local Supabase

This will start all Supabase services (PostgreSQL, Auth, Storage, etc.) in Docker containers and automatically run your migrations:

```bash
supabase start
```

**First time setup takes 2-3 minutes** as it downloads Docker images.

Once complete, you'll see output like:

```
Started supabase local development setup.

         API URL: http://localhost:54321
     GraphQL URL: http://localhost:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323
    Inbucket URL: http://localhost:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Configure Environment Variables

Create a `.env.local` file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your **local** Supabase credentials (from the output above):

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-local-anon-key>
```

### 5. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Access Supabase Studio (Database UI)

Visit [http://localhost:54323](http://localhost:54323) to access Supabase Studio where you can:
- View and edit database tables
- Run SQL queries
- Manage auth users
- View logs

## Testing the App

1. **Sign Up**: Create a new account at `/signup`
2. **Automatic Onboarding**: A default "Primary Account" is automatically created for you
3. **Add Expenses**: Navigate to `/expenses` and start logging expenses
4. **Batch Entry Test**: Add 5 expenses in a row to test the stay-open-after-save feature
5. **Smart Defaults**: Notice how the category and account persist between entries

## Supabase CLI Commands

```bash
# Start local Supabase
supabase start

# Stop local Supabase (keeps data)
supabase stop

# Stop and reset database (deletes all data)
supabase stop --no-backup
supabase db reset

# View status
supabase status

# Create a new migration
supabase migration new <migration_name>

# Apply migrations manually
supabase db reset
```

## Alternative: Cloud Supabase Setup

If you prefer not to use Docker, you can use a cloud Supabase project instead.

### 1. Create Cloud Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Create a new project (takes a few minutes to provision)
3. Once ready, go to **Project Settings** → **API**
4. Copy your:
   - Project URL
   - Anon/Public key

### 2. Configure Environment Variables

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run Database Migration

**Option A: Using Supabase CLI**

```bash
# Link to your cloud project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

**Option B: Using Supabase Dashboard**

1. Go to **SQL Editor** in your Supabase project
2. Click **New Query**
3. Copy the contents of `supabase/migrations/20260116000000_initial_schema.sql`
4. Paste into the SQL editor
5. Click **Run**

## Production Deployment (Vercel)

### 1. Create Production Supabase Project

For production, you'll need a cloud Supabase project:

1. Create a new project at [https://app.supabase.com](https://app.supabase.com)
2. Link and push migrations:

```bash
supabase link --project-ref your-production-project-ref
supabase db push
```

### 2. Push to GitHub

```bash
# Using jujutsu (as per project guidelines)
jj git push
```

### 3. Deploy to Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Import your repository
3. Vercel will auto-detect Next.js
4. Add environment variables (from your production Supabase project):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click **Deploy**

### 4. Configure Supabase for Production

In your **production** Supabase project settings:

1. Go to **Authentication** → **URL Configuration**
2. Add your Vercel deployment URL to:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: `https://your-app.vercel.app/**`

## Project Structure

```
quick-budget/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── expenses/           # Main expense tracking page
│   │   ├── login/              # Login page
│   │   ├── signup/             # Signup page
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── expense-form.tsx    # Expense entry form
│   │   └── expense-list.tsx    # Recent expenses list
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client setup
│   │   ├── types.ts            # TypeScript types
│   │   ├── validations.ts      # Zod schemas
│   │   └── utils.ts            # Utility functions
│   └── middleware.ts           # Auth middleware
├── supabase/
│   ├── config.toml             # Supabase configuration
│   └── migrations/             # Database migrations
│       └── 20260116000000_initial_schema.sql
├── .env.local                  # Environment variables (gitignored)
└── package.json
```

## Key Features Implemented (JTBD #17)

- ✅ Frictionless expense logging (< 10 seconds)
- ✅ Smart defaults (remembers last category, account, currency)
- ✅ Form stays open after save for batch entry
- ✅ Real-time expense list updates
- ✅ Mobile-first responsive design
- ✅ Automatic user onboarding (default account creation)
- ✅ Email/password authentication

## Development Commands

```bash
# Start local Supabase (in Docker)
supabase start

# Start Next.js development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Stop local Supabase
supabase stop
```

## Troubleshooting

### Docker Issues

**"Cannot connect to Docker daemon"**
- Ensure Docker Desktop is installed and running
- Check Docker Desktop is not paused
- Try restarting Docker Desktop

### Supabase Issues

**"Port already in use" when running `supabase start`**
- Another service is using port 54321, 54322, 54323, or 54324
- Stop other local Supabase instances: `supabase stop`
- Or change ports in `supabase/config.toml`

**"Invalid API key" error**
- Double-check your `.env.local` file
- Ensure you copied the **anon** key, not the service_role key
- Restart the development server: `npm run dev`

**"User not found" or auth issues**
- Verify migrations ran: Check Supabase Studio at http://localhost:54323
- Reset database: `supabase db reset`
- Check RLS policies are enabled

### Categories not showing up
- Check seed data in Supabase Studio (http://localhost:54323)
- Reset database to rerun migrations: `supabase db reset`

### Real-time updates not working
- Verify Supabase is running: `supabase status`
- Check browser console for subscription errors
- Realtime is enabled by default in local Supabase

### Environment variables not loading
- File must be named `.env.local` (not `.env`)
- Restart Next.js dev server after changing variables
- Don't commit `.env.local` to git

## Database Migrations

All database changes should be done via migrations to keep local and production in sync.

### Creating a new migration

```bash
supabase migration new add_new_feature
```

This creates a new file in `supabase/migrations/`. Edit it to add your SQL changes.

### Applying migrations

**Local:**
```bash
supabase db reset  # Resets and reapplies all migrations
```

**Production:**
```bash
supabase db push  # Pushes new migrations to linked project
```

## Next Steps

After completing JTBD #17, consider implementing:

- JTBD #1-5: Monthly planning & budget setting
- JTBD #6-9: Monthly review & progress tracking
- JTBD #19: Foreign currency conversion
- JTBD #7: Multi-user/partner access

See `PROGRESS.md` for the full roadmap.

## Support

For issues or questions:
- Check Supabase Studio: http://localhost:54323
- Review project documentation (DATA_MODEL.md, PROGRESS.md, JTBD.md)
- Check Supabase logs: `supabase logs`
- Check browser console for client-side errors
