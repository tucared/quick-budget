# Quick Budget

A budgeting app for a household of partners tracking day-to-day discretionary spending, in a base currency and one secondary currency. Fixed costs (rent, subscriptions) are out of scope.

## Language

### People

**Household**:
The group of partners who share one budget; owns every category, expense, and allocation.
_Avoid_: Family, account, workspace

**Member**:
A person belonging to exactly one household. Distinct from a **Tricount participant**.
_Avoid_: User (in prose), partner

### Budgeting

**Category**:
A named bucket that expenses are filed under and that receives an allocation each month.
_Avoid_: Envelope, bucket

**Shared category**:
A category whose allocation counts toward the household's monthly budget ("our spending").
_Avoid_: Regular category, joint category

**Allowance**:
A category belonging to one member for personal spending, kept outside the monthly budget total.
_Avoid_: Personal category, pocket money

**Allocation**:
The amount planned for one category in one month.
_Avoid_: Budget (as a noun for a single category), limit

**Monthly target**:
The optional total a household sets for the sum of its shared-category allocations in a month.
_Avoid_: Total budget, cap

**Unallocated pool**:
The part of the monthly target not yet assigned to any shared category.
_Avoid_: Remaining budget, buffer

**Rebalance**:
Moving allocation between categories mid-month to match changed priorities.
_Avoid_: Transfer, reallocate

**Overspent**:
A category whose month-to-date spending exceeds its allocation.
_Avoid_: Over budget, exceeded

### Expenses

**Expense**:
A single logged outflow of money, filed under one category on one date. A manually logged expense is always wholly the household's own cost; shared costs with outsiders go through a Tricount.
_Avoid_: Transaction, purchase, spend

**Cap**:
A ceiling on how much of an expense a shared category absorbs; the excess overflows to an allowance.
_Avoid_: Limit, maximum

**Overflow**:
The part of a capped expense above the cap, charged to a member's allowance.
_Avoid_: Excess, remainder

**Split expense**:
One purchase stored as two linked expenses: the capped part in the shared category and the overflow in an allowance.
_Avoid_: Shared expense, divided expense

**Cash expense**:
An expense flagged as paid in physical cash, so the household knows not to look for it in bank statements. Informational only; it affects no total.
_Avoid_: Cash payment

### Currency

**Base currency**:
The household's accounting currency; every total and cap is denominated in it.
_Avoid_: Home currency, main currency

**Secondary currency**:
The one alternative currency a household can enter expenses in.
_Avoid_: Foreign currency, second currency

**Converted amount**:
An expense's value expressed in the base currency at the rate captured when it was logged.
_Avoid_: Normalized amount

### Spent and cash out

**Spent**:
What the household consumed in a month against its allocations: its own share of costs, regardless of who fronted the money. The figure the budget aims at.
_Avoid_: Consumption, expenses total

**Cash out**:
What actually left the household's wallet in a month: manual expenses, plus what the household paid in Tricount entries, net of Tricount income. Measured per calendar month and before any reimbursement or settlement handled outside the app. Reported as three figures: shared categories (including Tricount), and each member's allowance.
_Avoid_: Cashflow, real spend

**Income**:
A Tricount entry typed as income. Reduces cash out; never counts as spent. Settlements between participants are not income and are ignored by the app.
_Avoid_: Refund, revenue

**Financial journal**:
The household's month-end ledger of money movements, currently a separate spreadsheet outside the app. Each month it receives three lines from the app's cash out; settlements between friends are entered directly in it.
_Avoid_: Books, accounts

### Tricount

**Tricount**:
An external shared-ledger app whose expenses the household can mirror into Quick Budget.

**Tricount participant**:
A person in a Tricount ledger, who may or may not be a household member.
_Avoid_: Tricount member, tricount user

**Link**:
A connection from the household to one Tricount ledger, which can be paused.
_Avoid_: Integration, connection

**Household share**:
The portion of a Tricount entry attributable to participants mapped to household members; this is what gets mirrored as an expense.
_Avoid_: Our part, split

**Tricount category**:
The built-in shared category populated only by the sync, for both expenses and income.
_Avoid_: Trip category

**Synced expense**:
An expense mirrored from a Tricount entry, always filed under the Tricount category, so no cap applies to it.
_Avoid_: Imported expense, Tricount expense

**Owe/owed balance**:
The net difference between what the household paid and its share across a Tricount's entries.
_Avoid_: Debt, settlement
