# Development Progress

## Legend
- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete

---

## Monthly Planning & Budget Setting

### [ ] JTBD #1: Review spending capacity
When reviewing our finances for upcoming month, we want to know our spending targets, so daily purchase decisions feel straightforward

### [ ] JTBD #2: Account for recurring expenses
When doing monthly review, we want to see our recurring bills alongside variable spending, so we know our true discretionary budget before setting targets

### [ ] JTBD #3: Set realistic targets based on history
When planning next month, we want to see how our spending targets compared to actuals this month, so we can set more realistic budgets

### [ ] JTBD #4: Anticipate upcoming large bills
When reviewing our finances, we want to see which annual/irregular bills are coming up in the next few months, so we're not surprised when a chunk of money disappears from our account

### [ ] JTBD #5: Understand our fixed costs
When planning our budget, we want to see our true baseline expenses (bills, subscriptions, taxes), so we know what lifestyle we can actually afford

---

## Monthly Review & Progress Tracking

### [ ] JTBD #6: Track accumulation goals
When reviewing our finances at month-end, we want to see if we're on track with our earmarked savings (holidays, house, retirement), so we can adjust our accumulation goals or monthly spending if we're falling behind

### [ ] JTBD #7: Ensure fairness between partners
When doing our monthly review, we want to see each person's allowance balance and spending, so we can ensure the system feels fair

### [ ] JTBD #8: Feel progress together
When we discuss money, we want to see our net worth trend, so we can feel like we're making progress together

### [ ] JTBD #9: See impact of extra income
When I get paid for a freelance project, I want to see the impact on our net worth trend, so I can feel the effort was worth it

---

## Daily Spending Decisions

### [ ] JTBD #10: Check shared discretionary budget
When we're deciding whether to go out, we want to see if we have budget left in shared discretionary spending, so we can enjoy it without worry

### [ ] JTBD #11: Spend personal allowance guilt-free
When I'm about to spend on something personal, I want to see my allowance balance, so I can spend guilt-free without affecting our shared goals

### [ ] JTBD #12: Make big purchase decisions confidently
When considering a big purchase right now, we want to see our overall financial picture, so we can decide if now is the right time

---

## Mid-Month Adjustments & Rebalancing

### [ ] JTBD #13: Get notified when overspending
When I log an expense that makes a category overspent, I want to be notified immediately, so I can take action before it affects our overall budget

### [ ] JTBD #14: Rebalance categories mid-month
When we want to spend in a category that's exhausted or about to, we want to quickly move money from categories we're underspending, so we can enjoy what we want without guilt or breaking our plan

### [ ] JTBD #15: Understand tradeoffs of emergency adjustments
When considering pulling from earmarked savings mid-month, we want to see the impact on our goals (e.g., "less money on upcoming holiday"), so we understand the tradeoff

### [ ] JTBD #16: Understand why categories run out
When I see a category running out faster than expected, I want to review the individual expenses in it, so I can decide whether to rebalance now or adjust next month's budget based on what I learn

---

## Expense Logging & Tracking

### [x] JTBD #17: Log expenses without friction, even when catching up
When I've spent money (whether just now or earlier today), I want to log it in seconds without interrupting what I'm doing, so it doesn't feel like a chore even if I have a few to enter

### [ ] JTBD #18: Stay accountable to each other
When either of us hasn't logged any expenses in several days, we want to be notified, so we know our shared financial picture might be incomplete and trigger a catch up

### [ ] JTBD #19: Enter foreign currency naturally
When logging an expense in BRL, I want to enter the amount I actually paid, so I don't have to calculate conversions or delay entering it

---

## Data Migration & Import

### [ ] JTBD #20: Import historical data from current app
When setting up the new system, I want to import my expense and budget data from CSV exports of my current app, so I have continuity of my financial history and can see trends without starting from zero

---

## Technical Foundation Checklist

Track infrastructure work that enables multiple JTBDs:

- [x] Next.js app structure with frontend & backend (single repo, not monorepo)
- [x] Supabase project setup (database + auth)
- [x] Database schema v1 (accounts, expenses, categories, users)
- [ ] Multi-user auth (partner access to shared budget) - Deferred to JTBD #7
- [x] Deployment pipeline (Vercel-ready)
- [x] UI component library (shadcn/ui)
