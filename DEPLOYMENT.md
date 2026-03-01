# Production Deployment Guide

Guide for deploying Quick Budget to production using Vercel + Supabase Cloud.

> **Note:** For local development, see [README.md](./README.md)

## Step 1: Create Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Choose organization and set:
   - **Name**: quick-budget-prod (or your choice)
   - **Database Password**: (save this securely)
   - **Region**: Choose closest to your users
4. Wait ~2 minutes for provisioning

## Step 2: Push Database Schema & Seed Data

```bash
# Link to your production project (`supabase login` may be required before)
supabase link --project-ref your-project-ref

# 1. Create both users in Supabase Dashboard → Authentication → Add user (auto-confirm)

# 2. Push migrations + seed data (seeds are idempotent — safe to re-run)
supabase db push --include-seed
```

> **Important:** `02_import_normalized.sql` is auto-generated from CSVs via `npm run seed:transform`. Run this locally first if the file is out of date.

Verify results in Supabase Dashboard → Table Editor.

## Step 3: Get Supabase Credentials

In Supabase Project Overview, get:
- **Project URL**: `https://xxxxx.supabase.co`
- **Publishable Key**: `sb_publishable_...`

Save these for Vercel.

## Step 4: Deploy to Vercel

1. Push code to GitHub
2. Go to https://vercel.com/new
3. Import your repository
4. Vercel auto-detects Next.js
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = Your project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` = Your publishable key
6. Click "Deploy"

**Automatic Deployments**: When you import from GitHub, Vercel automatically installs the [Vercel GitHub App](https://github.com/apps/vercel) which enables:
- **Production deployments**: Every push to `main` branch automatically deploys to production
- **Preview deployments**: Every PR gets a unique preview URL for testing
- **Deployment comments**: Vercel posts deployment status and preview URLs directly in PRs

No additional configuration needed - this is enabled by default when connecting a GitHub repository.

## Step 5: Configure Supabase Auth

In Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/**`

## Step 6: Verify Deployment

1. Visit your Vercel URL
2. Sign up or log in with your account
3. Test expense creation
4. Check Supabase Dashboard → Table Editor to see data

## Deployment Workflow

### Automatic Deployments

With the Vercel GitHub integration enabled:

- **Production**: Push to `main` → Vercel automatically deploys to production
- **Preview**: Create a PR → Vercel creates a preview deployment and posts the URL in PR comments

## Database Management

### Running Migrations

```bash
# After creating new migrations locally
supabase link --project-ref your-project-ref
supabase db push
```

## Environment Variables

### Production (.env.production or Vercel dashboard)

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
