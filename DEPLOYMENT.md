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
# Link to your production project
supabase link --project-ref your-project-ref

# Push migrations (creates all tables)
supabase db push
```

> **Note:** `supabase db reset` only works locally. For production, you must seed manually (below).

### Seed Production Data

Seeds live in `supabase/seeds/prod/` and contain real historical data. Run them against the **production** DB URL (found in Supabase Dashboard → Project Settings → Database → Connection string):

```bash
# Use the production connection string from Supabase Dashboard
PROD_DB_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"

psql "$PROD_DB_URL" -f supabase/seeds/prod/01_seed_all.sql
psql "$PROD_DB_URL" -f supabase/seeds/prod/02_import_normalized.sql
```

Alternatively, copy and paste each seed file's SQL into Supabase Dashboard → SQL Editor.

> **Important:** `02_import_normalized.sql` is auto-generated from CSVs via `npm run seed:transform`. Run this locally first if the file is out of date.

Verify results in Supabase Dashboard → Table Editor.

## Step 3: Get Supabase Credentials

In Supabase Dashboard → Project Settings → API:
- **Project URL**: `https://xxxxx.supabase.co`
- **Anon/Public Key**: `eyJhbGc...` (long JWT token)

Save these for Vercel.

## Step 4: Deploy to Vercel

1. Push code to GitHub
2. Go to https://vercel.com/new
3. Import your repository
4. Vercel auto-detects Next.js
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = Your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Your anon key
   - `EXCHANGE_RATE_API_KEY` = Your ExchangeRate-API key (get free key at https://www.exchangerate-api.com)
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

### Managing Deployments

- **View all deployments**: Vercel Dashboard → Deployments
- **Rollback**: Vercel Dashboard → Deployments → Promote to Production (on any previous deployment)
- **Environment variables**: Vercel Dashboard → Settings → Environment Variables
  - Changes to env vars require redeployment (trigger via Dashboard or new commit)
- **Preview branches**: By default, all branches get previews. Configure in Vercel Dashboard → Settings → Git

## Database Management

### Running Migrations

**Production:**
```bash
# After creating new migrations locally
supabase link --project-ref your-project-ref
supabase db push
```

**Rollback:**
```bash
# Supabase doesn't support automatic rollback.
# This project uses a single migration file (20260116_initial_schema.sql).
# To roll back: edit the migration file and run supabase db push again,
# or apply a compensating SQL change directly via the Dashboard → SQL Editor.
```

### Viewing Data

- **Supabase Dashboard**: https://app.supabase.com → Your Project → Table Editor
- **Direct SQL**: Dashboard → SQL Editor
- **Logs**: Dashboard → Logs

## Environment Variables

### Production (.env.production or Vercel dashboard)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
EXCHANGE_RATE_API_KEY=your-exchangerate-api-key
```

**Get Exchange Rate API Key**: Sign up at https://www.exchangerate-api.com (free plan is sufficient)
