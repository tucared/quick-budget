# Production Deployment Guide

Guide for deploying Quick Budget to production using Vercel + Supabase Cloud.

> **Note:** For local development, see [README.md](./README.md)

## Step 1: Create Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Choose organization and set:
   - **Name**: quick-budget-prod (or your choice)
   - **Database Password**: (save this securely)
   - **Region**: Choose closest to your users
4. Wait ~2 minutes for provisioning

## Step 2: Push Database Schema

```bash
# Link to your production project
supabase link --project-ref your-project-ref

# Push migrations (creates all tables)
supabase db push

# Verify in Supabase Dashboard → Table Editor
```

**Important:** Do NOT run the seed.sql in production (test accounts only needed locally).

## Step 3: Get Supabase Credentials

In Supabase Dashboard → Project Settings → API:
- **Project URL**: `https://xxxxx.supabase.co`
- **Anon/Public Key**: `eyJhbGc...` (long JWT token)

Save these for Vercel.

## Step 4: Deploy to Vercel

1. Push code to GitHub:
2. Go to https://vercel.com/new
3. Import your repository
4. Vercel auto-detects Next.js
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = Your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Your anon key
6. Click "Deploy"

## Step 5: Configure Supabase Auth

In Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/**`

## Step 6: Verify Deployment

1. Visit your Vercel URL
2. Test login (create a user first via Supabase Dashboard)
3. Test expense creation
4. Check Supabase Dashboard → Table Editor to see data
   - Build: `npm run build`
   - Serve: `npm start` or use Docker
3. **Configure environment variables** on your server
4. **Set up SSL/TLS** for both services
5. **Configure auth redirect URLs** in Supabase config

## Database Management

### Running Migrations

**Production:**
```bash
# After creating new migrations locally
supabase link --project-ref your-project-ref
supabase db push
```

**Rollback:**
```bash
# Supabase doesn't support automatic rollback
# Create a new migration that reverses changes
supabase migration new rollback_feature_name
```

### Viewing Data

- **Supabase Dashboard**: https://app.supabase.com → Your Project → Table Editor
- **Direct SQL**: Dashboard → SQL Editor
- **Logs**: Dashboard → Logs

## Environment Variables

### Production (.env.production or Vercel dashboard)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
```
