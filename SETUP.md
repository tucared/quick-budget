# Quick Budget - Setup Guide

This guide will help you get Quick Budget up and running locally and in production.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- A Supabase account (free tier is fine)

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Create a new project (note: it takes a few minutes to provision)
3. Once ready, go to **Project Settings** → **API**
4. Copy your:
   - Project URL
   - Anon/Public key

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run Database Migration

In your Supabase project dashboard:

1. Go to **SQL Editor**
2. Click **New Query**
3. Copy the contents of `supabase/migrations/20260116000000_initial_schema.sql`
4. Paste into the SQL editor
5. Click **Run** to execute the migration

This will:
- Create all necessary tables (users, categories, accounts, expenses)
- Set up Row Level Security (RLS) policies
- Seed 10 default spending categories
- Create triggers for automatic user onboarding

### 5. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing the App

1. **Sign Up**: Create a new account at `/signup`
2. **Automatic Onboarding**: A default "Primary Account" is automatically created for you
3. **Add Expenses**: Navigate to `/expenses` and start logging expenses
4. **Batch Entry Test**: Add 5 expenses in a row to test the stay-open-after-save feature
5. **Smart Defaults**: Notice how the category and account persist between entries

## Production Deployment (Vercel)

### 1. Push to GitHub

```bash
# Using jujutsu (as per project guidelines)
jj git push
```

### 2. Deploy to Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Import your repository
3. Vercel will auto-detect Next.js
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click **Deploy**

### 3. Configure Supabase for Production

In your Supabase project settings:

1. Go to **Authentication** → **URL Configuration**
2. Add your Vercel deployment URL to:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: `https://your-app.vercel.app/**`

## Project Structure

```
quick-budget/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── expenses/           # Main expense tracking page
│   │   ├── login/              # Login page
│   │   ├── signup/             # Signup page
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── expense-form.tsx    # Expense entry form
│   │   └── expense-list.tsx    # Recent expenses list
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client setup
│   │   ├── types.ts            # TypeScript types
│   │   ├── validations.ts      # Zod schemas
│   │   └── utils.ts            # Utility functions
│   └── middleware.ts           # Auth middleware
├── supabase/
│   └── migrations/             # Database migrations
├── .env.local                  # Environment variables (gitignored)
└── package.json
```

## Key Features Implemented (JTBD #17)

- ✅ Frictionless expense logging (< 10 seconds)
- ✅ Smart defaults (remembers last category, account, currency)
- ✅ Form stays open after save for batch entry
- ✅ Real-time expense list updates
- ✅ Mobile-first responsive design
- ✅ Automatic user onboarding (default account creation)
- ✅ Email/password authentication

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Troubleshooting

### "Invalid API key" error
- Double-check your `.env.local` file
- Ensure you copied the **Anon/Public** key, not the Service Role key
- Restart the development server after changing environment variables

### "User not found" or auth issues
- Verify the migration ran successfully
- Check that RLS policies are enabled on all tables
- Verify the trigger `on_auth_user_created` exists

### Categories not showing up
- Ensure the seed data was inserted (check `categories` table in Supabase dashboard)
- Verify the `is_active` column is set to `true`

### Real-time updates not working
- Check that your Supabase project has Realtime enabled (it's on by default)
- Verify browser console for any subscription errors

## Next Steps

After completing JTBD #17, consider implementing:

- JTBD #1-5: Monthly planning & budget setting
- JTBD #6-9: Monthly review & progress tracking
- JTBD #19: Foreign currency conversion
- JTBD #7: Multi-user/partner access

See `PROGRESS.md` for the full roadmap.

## Support

For issues or questions:
- Check existing project documentation (DATA_MODEL.md, PROGRESS.md, JTBD.md)
- Review Supabase logs in the dashboard
- Check browser console for client-side errors
