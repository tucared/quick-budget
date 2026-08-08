# Development Progress

---

## Onboarding & Signup

### [x] JTBD #12: Create a household and get started without help
When I discover the app, I want to create a household, set our currencies, choose our spending categories, and invite my partner myself, so we can both be logging expenses without anyone provisioning accounts for us. Self-service signup lives at `/signup` (linked from `/login` as "Sign up"): the founder enters their email + password, an optional name for their personal allowance, and (unless the email turns out to be invited — see below) household name, base/secondary currencies, their spending categories (blank to start, with one-tap suggestion chips for the classic six and free-form emoji + name rows for custom ones; at least one required, up to 20), and optional partner email(s) (up to 10), and Supabase's public `signUp` plus the `handle_new_user()` DB trigger create the household, seed the chosen categories (+ the founder's personal allowance; a signup that arrives without categories falls back to the classic starter set), and pre-authorize each partner email. As the visitor types their email, a debounced check against `public.check_pending_invite` collapses the household + category fields automatically if that address is already invited, rather than showing them greyed out with a static note. A partner later signs up with their own email and is auto-joined to the same household (routed by the invite, no duplicate household), getting a personal allowance under the name they chose at signup (or "<email name>'s Allowance" when left blank). Email confirmation is required and is the materialization point — the household/join is created when the confirmation link (which reuses `/auth/callback`) is clicked, so abandoned signups leave no household behind. There is no service-role key, so this trigger-routed public signup *is* the multi-member onboarding path. Category and household management UIs are deferred — see DATA_MODEL.md decision #1 for the `household_invites` table, trigger branching, and the live invite check.

---

## Monthly Planning & Budget Setting


### [x] JTBD #1: Set realistic targets based on history
When planning next month, we want to see how our spending targets compared to actuals in previous months, so we can set more realistic budgets

---

## Daily Spending Decisions

### [x] JTBD #2: Check shared discretionary budget
When we're deciding whether to go out, we want to see if we have budget left in shared discretionary spending, so we can enjoy it without worry

### [x] JTBD #3: Spend personal allowance guilt-free
When I'm about to spend on something personal, I want to see my allowance balance, so I can spend guilt-free without affecting our shared goals

---

## Mid-Month Adjustments & Rebalancing

### [x] JTBD #4: Get notified when overspending
When I log an expense that makes a category overspent, I want to be notified immediately, so I can take action before it affects our overall budget

### [x] JTBD #5: Rebalance categories mid-month
When we want to spend in a category that's exhausted or about to, we want to quickly move money from categories we're underspending, so we can enjoy what we want without guilt or breaking our plan

### [x] JTBD #6: Understand why categories run out
When I see a category running out faster than expected, I want to review the individual expenses in it, so I can decide whether to rebalance now or adjust next month's budget based on what I learn

---

## Expense Logging & Tracking

### [x] JTBD #7: Log expenses without friction, even when catching up
When I've spent money (whether just now or earlier today), I want to log it in seconds without interrupting what I'm doing, so it doesn't feel like a chore even if I have a few to enter

### [x] JTBD #8: Cap a shared category, overflow to allowance
When I make a purchase where we've agreed to cap the shared portion at a specific amount (like a €30 lunch alone where shared "Dining Out" is capped at €10), I want to log the full purchase and have anything over the cap automatically count against my allowance, so each budget reflects only what we agreed

### [x] JTBD #9: Enter foreign currency naturally
When logging an expense in BRL, I want to enter the amount I actually paid, so I don't have to calculate conversions or delay entering it

---

## Data Migration & Import

### [x] JTBD #10: Import historical data from current app
When setting up the new system, I want to import my expense and budget data from CSV exports of my current app, so I have continuity of my financial history and can see trends without starting from zero

---

## External Sync

### [x] JTBD #11: Sync shared expenses from Tricount
When we already track some shared spending in a Tricount, I want to connect it once and have our household's share flow into Quick Budget automatically, so we see a complete picture without re-entering expenses by hand. Connect one or more tricount share links on the **Sync** tab; each sync (manual "Sync"/"Sync all" or automatically once per session on app load) pulls the whole ledger and reconciles new, changed, and removed entries into the shared **Tricount** category. Synced rows are tagged read-only with their tricount name (managed on the Sync tab — Unlink & delete removes a tricount and its imported expenses; pause to freeze a finished one as history). Only the share belonging to assigned household members is counted — a per-tricount mapping editor lets you explicitly assign each tricount member to a household person or exclude them (mapping is always explicit: unassigned members aren't counted until you map them). A tricount that's over can be paused (skipped by syncs, its expenses frozen as history) and resumed later. Each tricount also carries a **timezone** (set on the Sync tab) so a synced expense lands on the same calendar day it shows in Tricount — entry timestamps come back in UTC, so without it evening entries can slip a day. Because the mirrored amount is the household's *share* (what we consumed) rather than the cash that left the wallet, the app also surfaces month-end cashflow: the **Budget** page shows the month's actual **cash out** (what really left the wallet — share replaced by what was paid, income netted in, so no manual math against the total), and the **Sync** tab shows the per-tricount owe/owed breakdown ("you paid €Y · your share €X → …"). This reads who paid each entry and includes `INCOME` entries (which feed reconciliation but are never tracked as spend); actually settling the debt is out of scope. See DATA_MODEL.md (decision #9) for the data model; implementation lives in `src/lib/tricount/`.

