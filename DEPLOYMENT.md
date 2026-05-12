# Deployment Guide

Guide for deploying Quick Budget using Vercel + Supabase Cloud.

> **Note:** For local development, see [README.md](./README.md).

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

## CI/CD Pipeline

Every PR goes through the following gates before it can deploy:

| Workflow | Trigger | What it does |
|---|---|---|
| `test.yml` | PR touching `src/**` or config; push to `main` | `npm run lint` + `npm run typecheck` + `npm test` (Vitest) |
| `audit.yml` | PR touching `package.json`/`package-lock.json`; push to `main` | `npm audit --omit=dev --audit-level=high` (fails on high/critical CVEs in prod deps; devDeps intentionally excluded) |
| `generate-migration.yml` | PR touching `supabase/schemas/**` | Boots a local Supabase stack, runs `supabase db diff`, auto-commits the generated migration back to the PR branch. No-op if schemas are in sync. |
| `migrate.yml` | Push to `main` touching `supabase/migrations/**` | `supabase db push` to prod, then `supabase db advisors --level error --fail-on error` to catch missing RLS |
| `reset-dev.yml` | Daily 05:00 UTC; push to `main` touching `supabase/**` | `supabase db reset --linked` against the Dev project |
| `backup.yml` | Daily 03:00 UTC | `pg_dump` of prod, uploaded as a GitHub Actions artifact (90-day retention) |

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

`supabase/migrations/20260308171853_baseline.sql` was generated from prod via `supabase db dump` as a one-time bootstrap. All subsequent changes go through the schema-driven flow described below — the baseline is frozen.

**Limitation:** `pg_dump` doesn't capture cross-schema triggers (e.g., the `on_auth_user_created` trigger on `auth.users`). These were added manually to the baseline.

#### Regenerating the baseline from prod (only if you must reset history)

```bash
supabase link --project-ref <prod-project-ref>
supabase db dump -f supabase/migrations/<timestamp>_baseline.sql
# Manually add the auth trigger (see comment in the file)
supabase db reset  # Verify locally
```

## Deploying Schema Changes

Schemas are **declarative**. You never hand-write SQL in `supabase/migrations/` — `.claude/settings.json` blocks it, and CI generates the migration for you.

1. Edit `supabase/schemas/**`
2. Open a PR
3. `generate-migration.yml` runs `supabase db diff` and auto-commits the generated migration to your PR branch. Pull the bot's commit before continuing local work.
4. Review the SQL the bot produced (especially RLS coverage on any new public-schema table)
5. Merge to `main` → `migrate.yml` pushes to prod and runs the security advisors

### Dogfooding a schema change on Dev before merge

Add the **`apply-to-dev`** label to your PR. `generate-migration.yml` then runs `supabase db push` against the Dev project after generating the migration. This lets an agent dogfood the change end-to-end. The daily `reset-dev.yml` cron at 05:00 UTC cleans Dev back to `main`'s state.

### Prod migration setup (one-time)

1. Create an access token at https://supabase.com/dashboard/account/tokens
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
3. Add the following repository secrets:

| Secret | Used by | What |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | migrate, reset-dev, generate-migration | Personal access token (from step 1) |
| `SUPABASE_PROD_PROJECT_REF` | migrate | Prod project ref (Supabase Dashboard → Project Settings) |
| `SUPABASE_DB_PASSWORD` | migrate | Prod database password |
| `SUPABASE_DEV_PROJECT_REF` | reset-dev, generate-migration (apply-to-dev) | Dev project ref |
| `SUPABASE_DEV_DB_PASSWORD` | reset-dev, generate-migration (apply-to-dev) | Dev database password |
| `SUPABASE_DB_URL` | backup | Prod pooler connection string (see Backups below) |

### Manually resetting Dev

Outside the daily cron:
```bash
supabase link --project-ref <dev-project-ref>
supabase db reset --linked
```
Or trigger `reset-dev.yml` from **Actions → Reset Dev Database → Run workflow**.

## Backups

Supabase Free tier has **no built-in backups**. `backup.yml` runs `pg_dump` daily and stores the result as a GitHub Actions artifact (retained 90 days).

### Setup (one-time, after creating Supabase project)

1. Get your database connection string from **Supabase → Project Overview → Database → Connection string (URI), method Transaction pooler**
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
3. Add a new repository secret:
   - **Name**: `SUPABASE_DB_URL`
   - **Value**: `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
   - **Important**: If your database password contains special characters, URL-encode them (e.g., `!` → `%21`, `@` → `%40`, `#` → `%23`)
4. The backup runs automatically at 03:00 UTC daily. You can also trigger it manually from **Actions → Daily Database Backup → Run workflow**.

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
