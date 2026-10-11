# Plan: Full household ledger (pots, transactions, month close)

> **Status: planned — nothing below is implemented yet.** This is the working plan for turning Quick Budget from a monthly discretionary-spending tracker into the household's full ledger. `DATA_MODEL.md` describes the *current* schema; this file describes the *target* and how to get there. Each stage's PR updates its checkbox here and moves whatever it ships into `DATA_MODEL.md`. Delete this file once the last stage merges.
>
> **Before starting any stage:** read this whole file, then `DATA_MODEL.md` (current model + naming conventions) and the `supabase-schema-flow` skill. Decisions under [Decisions](#decisions) were argued out with the owner — don't re-litigate them without a new reason; record any change here.

## Context

The household runs Quick Budget alongside a Google Sheet with two tabs:

- **Ledger** — every income, spending and allocation line, with pots. Monthly Quick Budget spending is one aggregated line per month; fixed recurring costs another. Headers:

  ```
  Date | Month | Amount | Pot From | Pot To | Flow | Type | Label
  2026-06-30 | 2026-06-30 | €XXXX |            | Unallocated | Opening balance | Income     | Opening balance
  2026-06-30 | 2026-06-30 | €XXXX | Unallocated | Safety Net  |                 | Allocation | Opening balance
  ```

  Each row fills **2 of 3** of *Pot From*, *Pot To*, *Flow* (Flow = what the money was for, i.e. an expense/income account). A small "Unaccounted" line is added when the ledger can't be made to match the balances exactly.

- **P&L / Reconciliation** — one row per month-end snapshot:

  ```
  Day | Cloturé | Net Worth (Balances) | Income (Journal) | Spending (Journal) | Net Worth (Journal)
      | Unaccounted Delta | Net Worth Delta | Valuation | Savings rate | Unallocated | Safety_Net | [other pots…]
  ```

The app today only knows the monthly envelope (the `monthly_budget_targets` figure split into categories that reset each month) plus allowances. Keeping the rest in the sheet means double bookkeeping and the app being "on the side".

**Goal:** move the *whole ledger* into the app (income, all spending including fixed recurring, allocations between long-lived pots), keep the familiar monthly view on top, and keep **reconciliation in the sheet** for now (a separate future unit of work). The app must export data in the sheet's shape so reconciliation keeps working.

**Non-goals (for now):** bank accounts / per-account balances, in-app reconciliation, planned/forecast transactions, investments/valuation.

## Glossary

Use these words consistently in code, UI and docs.

| Term | Meaning |
|---|---|
| **Pot** | An envelope of money with a balance. Replaces today's *category*. All pots behave the same; behaviour differences are settings (`reset_into_pot_id`, `owner_user_id`) or a system `role`. |
| **Monthly pot** | A pot whose balance resets at month end into the Monthly pot (Groceries, Dining…). Today's regular categories. |
| **Long-term pot** | A pot that carries its balance over (Safety Net, Holidays, personal allowances). |
| **Unallocated** | System pot (`role = 'unallocated'`). "Ready to spend": salary lands here; leftovers/overspend of the month end up here. |
| **Monthly** | System pot (`role = 'monthly'`). Holds the month's discretionary target; monthly pots are funded from it and reset into it. Its balance = target not yet assigned to a monthly pot (replaces today's "unallocated pool"). |
| **Uncategorised** | System pot (`role = 'uncategorised'`). Inbox for spending whose pot isn't chosen yet (Tricount entries first). Shown as "unassigned spending"; blocks month close while non-empty for that month. |
| **Tricount pot** | System pot (`role = 'tricount'`). Absorbs the gap between cash paid and household share on Tricount entries; balance = what the group owes us (negative) / what we owe (positive). |
| **Transaction** | One ledger row: money leaving a pot, entering a pot, or both. Replaces today's *expense*. |
| **Category** | *What the money was for* (the sheet's "Flow"): optional tag on a transaction. Not the same as a pot. NB: today's `categories` table becomes `pots`; a *new* `categories` table is introduced later with this meaning. |
| **Reset** | Month-end transfer that empties a monthly pot into the pot named by `reset_into_pot_id` (and Monthly into Unallocated). Written by month close. |
| **Month close** | Locks a month: writes the reset transfers, marks the month closed, forbids edits to its transactions until reopened. |
| **Ledger start** | `households.ledger_start_date`: first day pot balances are computed from. Opening-balance transactions sit on that date. |
| **IOU** | System category for Tricount lend/borrow and settlements — moves money but is neither income nor spending. |

## Target schema

```
households              … + ledger_start_date DATE

pots                    id, household_id, name, icon, role?, owner_user_id?,
                        reset_into_pot_id?, cap_amount?, is_active,
                        created_at, updated_at
                        UNIQUE(household_id, role)
                        role ∈ unallocated | monthly | uncategorised | tricount

categories              id, household_id, name, role?, is_in_totals, is_active,
                        created_at, updated_at
                        UNIQUE(household_id, role)
                        role ∈ opening | unaccounted | iou
                        seeded: Opening balance (is_in_totals = false),
                                Unaccounted (true), IOU (false)

transactions            id, household_id, transaction_date,
                        from_pot_id?, to_pot_id?, category_id?,
                        amount, original_amount?, original_currency?,
                        description, is_cash, group_id?, recurring_transaction_id?,
                        created_by_user_id, created_at, updated_at

recurring_transactions  id, household_id, from_pot_id?, to_pot_id?, category_id?,
                        amount, description, day_of_month, is_active,
                        created_at, updated_at

month_closes            household_id, budget_month, closed_at, closed_by_user_id
                        PK(household_id, budget_month)

view pot_balances       per-pot balance from ledger_start_date onward (the ONLY
                        place that filter lives)
```

### Semantics

- **Kind is derived from direction** — no `type` column:

  | `from_pot_id` | `to_pot_id` | Kind |
  |---|---|---|
  | set | null | spending |
  | null | set | income |
  | set | set | transfer (allocation / rebalance / reset) |
  | null | null | forbidden — `CHECK (from_pot_id IS NOT NULL OR to_pot_id IS NOT NULL)` |

- **`amount` is in the household base currency** (`households.base_currency`, decision #5 of `DATA_MODEL.md`) and is what every sum uses. `original_amount` / `original_currency` are set only for foreign-currency spending; the rate is derivable. `DECIMAL(12,2)`.
- **Sign:** `amount > 0`, except **refunds**, which are spending with a negative amount in the original pot (`from Dining, −30`). `CHECK (amount > 0 OR (amount < 0 AND to_pot_id IS NULL))`. Generators that would produce a negative transfer flip direction instead.
- **Pot balance** = Σ(incoming) − Σ(outgoing) for `transaction_date >= ledger_start_date`. Monthly views filter by month and ignore the start date.
- **`category_id`** is optional; spending from a monthly pot normally leaves it null (the pot *is* the category). Special system categories carry the semantics the sheet expressed with Flow: Opening balance, Unaccounted, IOU. `is_in_totals` decides whether a row counts in income/spending totals and savings rate.
- **`group_id`** ties rows that are one real-world event: cap split (JTBD #8), Tricount share + IOU pair, two-step top-up `Unallocated → Monthly → Groceries`. It references no table (documented exception to the `_id` FK rule).
- **Month close** (RPC): requires Uncategorised empty for that month; owner adds any Unaccounted adjustment manually first; writes reset transfers dated the month's last day (monthly pot → Monthly, then Monthly → Unallocated, net of over/underspend); inserts `month_closes`. **Reopen** (RPC) deletes those reset transfers and the `month_closes` row. Closes happen in order (can't close Nov while Oct is open); **starting** a new month is never blocked — Unallocated shows the pending reset of an unclosed month as a nag.
- **Lock**: a trigger on `transactions` rejects INSERT/UPDATE/DELETE whose `transaction_date` (old or new) falls in a closed month, except from the close/reopen RPCs.
- **Recurring**: "generate" inserts one transaction per active template for a month, dated `day_of_month` (clamped to the month's last day). Idempotent via a unique index on `(recurring_transaction_id, date_trunc('month', transaction_date))`. Inserted rows are ordinary actuals, editable afterwards. The **month-start template** (target `Unallocated → Monthly`, `Monthly → <pot>` per monthly pot, allowance funding `Unallocated → <allowance>`) is just recurring transfers on day 1.
- **Allowances** become long-term pots (`owner_user_id` set, no reset) funded by a recurring transfer; they carry over.

### Tricount under the new model

For each mirrored NORMAL entry where the household paid **P** and its share is **S** (both already computed by today's sync as `paid_converted_amount` / `share_converted_amount`):

| Transaction | Effect |
|---|---|
| `from <pot>` amount S (pot = Uncategorised until the user picks one) | Monthly view shows the **share** |
| `from Tricount` amount P − S, category IOU (direction flipped if negative) | Full view follows **cash** |

Same `group_id`. Pots total moves by −P = actual cash out, so pots reconcile against bank balances alone. Settlements recorded in Tricount (owner records reimbursements there) sync as IOU transfers into/out of the Tricount pot. Today the owner books reimbursements as *income* in the sheet; the IOU model replaces that (reimbursement ≠ income). The pot choice is user-owned: re-sync must never overwrite `from_pot_id` (it's not in `content_hash`).

## Decisions

Settled with the owner, with the alternatives rejected.

1. **One `transactions` table for income, spending and transfers**, kind derived from direction. *Rejected:* explicit `type` enum (`expense|income|transfer|opening|adjustment`) — the special cases are expressed by system categories instead, matching the sheet's 2-of-3 shape. (This is the Firefly III source/destination shape; equivalent to double-entry with "null = outside world".)
2. **Pots are uniform**; no `kind` column. Behaviour comes from settings (`reset_into_pot_id`, `owner_user_id`) and system `role`. *Rejected:* `kind ∈ monthly|allowance|goal`.
3. **Category ≠ pot.** Optional `category_id` for "what for" (e.g. car repair paid from Safety Net). *Rejected:* merging them (loses the purpose of long-term-pot spending); full double-entry with categories as accounts (duplicates every monthly pot).
4. **Refunds = negative spending in the original pot.** No `refund_of` link for now (nullable column can be added later).
5. **A Monthly system pot** funds the monthly pots; replaces `monthly_budget_targets` and the "unallocated pool". Top-up shortcut when Monthly is empty writes two grouped transfers.
6. **Allocations are an append-only log of transfers**, not stored absolute amounts. A mid-month change logs another transfer → free as-of-date history. Replaces `budget_allocations`.
7. **No `month` column** on transactions; the month is derived from `transaction_date`. Allocations for a month are dated its 1st.
8. **Only actuals.** *Rejected:* planned/expected status on transactions (too complex).
9. **No accounts for now.** `is_cash` stays as the only hint; it becomes `account_id` (+ optional default account per user per pot) if reconciliation ever needs it. Transfers between bank accounts aren't modelled.
10. **Amounts stored in base currency** (`amount`), original currency optional. *Rejected:* today's `amount/currency/converted_amount/converted_currency/exchange_rate` on every row (pure duplication for transfers).
11. **Month close is reversible and manual**; Unaccounted adjustment is the owner's prerogative (no automatic correcting entries). Lock enforced in the DB.
12. **Closes in order; starting a month never blocked** (nag only).
13. **Ledger start date + opening balances** from the sheet's last closed P&L row; history before it stays for monthly views but is excluded from balances (via the `pot_balances` view only).
14. **Tricount: share in the monthly view, cash in the full view** via the Tricount pot + IOU category. *Rejected:* adding a manual Tricount-balance line to reconciliation (owner stopped doing it — too much hassle).
15. **Uncategorised is explicit** — counts as unassigned spending, blocks close.
16. **Unaccounted counts in totals** (`is_in_totals = true`).
17. **Naming:** `transactions` (not `entries` — clashes with Tricount "entries"), `categories` for the what-for tag (not `flows` — every transaction is a flow), `reset_into_pot_id` (not `sweep_to_pot_id`), `_date` for calendar days. Full rules in `DATA_MODEL.md` → *Naming conventions*.
18. **No soft delete**; the closed-month lock is the history guarantee.

## Stages

One PR per stage; each leaves the app shippable. Rename UI wording in the same stage that renames the schema (the UI must never say "category" for a pot once stage 1 lands).

### [ ] Stage 0 — Tricount inbox (on today's model)

Independent quick win. Synced Tricount entries land in an "Uncategorised" category (system-flagged) instead of the shared Tricount category; the user assigns each to a real category from the expense list. Mirrored rows become read-only **except** the category. Re-sync never overwrites the chosen category. Budget page shows uncategorised as "unassigned spending".

*Acceptance:* new entry → Uncategorised; recategorise → survives a re-sync with upstream changes; existing mirrored rows migrated to Uncategorised or left in Tricount (decide in PR).

### [ ] Stage 1 — Rename & reshape (no visible change)

`categories → pots`, `expenses → transactions` (`category_id → from_pot_id`, `expense_date → transaction_date`, `logged_by_user_id → created_by_user_id`, `split_group_id → group_id`), `amount` becomes base-currency (`converted_amount` → `amount`; old `amount`/`currency` → `original_amount`/`original_currency` only when foreign; drop `converted_currency`, `exchange_rate`), `is_active` kept, `exclude_from_budget_total` kept for now (removed in stage 2). Tricount: `tricount_entry_map.link_id → tricount_link_id`, `paid_converted_amount → paid_amount`, `share_converted_amount → share_amount`. UI wording "category" → "pot".

*Inventory to update:* `budget_summary` view, RPCs (`rebalance_budget`, `save_budget`, `allocate_from_unallocated`, `top_up_budget`, `get_expenses_and_categories`), realtime broadcast trigger + topic names (`expenses_household_*`) + `realtime.messages` policy, RLS policies, seeds, generated types, `src/lib/**` (incl. `split-utils`, `tricount/sync.ts`), tests, `DATA_MODEL.md`.

*Acceptance:* app behaves identically; lint/typecheck/test green; Dev dogfooded.

### [ ] Stage 2 — Ledger core

`to_pot_id`, `pots.role` + `reset_into_pot_id` + `owner_user_id`, system pots Unallocated / Monthly / Uncategorised / Tricount per household, new `categories` table with system rows, `households.ledger_start_date`, `pot_balances` view. Migrate `budget_allocations` → transfers `Monthly → pot` dated the 1st, `monthly_budget_targets` → `Unallocated → Monthly`; rebuild RPCs (rebalance = transfer pot→pot, top-up = transfer from Monthly, with the two-step shortcut) and the budget page on transactions. Drop `budget_allocations`, `monthly_budget_targets`, `exclude_from_budget_total`. Allowances → long-term pots with owner.

*Acceptance:* monthly budget page shows the same numbers as before for historical months; rebalance/top-up work; as-of history derivable.

### [ ] Stage 3 — Month close

`month_closes`, `close_month` / `reopen_month` RPCs, lock trigger, in-order rule, "previous month not closed" nag with pending reset shown on Unallocated, Uncategorised-blocks-close.

### [ ] Stage 4 — Full ledger UI

Log income (to Unallocated or any pot), transfers between pots, spending from long-term pots with optional category, refunds (negative spending), Pots screen with balances, opening-balance seeding at a chosen `ledger_start_date` (SQL from the sheet's last closed P&L row is fine — no import screen needed). Tricount pot opening = current Tricount balance (`getTricountLinkBalances`).

### [ ] Stage 5 — Sheet export → **cutover**

Ledger view in the sheet's exact columns (`Date, Month, Amount, Pot From, Pot To, Flow, Type, Label`): monthly-pot spending aggregated to one line per pot per month (or one line per month — match the sheet), everything else line by line. P&L view: month-end Income, Spending (respecting `is_in_totals`), per-pot balances. Copy-paste friendly (TSV). After this stage the owner stops keeping the ledger tab by hand.

### [ ] Stage 6 — Tricount IOU

Generate share + IOU pairs per mirrored entry (`group_id`), import settlements (check how Tricount's API represents reimbursements — `BALANCE` vs NORMAL — on real data first), `tricount_entry_map` points at the group. Replaces `getTricountCashflowAdjustment` / "cash out".

### [ ] Stage 7 — Recurring

`recurring_transactions`, management UI, "generate month" (bulk or one by one), month-start template for allocations + allowance funding.

### Later

Accounts (+ default account per user per pot), in-app reconciliation (balance snapshots, net-worth delta), `refund_of` link.

## Open questions

- Stage 0: what happens to already-mirrored rows in the Tricount category — move to Uncategorised (forces re-categorising history) or leave as is?
- Stage 5: aggregate monthly spending per pot or as a single line, to match the sheet exactly?
- Stage 6: Tricount API representation of reimbursements.
- Does Monthly reset into Unallocated in one step per month, or does each monthly pot reset straight into Unallocated (one figure "monthly over/under" vs simpler)? Current plan: via Monthly.
