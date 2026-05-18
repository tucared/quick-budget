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

### Function region

`vercel.json` pins serverless functions to `cdg1` (Paris) so they co-locate with Supabase Prod, which lives in `eu-west-3` (Paris). If the Supabase project ever moves region, update `vercel.json` to match — Frankfurt/Dublin/etc. add a transatlantic-irrelevant but in-region hop that shows up directly in p95.

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

### Customize Access Token (JWT) Claims hook (manual, both projects)

Dashboard → **Authentication → Hooks**. Find the **"Customize Access Token (JWT) Claims"** hook (also linked as `/dashboard/project/<ref>/auth/hooks`). The hook ships in the migration chain, but enabling it is a project-level setting with no SQL knob and no Management API surface — it must be toggled in the dashboard for each project.

Click **Enable Customize Access Token (JWT) Claims hook**, then:

| Field | Value |
|---|---|
| Hook type | **Postgres** (not HTTPS) |
| Schema where the function is defined | `private` |
| Select a function | `custom_access_token_hook` |

Save.

**Prerequisite**: the function must exist in the project's database before the dropdown can show it. The function lives in [`supabase/migrations/20260514120000_add_household_id_to_jwt_claims.sql`](./supabase/migrations/20260514120000_add_household_id_to_jwt_claims.sql) and ships with the regular migration chain — it lands on Prod via `migrate-prod.yml` on merge to `main`, and on Dev via either the `apply-to-dev` label or the daily 05:00 UTC `reset-dev.yml` cron.

> If the "Select a function" dropdown says **"No function with a single JSON/B argument and JSON/B return type found in this schema"**, the migration hasn't been applied to that project yet. Trigger `reset-dev.yml` from **Actions → Reset Dev → Run workflow** for Dev, or merge to `main` for Prod.

**What the hook does**: injects `household_id` into the JWT's `app_metadata`, so server- and client-side code read it from the token instead of hitting `public.users`, and the `private.get_my_household_id()` RLS helper skips its DB lookup on every household-scoped query.

**Safe to ship without it**: `private.get_my_household_id()` and `getServerUser()` both fall back to a `public.users` SELECT when the claim is absent. You just don't get the per-request perf win until the hook is enabled.

The hook setting is project-level, not schema-level, so the daily Dev reset doesn't clear it — no need to re-toggle after a reset.

See [Supabase: Custom Access Token Auth Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) for the full hook contract.

### Signing Keys (asymmetric JWT, manual, both projects)

The app verifies JWT signatures locally against the project's JWKS endpoint (`<project>/auth/v1/.well-known/jwks.json`). This requires asymmetric signing keys (ES256/RS256) — legacy HMAC projects can't expose a public key, so the verifier (`src/lib/server/jwt-verify.ts`) will reject every token.

Dashboard → **Authentication → Signing Keys** → rotate the active key to **ES256** (P-256). The previous HMAC key remains usable until existing tokens expire (≤1h with default `jwt_expiry`), so the cutover is non-disruptive. Verify `https://<project>.supabase.co/auth/v1/.well-known/jwks.json` returns the new public key before merging app-side changes that depend on it.

> **Merge-order requirement.** App code in `main` (after [PR #128](https://github.com/tucared/quick-budget/pull/128)) requires the Prod project to be on asymmetric keys. **Rotate Prod first, then merge** — merging while Prod is still HMAC will lock everyone out until the rotation lands.

Local dev needs the same — see [README: Quick Start](./README.md#quick-start) for the `npm run setup:signing-keys` bootstrap.

### GoTrue 2.189+ `enable_signup` quirk

`supabase/config.toml` keeps `[auth.email] enable_signup = true` even though the global `[auth] enable_signup = false` already blocks new registrations. GoTrue 2.189+ repurposed the per-provider `enable_signup` flag — setting it to `false` disables email **login** entirely, not just signup. If you ever tighten that config, leave the email-scoped flag alone and rely on the global one. The same applies to the dashboard equivalent on Dev/Prod.

## CI/CD Pipeline

Every PR goes through the following gates before it can deploy:

| Workflow | Trigger | What it does |
|---|---|---|
| `checks.yml` | PR touching `src/**` or config; push to `main` | `npm run lint` + `npm run typecheck` + `npm test` (Vitest) |
| `audit-packages.yml` | PR touching `package.json`/`package-lock.json`; push to `main` | `npm audit --omit=dev --audit-level=high` (fails on high/critical CVEs in prod deps; devDeps intentionally excluded) |
| `generate-migration.yml` | PR touching `supabase/schemas/**` | Boots a local Postgres (via `supabase db start`), runs `supabase db diff`, auto-commits the generated migration back to the PR branch. No-op if schemas are in sync. |
| `migrate-prod.yml` | Push to `main` touching `supabase/migrations/**` | `supabase db push` to prod, then `supabase db advisors --level error --fail-on error` to catch missing RLS |
| `reset-dev.yml` | Daily 05:00 UTC; push to `main` touching `supabase/**` | `supabase db reset --linked` against the Dev project |
| `backup-prod.yml` | Daily 03:00 UTC | `pg_dump` of prod, uploaded as a GitHub Actions artifact (90-day retention) |

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
5. Merge to `main` → `migrate-prod.yml` pushes to prod and runs the security advisors

### Dogfooding a schema change on Dev before merge

Add the **`apply-to-dev`** label to your PR. `generate-migration.yml` then runs `supabase db push` against the Dev project after generating the migration. This lets an agent dogfood the change end-to-end. The daily `reset-dev.yml` cron at 05:00 UTC cleans Dev back to `main`'s state.

### Prod migration setup (one-time)

1. Create an access token at https://supabase.com/dashboard/account/tokens
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
3. Add the following repository secrets:

| Secret | Used by | What |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | migrate-prod, reset-dev, generate-migration | Personal access token (from step 1) |
| `SUPABASE_PROD_PROJECT_REF` | migrate-prod | Prod project ref (Supabase Dashboard → Project Settings) |
| `SUPABASE_DB_PASSWORD` | migrate-prod | Prod database password |
| `SUPABASE_DEV_PROJECT_REF` | reset-dev, generate-migration (apply-to-dev) | Dev project ref |
| `SUPABASE_DEV_DB_PASSWORD` | reset-dev, generate-migration (apply-to-dev) | Dev database password |
| `SUPABASE_DB_URL` | backup-prod | Prod pooler connection string (see Backups below) |

### Manually resetting Dev

Outside the daily cron:
```bash
supabase link --project-ref <dev-project-ref>
supabase db reset --linked
```
Or trigger `reset-dev.yml` from **Actions → Reset Dev → Run workflow**.

## Backups

Supabase Free tier has **no built-in backups**. `backup-prod.yml` runs `pg_dump` daily, encrypts the dump with [`age`](https://age-encryption.org) to a post-quantum hybrid (ML-KEM-768 + X25519) recipient committed at `.github/backup-recipient.txt`, and stores the ciphertext as a GitHub Actions artifact (retained 90 days). The matching private key lives only in 1Password — the workflow can produce backups but cannot decrypt them, which is what makes it safe to keep the artifacts in a public repo.

### Setup (one-time, after creating Supabase project)

1. Get your database connection string from **Supabase → Project Overview → Database → Connection string (URI), method Transaction pooler**
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
3. Add a new repository secret:
   - **Name**: `SUPABASE_DB_URL`
   - **Value**: `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
   - **Important**: If your database password contains special characters, URL-encode them (e.g., `!` → `%21`, `@` → `%40`, `#` → `%23`)
4. Confirm the recipient public key is in place: `.github/backup-recipient.txt` should contain a single `age1pq1...` line. The matching private key is in 1Password as "Quick Budget backup key" — without it backups cannot be restored.
5. The backup runs automatically at 03:00 UTC daily. You can also trigger it manually from **Actions → Backup Prod → Run workflow**.

### Restoring from backup

Requires `age` ≥ 1.3.0 on the decrypting machine (native PQ-hybrid support landed in 1.3.0; older versions need the separate `age-plugin-pq`). On macOS: `brew upgrade age`. On Linux: download from <https://github.com/FiloSottile/age/releases>.

1. Go to **Actions → Backup Prod** and download the artifact for the desired date
2. Unzip it to get the `.sql.age` file
3. Decrypt with the private key from 1Password, then restore:
   ```bash
   age -d -i ~/quick-budget-backup-key.txt \
     quick-budget-YYYYMMDD-HHMMSS.sql.age \
     > quick-budget-YYYYMMDD-HHMMSS.sql
   psql "$SUPABASE_DB_URL" < quick-budget-YYYYMMDD-HHMMSS.sql
   ```

### Rotating the backup key

If the private key is suspected compromised or you want to roll it for hygiene:

1. On a trusted laptop with `age` ≥ 1.3.0 installed:
   ```bash
   age-keygen -pq -o ~/quick-budget-backup-key.txt
   ```
2. Stash the new file in 1Password (replace the previous entry).
3. Replace the single line in `.github/backup-recipient.txt` with the new `age1pq1...` public key (strip the `# public key: ` prefix from the keygen output).
4. Commit, push, merge. From the next scheduled run, new backups are encrypted to the new key.
5. Keep the old private key in 1Password until the 90-day retention window has expired on the last artifact encrypted to it, then delete.

### Before risky operations

Always run a manual backup before migrations or schema changes. Easiest path: trigger the workflow manually from **Actions → Backup Prod → Run workflow** so the ciphertext goes through the same encrypt-and-upload path. For a fully local backup:
```bash
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --clean --if-exists \
  | age -R .github/backup-recipient.txt -o "backup-$(date +%Y%m%d).sql.age"
```

## Other Notes

Exchange rates are fetched from [Frankfurter](https://www.frankfurter.dev) — free, no API key required.
