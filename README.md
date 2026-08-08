# Quick Budget

Fast expense tracking and flexible budgeting for partners. Built for the author's two-person household (EUR/BRL), now self-service — anyone can create their own household at `/signup`.

Scope: running discretionary spending only. Rent, subscriptions, and other fixed costs are netted out upstream — the monthly target represents what's left to spend day-to-day, so even spending across the month is a realistic baseline.

- Log expenses in seconds, including in foreign currency with automatic conversion
- Per-household base currency (e.g. EUR or GBP) with a configurable secondary currency for foreign entries — set at household creation
- Shared budget dashboard with real-time sync between partners
- Mid-month rebalancing — move money between categories when priorities shift
- Personal allowances tracked separately from shared spending
- Connect a Tricount and sync your household's share of shared expenses (read-only)

## Background

This is the third iteration of a personal finance tool:

1. **[personal-expense-tracker](https://github.com/tucared/personal-expense-tracker)** — Notion + Google Sheets + GCP data pipeline. Overengineered: logging and viewing were split across tools, so keeping up with expenses never became a habit.
2. **[expense-tracker](https://github.com/tucared/expense-tracker)** — Observable Framework dashboard. More of a proof of concept — clunky to deploy and mixing JS with Markdown felt like a step down.
3. **Quick Budget** — Decided to try fully vibecoding a complete app with [Claude Code](https://claude.ai/claude-code). Every line of React, SQL, and infra config was AI-generated. We switched to it from day one — both of us — without keeping the old system around. Light touches and iterations done via Claude Code web.

## Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **Deployment**: Vercel + Supabase Cloud

## Local Development

### Prerequisites

- Node.js 24+
- Docker Desktop ([download](https://docs.docker.com/desktop/))
- Supabase CLI: `brew install supabase/tap/supabase`

### Quick Start

```bash
npm ci                          # Strict install from package-lock.json
npm run setup:signing-keys      # One-time: generate local JWT signing key (ES256)
# Then uncomment `signing_keys_path = "./signing_keys.json"` in supabase/config.toml
supabase start                  # First run takes ~3 min to download images
npm run dev
```

Visit http://localhost:3000 — login with `user1@example.com` / `password1`

> **Why the signing-keys step?** The app verifies JWT signatures locally via
> JWKS (`src/lib/server/jwt-verify.ts`). Local Supabase defaults to HS256, which
> the JWKS verifier (`jose`) can't validate — the middleware would reject every
> session. `npm run setup:signing-keys` writes a gitignored `signing_keys.json`
> at the repo root that switches local Supabase to ES256 (Dev/Prod use
> dashboard-managed asymmetric keys). Skip the uncomment step and `supabase
> start` keeps signing with HS256, so login appears to work then redirects
> straight back to `/login`.

### Signup / create a household

New households are self-service via `/signup` (linked from `/login` as "Sign
up"). The founder enters their email + password, an optional name for their
personal allowance, and — unless the email is detected as already invited (see
below) — the household name, base/secondary currencies, their spending
categories (starting blank, with one-tap suggestion chips for the classic six
and free-form rows for custom ones; at least one required), plus optionally
partner email(s). The form calls Supabase's public `supabase.auth.signUp` with
the household details in `options.data`, and the `handle_new_user()` DB
trigger does the rest:

- **Founder** → creates the household with the chosen name/currencies, seeds
  the categories picked on the form (falling back to the classic starter set
  when a signup arrives without any) + the founder's personal allowance, and
  writes a `household_invites` row per partner email (up to 10).
- **Invited partner** → when someone signs up with an email that matches an
  unconsumed invite, the trigger links them into that **existing** household
  (no new household, no duplicate categories), marks the invite consumed, and
  creates their personal allowance under the name they chose.

As the visitor types their email, the form debounces a call to
`POST /api/signup/check-invite` (a public, IP-rate-limited route backed by
`public.check_pending_invite`) and collapses the household-setup fields
automatically when that address is already invited, instead of asking them
to notice a static disclaimer.

This is the autonomous path: each person sets their own password via `signUp`,
confirms their email, and lands in the app already scoped to the right household.
There is **no** service-role key in this project, so accounts can't be
admin-provisioned — invite routing through the public `signUp` is how a second
member joins. Category and household *management* UIs are deferred; the
categories chosen at signup are the starting point.

**Supabase config required (per environment — Dev/Prod dashboards under
Authentication):** enable **Signups**, turn **Confirm email** ON, and keep the
app origin + `/auth/callback` in the redirect allowlist (see below). Custom
SMTP is needed for real delivery; locally, confirmation mail lands in Mailpit.

#### Operating signup when you share the link

`/signup` is a public, unauthenticated endpoint, but nothing is materialized
until the confirmation link is clicked — `handle_new_user()` fires on the
`email_confirmed_at` transition, so an abandoned signup leaves a single
unconfirmed row under Auth → Users and no household (see DATA_MODEL.md
decision #1, "Timing"). When sharing the link with a handful of known people,
two things to keep an eye on:

- **Email delivery is the real bottleneck.** Supabase's built-in mailer is
  rate-limited to a few sends/hour, so a cluster of signups will silently fail
  to deliver confirmations. Configure **custom SMTP** before sharing the link.
  (Captcha / bot protection isn't needed for a privately-shared link — only
  enable it if `/signup` ever gets linked publicly or indexed.)
- **Stale rows accumulate.** Unconfirmed signups linger in Auth → Users (delete
  them there to free the address), and invited partners may never sign up — in
  particular, an invite sent to someone who **already has an account** can never
  be consumed (there is no "join a household" flow for existing users), so it
  stays pending forever. Inspect pending invites periodically:

```sql
-- Pending invites: who you invited that hasn't joined yet, and how long ago.
select h.name as household, hi.email as invited_email, hi.created_at,
       date_trunc('day', now() - hi.created_at) as age
from public.household_invites hi
join public.households h on h.id = hi.household_id
where hi.consumed_at is null
order by hi.created_at;
```

### Password recovery / onboarding

Login is email + password (`signInWithPassword`). There is also a self-service
password-recovery flow used both for forgotten passwords and for onboarding new
users provisioned **without** a password (see the GBP-household example in
`supabase/seeds/01_create_users.sql`):

- "Forgot password?" on `/login` calls `resetPasswordForEmail` with a
  `redirectTo` of `/auth/callback`.
- `/auth/callback` (route handler) exchanges the link's `code` / `token_hash`
  for a session, then forwards to `/auth/update-password`.
- `/auth/update-password` calls `updateUser({ password })` and lands on
  `/expenses`.

**Project config required for the email to send and the link to work** (per
environment — local `supabase/config.toml`, and the Dev/Prod dashboards under
Authentication → URL Configuration):

- The app origin + `/auth/callback` must be in the **redirect URL allowlist**
  (locally, `[auth].additional_redirect_urls` plus the app's `site_url`). The
  same allowlist covers the signup email-confirmation link.
- Email delivery uses the project's SMTP. Supabase's built-in email is
  rate-limited; configure custom SMTP for real users. Locally, recovery and
  confirmation mail land in Mailpit (http://localhost:54324).

### Useful URLs

| URL | What |
|-----|------|
| http://localhost:3000 | App |
| http://localhost:54323 | Supabase Studio (DB UI) |
| http://localhost:54324 | Mailpit (email testing) |

### Key Commands

```bash
supabase start              # Start all services
supabase stop               # Stop all services
supabase db reset           # Reset DB + reapply migrations + seeds
npm run dev                 # Start Next.js dev server
npm run build               # Production build
npm run lint                # Run ESLint
npm run typecheck           # TypeScript type check (no emit)
npm test                    # Run Vitest unit tests once
npm run test:watch          # Run Vitest in watch mode
npm run types:generate      # Regenerate TypeScript types from DB schema
```

## Database

Schema is defined declaratively in `supabase/schemas/`. The migration files in `supabase/migrations/` are CI-generated by the **Generate Migration** workflow on every PR — don't edit them by hand.

Seeds in `supabase/seeds/` provide ~3 months of fake data (two users, shared household, budget allocations, expenses, exchange rates).

For the full schema-change flow — local loop, CI-generated migrations, the `apply-to-dev` label for dogfooding on Dev before merge, and the narrow set of cases that warrant a hand-authored migration — see [DEPLOYMENT.md](./DEPLOYMENT.md#deploying-schema-changes). Agent-specific guidance (when to bypass the `permissions.ask` block on `supabase/migrations/**`, view ownership, GRANT/REVOKE quirks) lives in [`.agents/skills/supabase-schema-flow/SKILL.md`](./.agents/skills/supabase-schema-flow/SKILL.md).

## Design

Functionalist visual direction inspired by Dieter Rams and Braun industrial design — information-dense, zero decoration, quiet typography.

- **Palette**: Warm grays (off-white backgrounds, warm borders). Single accent color: Braun orange for focus states, warnings, and active elements.
- **Status colors**: Muted and functional — teal for on-track, orange for warning, brick red for over-budget. No decorative color.
- **Surfaces**: Completely flat. No shadows on cards or buttons. Expense rows use hairline dividers instead of bordered cards.
- **Typography**: DM Sans. Normal-case labels everywhere — no tracked uppercase. Section headings are small and quiet (`text-xs font-medium`). Hierarchy comes from size and weight, not decoration.
- **Density**: Tight spacing throughout. The expense form uses `space-y-3` with no outer card border. Category budget cards show colored percentage text without bullet indicators.

## Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Production deployment guide
- **[DATA_MODEL.md](./DATA_MODEL.md)** — Database schema and design decisions
- **[PROGRESS.md](./PROGRESS.md)** — Feature roadmap

## License

MIT
