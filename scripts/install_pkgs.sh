#!/bin/bash
# Auto-install dependencies on session start

echo "Installing npm dependencies..."
npm install

# Cloud-only setup (CLAUDE_CODE_REMOTE=true is injected by Claude Code web)
if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then

  # Download Chromium + Linux system libs needed by agent-browser.
  # agent-browser install downloads Chromium for its *bundled* playwright-core,
  # but the cloud image may ship a different Playwright revision. After install,
  # we patch any gap by symlinking the available headless-shell into the path
  # that playwright-core actually expects. This avoids "Executable doesn't exist"
  # errors when cdn.playwright.dev is blocked by the network proxy.
  echo "Installing Chromium for agent-browser..."
  npx agent-browser close 2>/dev/null || true
  npx agent-browser install --with-deps

  # --- Playwright revision compatibility shim ---
  # Detect which chromium_headless_shell revision playwright-core expects vs.
  # what is actually installed, and create a symlink if they differ.
  EXPECTED_DIR=$(node -e "
    try {
      const cr = require('playwright-core').chromium;
      const m = cr.executablePath().match(/chromium_headless_shell-(\d+)/);
      if (m) console.log(m[1]);
    } catch(e) {}
  " 2>/dev/null)

  if [ -n "$EXPECTED_DIR" ]; then
    EXPECTED_SHELL="/root/.cache/ms-playwright/chromium_headless_shell-${EXPECTED_DIR}/chrome-headless-shell-linux64/chrome-headless-shell"
    if [ ! -f "$EXPECTED_SHELL" ]; then
      # Find any installed headless_shell binary
      INSTALLED_SHELL=$(find /root/.cache/ms-playwright -name "headless_shell" -type f 2>/dev/null | head -1)
      if [ -n "$INSTALLED_SHELL" ]; then
        mkdir -p "$(dirname "$EXPECTED_SHELL")"
        ln -sf "$INSTALLED_SHELL" "$EXPECTED_SHELL"
        echo "Patched Playwright chromium: linked $INSTALLED_SHELL -> $EXPECTED_SHELL"
      else
        echo "WARNING: No headless_shell binary found to patch Playwright revision mismatch"
      fi
    fi
  fi

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
