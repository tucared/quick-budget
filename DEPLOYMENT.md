# Production Deployment Guide

Guide for deploying Quick Budget to production.

> **Note:** For local development, see [README.md](./README.md)

## Overview

Two deployment approaches:
1. **Vercel + Supabase Cloud** (Recommended) - Managed services
2. **Self-hosted** - Full control, more maintenance

## Option 1: Vercel + Supabase Cloud (Recommended)

### Step 1: Create Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Choose organization and set:
   - **Name**: quick-budget-prod (or your choice)
   - **Database Password**: (save this securely)
   - **Region**: Choose closest to your users
4. Wait ~2 minutes for provisioning

### Step 2: Push Database Schema

```bash
# Link to your production project
supabase link --project-ref your-project-ref

# Push migrations (creates all tables)
supabase db push

# Verify in Supabase Dashboard → Table Editor
```

**Important:** Do NOT run the seed.sql in production (test accounts only needed locally).

### Step 3: Get Supabase Credentials

In Supabase Dashboard → Project Settings → API:
- **Project URL**: `https://xxxxx.supabase.co`
- **Anon/Public Key**: `eyJhbGc...` (long JWT token)

Save these for Vercel.

### Step 4: Deploy to Vercel

1. Push code to GitHub:
   ```bash
   jj git push
   ```

2. Go to https://vercel.com/new
3. Import your repository
4. Vercel auto-detects Next.js
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = Your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Your anon key
6. Click "Deploy"

### Step 5: Configure Supabase Auth

In Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/**`

### Step 6: Enable User Signup (Production)

Since we removed the signup page for local dev, you need to either:

**Option A: Re-enable signup page for production**
- Add back the signup page (see git history)
- Or build an admin panel to create users

**Option B: Manual user creation**
- Use Supabase Dashboard → Authentication → Users → "Add user"
- Or use Supabase API to create users programmatically

### Step 7: Verify Deployment

1. Visit your Vercel URL
2. Test login (create a user first via Supabase Dashboard)
3. Test expense creation
4. Check Supabase Dashboard → Table Editor to see data

## Option 2: Self-Hosted

### Requirements

- Server with Docker (for Supabase)
- Node.js server or container platform (for Next.js)
- PostgreSQL database
- Domain with SSL

### Steps

1. **Self-host Supabase**: Follow https://supabase.com/docs/guides/self-hosting
2. **Deploy Next.js**:
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

### Security Notes

- Never commit `.env` files to git (already in `.gitignore`)
- Use Vercel environment variables or secrets management
- Rotate keys if accidentally exposed
- The anon key is public-facing (protected by RLS policies)

## Monitoring & Logs

### Vercel
- Dashboard → Your Project → Deployments → Logs
- Analytics and performance metrics included

### Supabase
- Dashboard → Logs → API logs, Database logs, Auth logs
- Set up alerts for errors

## Troubleshooting Production

**Build fails on Vercel**
- Check build logs for errors
- Verify all dependencies in package.json
- Test `npm run build` locally first

**Database connection errors**
- Verify environment variables are set correctly
- Check Supabase project is not paused (free tier pauses after inactivity)
- Verify RLS policies allow access

**Auth not working**
- Check redirect URLs in Supabase settings
- Verify Site URL matches your domain
- Check browser console for CORS errors

**Slow performance**
- Enable Vercel Edge Functions (if applicable)
- Check Supabase region (should be close to users)
- Review database indexes (see DATA_MODEL.md)

## Scaling Considerations

### Vercel
- Free tier: Suitable for MVPs and small apps
- Pro tier: Better for production traffic
- Automatic scaling included

### Supabase
- Free tier: 500MB database, 2GB bandwidth/month
- Pro tier: Needed for production scale
- Connection pooling via Supabase Pooler (enable in dashboard)

## Backup & Recovery

### Database Backups
- Supabase Pro: Daily automatic backups
- Manual backup: Dashboard → Database → Backups → Download
- Point-in-time recovery available on Pro tier

### Disaster Recovery Plan
1. Keep local copy of migrations in git
2. Export critical data regularly
3. Document restore procedures
4. Test recovery process

## Security Checklist

- [ ] Environment variables set correctly
- [ ] RLS policies enabled on all tables
- [ ] No exposed secrets in code
- [ ] Auth redirect URLs configured
- [ ] SSL/HTTPS enabled (automatic on Vercel)
- [ ] Database backups enabled
- [ ] Error tracking configured (Sentry, etc.)

## Post-Deployment

After successful deployment:
1. Set up error monitoring (Sentry, LogRocket, etc.)
2. Configure analytics (if needed)
3. Set up uptime monitoring
4. Document runbook for common issues
5. Schedule regular database backups review
