# Data Model

## Overview

Normalized (2NF-3NF) approach optimized for transactional workloads with simple analytical queries.

## Entity Relationship Diagram

```mermaid
erDiagram
    users }o--|| households : "belongs to"
    users ||--o{ expenses : "logs"
    users ||--o{ accounts : "owns (for display)"

    households ||--o{ accounts : "contains"
    households ||--o{ categories : "has"
    households ||--o{ budget_allocations : "plans"
    households ||--o{ recurring_expenses : "tracks"

    categories ||--o{ budget_allocations : "allocated in"
    categories ||--o{ expenses : "categorizes"
    categories ||--o{ recurring_expenses : "classifies"

    accounts ||--o{ expenses : "sources from"
    accounts ||--o{ recurring_expenses : "pays from"

    recurring_expenses ||--o{ expenses : "generates"

    users
    households
    categories
    budget_allocations
    expenses
    accounts
    recurring_expenses
```

## Key Design Decisions

### 1. Household-Based Sharing Model
All financial data (accounts, categories, budget allocations, recurring expenses) is scoped to households. Users belong to exactly one household via `users.household_id`. All household members have full read/write access to household data. Audit trails (`accounts.owner_user_id`, `expenses.logged_by_user_id`) track who performed actions without restricting access. Default categories are auto-seeded on household creation.

### 2. No Budgets Table - Monthly Cadence
No separate budgets table. Monthly periods are represented by `budget_month` (date) fields on `budget_allocations`. Strongly oriented toward monthly planning cycle.

### 3. Categories with Type Flag
Both monthly spending categories and long-term accumulation goals are in the same `categories` table, distinguished by `category_type` (e.g., `monthly` vs `long_term`). Personal allowances are just categories (e.g., "Max's Allowance", "Sam's Allowance"). Categories are household-scoped (not per-month) and reused each month with different allocations.

### 4. Budget Allocations
`budget_allocations` tracks how much is allocated to each category per month (via `budget_month` field). Works for both monthly spending categories and long-term accumulation goals. Allows easy rebalancing and clear separation between plan (allocation) and actual (expenses).

### 5. Multi-Currency Support
Expenses store both original currency/amount and converted amount with exchange rate preserved directly on each expense record for historical accuracy.

### 6. Recurring Expenses Linked to Actual Expenses
Recurring expenses (bills, subscriptions) are tracked with frequency and due dates. Each recurring expense generates multiple actual expense records over time, linked via `recurring_expense_id` FK. This ensures all spending is consistently tracked in one place.
