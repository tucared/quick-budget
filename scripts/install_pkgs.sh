#!/bin/bash

echo "Installing npm dependencies..."
npm install

if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then
  # Write .env.local from Claude Code web environment settings
  if [ ! -f .env.local ] && [ -n "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    printf "NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=%s\n" \
      "$NEXT_PUBLIC_SUPABASE_URL" \
      "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY" > .env.local
    echo ".env.local written from environment variables."
  fi

  # Allow Node.js to accept proxy TLS certificates
  if [ -n "$CLAUDE_ENV_FILE" ] && [ -n "$HTTPS_PROXY" ]; then
    echo "NODE_TLS_REJECT_UNAUTHORIZED=0" >> "$CLAUDE_ENV_FILE"
  fi

  # Force Node.js runtime for middleware — edge runtime can't route through the proxy
  if ! grep -q 'runtime:' src/middleware.ts; then
    sed -i 's/export const config = {/export const config = {\n  runtime: "nodejs",/' src/middleware.ts
  fi
  git update-index --assume-unchanged src/middleware.ts

  # Start Next.js dev server in background
  echo "Starting Next.js dev server..."
  NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev > /tmp/nextjs.log 2>&1 &

  echo "Waiting for app on port 3000..."
  for i in $(seq 1 30); do
    curl -s http://localhost:3000 > /dev/null 2>&1 && echo "App ready." && break
    sleep 1
  done
fi

exit 0
