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
  # The cloud image pre-installs a Playwright chromium revision, but npm install
  # may pull a newer playwright-core that expects a different revision. The new
  # revision also renames directories (chrome-linux -> chrome-linux64) and
  # binaries (headless_shell -> chrome-headless-shell). When cdn.playwright.dev
  # is blocked by the network proxy the download silently fails, so we bridge
  # the gap with symlinks.
  PW_CACHE="/root/.cache/ms-playwright"

  # Detect expected Playwright chromium revision from playwright-core.
  # chromium.executablePath() returns e.g. .../chromium-1208/chrome-linux64/chrome
  # The headless shell always uses the same revision number.
  EXPECTED_CR_REV=$(node -e "
    try {
      const cr = require('playwright-core').chromium;
      const m = cr.executablePath().match(/chromium-(\d+)/);
      if (m) console.log(m[1]);
    } catch(e) {}
  " 2>/dev/null)
  EXPECTED_HS_REV="$EXPECTED_CR_REV"

  # Find any pre-installed chromium revision on the image
  INSTALLED_CR_DIR=$(ls -d "$PW_CACHE"/chromium-[0-9]* 2>/dev/null | head -1)
  INSTALLED_HS_DIR=$(ls -d "$PW_CACHE"/chromium_headless_shell-[0-9]* 2>/dev/null | head -1)

  # --- Patch chromium (full browser) ---
  if [ -n "$EXPECTED_CR_REV" ] && [ -n "$INSTALLED_CR_DIR" ]; then
    EXPECTED_CR_PATH="$PW_CACHE/chromium-${EXPECTED_CR_REV}/chrome-linux64/chrome"
    if [ ! -f "$EXPECTED_CR_PATH" ]; then
      # Find the actual chrome binary (may be in chrome-linux/ or chrome-linux64/)
      ACTUAL_CHROME=$(find "$INSTALLED_CR_DIR" -name "chrome" -type f 2>/dev/null | head -1)
      if [ -n "$ACTUAL_CHROME" ]; then
        ACTUAL_DIR=$(dirname "$ACTUAL_CHROME")
        TARGET_DIR="$PW_CACHE/chromium-${EXPECTED_CR_REV}/chrome-linux64"
        mkdir -p "$TARGET_DIR"
        # Symlink all files from the installed directory
        for f in "$ACTUAL_DIR"/*; do
          ln -sf "$f" "$TARGET_DIR/$(basename "$f")"
        done
        # Copy marker files so Playwright considers it installed
        cp "$INSTALLED_CR_DIR/INSTALLATION_COMPLETE" "$PW_CACHE/chromium-${EXPECTED_CR_REV}/" 2>/dev/null
        cp "$INSTALLED_CR_DIR/DEPENDENCIES_VALIDATED" "$PW_CACHE/chromium-${EXPECTED_CR_REV}/" 2>/dev/null
        echo "Patched Playwright chromium: linked $(dirname "$ACTUAL_CHROME") -> $TARGET_DIR"
      else
        echo "WARNING: No chrome binary found to patch Playwright chromium revision mismatch"
      fi
    fi
  fi

  # --- Patch chromium_headless_shell ---
  if [ -n "$EXPECTED_HS_REV" ] && [ -n "$INSTALLED_HS_DIR" ]; then
    EXPECTED_HS_PATH="$PW_CACHE/chromium_headless_shell-${EXPECTED_HS_REV}/chrome-headless-shell-linux64/chrome-headless-shell"
    if [ ! -f "$EXPECTED_HS_PATH" ]; then
      # Find the actual headless binary (may be named headless_shell or chrome-headless-shell)
      ACTUAL_HS=$(find "$INSTALLED_HS_DIR" -name "headless_shell" -o -name "chrome-headless-shell" 2>/dev/null | head -1)
      if [ -n "$ACTUAL_HS" ]; then
        ACTUAL_DIR=$(dirname "$ACTUAL_HS")
        TARGET_DIR="$PW_CACHE/chromium_headless_shell-${EXPECTED_HS_REV}/chrome-headless-shell-linux64"
        mkdir -p "$TARGET_DIR"
        # Symlink all files from the installed directory
        for f in "$ACTUAL_DIR"/*; do
          ln -sf "$f" "$TARGET_DIR/$(basename "$f")"
        done
        # Create the expected binary name alias if it doesn't exist
        if [ ! -f "$TARGET_DIR/chrome-headless-shell" ]; then
          ln -sf "$ACTUAL_HS" "$TARGET_DIR/chrome-headless-shell"
        fi
        # Copy marker files
        cp "$INSTALLED_HS_DIR/INSTALLATION_COMPLETE" "$PW_CACHE/chromium_headless_shell-${EXPECTED_HS_REV}/" 2>/dev/null
        cp "$INSTALLED_HS_DIR/DEPENDENCIES_VALIDATED" "$PW_CACHE/chromium_headless_shell-${EXPECTED_HS_REV}/" 2>/dev/null
        echo "Patched Playwright headless shell: linked $(dirname "$ACTUAL_HS") -> $TARGET_DIR"
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
