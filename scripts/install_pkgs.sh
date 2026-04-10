#!/bin/bash
set -x
echo "=== HOOK START $(date) ==="

echo "Installing npm dependencies..."
npm install 2>&1 | tail -5
echo "=== NPM DONE $(date) ==="

if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then
  echo "=== CLOUD ENV DETECTED, skipping all cloud setup ==="

  # Just write .env.local, skip everything else
  if [ ! -f .env.local ] && [ -n "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    printf "NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=%s\n" \
      "$NEXT_PUBLIC_SUPABASE_URL" \
      "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY" > .env.local
    echo ".env.local written."
  fi
fi

echo "=== HOOK END $(date) ==="
exit 0
