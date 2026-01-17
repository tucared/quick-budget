# Database Seeds Organization

This directory contains seed files organized for both production and development environments.

## File Structure

Seed files are executed in **lexicographic order** (alphabetical by filename):

### 1. `01_categories.sql` - Production Seed
**Purpose**: Default spending categories and long-term goal categories
**Used in**: Production + Local Development
**Deployment**: Manually run in Supabase Studio SQL Editor for production

Contains:
- 10 default monthly spending categories (Groceries, Dining Out, etc.)
- 2 default long-term goal categories (Holiday Fund, Emergency Fund)

### 2. `02_users_and_accounts.sql` - Production Seed
**Purpose**: Initial user accounts and their associated payment accounts
**Used in**: Production + Local Development
**Deployment**: Manually run in Supabase Studio SQL Editor for production

Contains:
- 2 user accounts (auth.users + public.users)
- Payment accounts for each user (credit cards, bank accounts, etc.)

⚠️ **Production Note**: Update email addresses, passwords, and user metadata before running in production!

### 3. `03_expenses_dev_only.sql` - Development Only
**Purpose**: Sample expense data for local testing
**Used in**: Local Development ONLY
**Deployment**: NEVER run in production - expenses are logged via the app

Contains:
- Sample expenses for User 1 (groceries, dining, transportation)
- Sample expenses for User 2 (groceries, dining)

## Local Development

All seed files run automatically when you:
```bash
supabase start  # First time only
supabase db reset  # Resets DB + runs migrations + runs seeds
```

## Production Deployment

For production, **manually run only files 1 and 2** in Supabase Studio SQL Editor:

1. Navigate to Supabase Studio → SQL Editor
2. Copy and paste contents of `01_categories.sql` → Run
3. Copy and paste contents of `02_users_and_accounts.sql` → Run (after updating user details!)
4. **DO NOT run** `03_expenses_dev_only.sql` in production

## Why This Organization?

- **Clear separation**: Production data vs. development test data
- **Lexicographic ordering**: Numbered prefixes ensure correct execution order
- **Reusable**: Same files work for both local dev and production (just subset for prod)
- **Safe**: Development-only data clearly marked to prevent accidental production use

## Adding New Seeds

Follow the naming convention:
- `01-09_*.sql` - Production seeds (core data needed in production)
- `10-99_*_dev_only.sql` - Development seeds (test data only)

This ensures production seeds always run before development seeds.
