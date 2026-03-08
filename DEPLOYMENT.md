# Deployment Guide

Guide for deploying Quick Budget using Vercel + Supabase Cloud.

> **Note:** For local development, see [README.md](./README.md)

## Environments

| Environment | Frontend | Database | Branch |
|---|---|---|---|
| **Local** | `npm run dev` (localhost:3000) | `supabase start` (Docker) | any |
| **Dev** | Vercel preview deployment | Supabase Cloud (dev project) | PR branches |
| **Prod** | Vercel production (`quick-budget-xi.vercel.app`) | Supabase Cloud (prod project) | `main` |

## Vercel Setup

The Vercel project `quick-budget` is connected to GitHub. Deployments are automatic:
- Push to `main` → **production** deployment (→ Supabase prod)
- Open a PR → **preview** deployment (→ Supabase dev)

### Environment Variables

Set these in Vercel → Project Settings → Environment Variables:

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | dev project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | prod publishable key | dev publishable key |

This ensures preview deployments (PRs) use the dev Supabase project while production uses prod.

### Supabase Auth Configuration

In each Supabase project's Dashboard → Authentication → URL Configuration:

**Prod project:**
- **Site URL**: `https://quick-budget-xi.vercel.app`
- **Redirect URLs**: `https://quick-budget-xi.vercel.app/**`

**Dev project:**
- **Site URL**: `https://quick-budget-tucareds-projects.vercel.app`
- **Redirect URLs**: `https://*-tucareds-projects.vercel.app/**` (wildcard covers all preview URLs)

## Supabase Setup

### Initial Setup (New Project)

1. Go to https://app.supabase.com → "New Project"
2. Set name, database password, and region
3. Wait ~2 minutes for provisioning

```bash
# Link and push schema + seeds
supabase link --project-ref <project-ref>
supabase db push --include-seed
```

Seeds create two test users, categories, budget allocations, expenses, and exchange rates with fake data. Verify in Supabase Dashboard → Table Editor.

### Database Baseline

The baseline migration (`supabase/migrations/`) is generated from prod via `supabase db dump`. It captures the full schema as the starting point for new environments.

**Limitation:** `pg_dump` doesn't capture cross-schema triggers (e.g., the `on_auth_user_created` trigger on `auth.users`). These are added manually to the baseline.

#### Regenerating the baseline from prod

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
4. Push to each environment:

**Dev** (CLI linked to dev project):
```bash
supabase db push
```

**Prod** (automated via GitHub Actions):
Merging to `main` with changes in `supabase/migrations/` automatically triggers the `Apply Database Migrations to Prod` workflow. You can also trigger it manually from **Actions → Apply Database Migrations to Prod → Run workflow**.

### Prod migration setup (one-time)

1. Create an access token at https://supabase.com/dashboard/account/tokens
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
3. Add two repository secrets:
   - **`SUPABASE_ACCESS_TOKEN`**: the token from step 1
   - **`SUPABASE_PROD_PROJECT_REF`**: your prod project ref (from Supabase Dashboard → Project Settings)

### Resetting the dev environment

```bash
supabase db reset --linked
```

This drops everything, reapplies migrations, and runs seeds.

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

## Other Notes

Exchange rates are fetched from [Frankfurter](https://www.frankfurter.dev) — free, no API key required.
