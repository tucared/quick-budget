#!/bin/bash
# Auto-install dependencies on session start

echo "Installing npm dependencies..."
npm install

# Cloud-only setup (CLAUDE_CODE_REMOTE=true is injected by Claude Code web)
if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then

  # Download Chromium + Linux system libs needed by agent-browser
  # (agent-browser CLI is now installed via npm install above)
  echo "Installing Chromium for agent-browser..."
  npx agent-browser install --with-deps || true

  # Write .env.local from env vars set in the Claude Code web environment settings
  if [ ! -f .env.local ] && [ -n "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    printf "NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=%s\n" \
      "$NEXT_PUBLIC_SUPABASE_URL" \
      "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY" > .env.local
    echo ".env.local written from environment variables."
  fi

  # Start Next.js dev server in background
  echo "Starting Next.js dev server..."
  npm run dev > /tmp/nextjs.log 2>&1 &

  # Wait up to 30s for the app to be ready
  echo "Waiting for app on port 3000..."
  for i in $(seq 1 30); do
    curl -s http://localhost:3000 > /dev/null 2>&1 && echo "App ready." && break
    sleep 1
  done

fi

exit 0
