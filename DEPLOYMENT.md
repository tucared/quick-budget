# Deployment Guide

Guide for deploying Quick Budget using Vercel + Supabase Cloud.

> **Note:** For local development, see [README.md](./README.md)

## Environments

| Environment | Database | Frontend | Purpose |
|---|---|---|---|
| **Local** | `supabase start` (Docker) | `npm run dev` (localhost:3000) | Development |
| **Dev** | Supabase Cloud (dev project) | Vercel preview | Testing with cloud infra |
| **Prod** | Supabase Cloud (prod project) | Vercel production | Live app |

## Initial Setup (New Supabase Project)

1. Go to https://app.supabase.com → "New Project"
2. Set name, database password, and region
3. Wait ~2 minutes for provisioning

```bash
# Link and push schema + seeds
supabase link --project-ref <project-ref>
supabase db push --include-seed
```

Seeds create two test users, categories, budget allocations, expenses, and exchange rates with fake data. No manual setup needed.

Verify results in Supabase Dashboard → Table Editor.

## Database Baseline

The baseline migration (`supabase/migrations/`) is generated from prod via `supabase db dump`. It captures the full schema as the starting point for new environments.

**Limitation:** `pg_dump` doesn't capture cross-schema triggers (e.g., the `on_auth_user_created` trigger on `auth.users`). These are added manually to the baseline.

### Regenerating the baseline from prod

```bash
supabase link --project-ref <prod-project-ref>
supabase db dump -f supabase/migrations/<timestamp>_baseline.sql
# Manually add the auth trigger (see comment in the file)
supabase db reset  # Verify locally
```

## Deploying Schema Changes

1. Edit declarative schema files in `supabase/schemas/`
2. Generate a migration: `supabase db diff -f descriptive_name`
3. Verify locally: `supabase db reset`
4. Push to target environment:

```bash
# Push to dev
supabase link --project-ref <dev-project-ref>
supabase db push

# Push to prod (back up first!)
supabase link --project-ref <prod-project-ref>
supabase db push
```

### Resetting a dev environment

```bash
supabase link --project-ref <dev-project-ref>
supabase db reset --linked
```

This drops everything, reapplies migrations, and runs seeds.

## Vercel Deployment

1. Push code to GitHub
2. Go to https://vercel.com/new → Import repository
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` = Publishable key
4. Click "Deploy"

**Automatic deployments** (enabled by default with Vercel GitHub integration):
- Push to `main` → production deployment
- Create a PR → preview deployment with unique URL

### Supabase Auth Configuration

In Supabase Dashboard → Authentication → URL Configuration:
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/**`

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_...your-publishable-key
```

Exchange rates are fetched from [Frankfurter](https://www.frankfurter.dev) — free, no API key required.

## Backups

Supabase Free tier has **no built-in backups**. This project includes an automated GitHub Action that runs `pg_dump` daily and stores the result as a GitHub Actions artifact (retained 90 days).

### Setup (one-time, after creating Supabase project)

1. Get your database connection string from **Supabase → Project Overview → Database → Connection string (URI), method Transaction pooler**
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
3. Add a new repository secret:
   - **Name**: `SUPABASE_DB_URL`
   - **Value**: `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
   - **Important**: If your database password contains special characters, URL-encode them (e.g., `!` → `%21`, `@` → `%40`, `#` → `%23`)
4. The backup runs automatically at 03:00 UTC daily. You can also trigger it manually from **Actions → Daily Database Backup → Run workflow**

### Restoring from backup

1. Go to **Actions → Daily Database Backup** and download the artifact for the desired date
2. Unzip it to get the `.sql` file
3. Run against your database:
   ```bash
   psql "$SUPABASE_DB_URL" < quick-budget-YYYYMMDD-HHMMSS.sql
   ```

### Before risky operations

Always run a manual backup before migrations or schema changes:
```bash
# Trigger backup manually from GitHub Actions UI, or:
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --clean --if-exists > backup-$(date +%Y%m%d).sql
```
