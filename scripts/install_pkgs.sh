#!/bin/bash

echo "Installing npm dependencies..."
npm install

if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then
  # Install rtk (Rust Token Killer) + transparent shims so all common
  # commands route through rtk without prompt-level instructions.
  RTK_BIN="$HOME/.local/bin/rtk"
  SHIM_DIR="$HOME/.local/bin/rtk-shims"
  if [ ! -x "$RTK_BIN" ]; then
    echo "Installing rtk..."
    mkdir -p "$HOME/.local/bin"
    arch=$(uname -m)
    case "$arch" in
      x86_64) asset="rtk-x86_64-unknown-linux-musl.tar.gz" ;;
      aarch64|arm64) asset="rtk-aarch64-unknown-linux-gnu.tar.gz" ;;
      *) echo "Unsupported arch: $arch"; asset="" ;;
    esac
    if [ -n "$asset" ]; then
      tmp=$(mktemp -d)
      curl -fsSL "https://github.com/rtk-ai/rtk/releases/latest/download/$asset" -o "$tmp/rtk.tar.gz" \
        && tar -xzf "$tmp/rtk.tar.gz" -C "$tmp" \
        && find "$tmp" -name rtk -type f -exec install -m 0755 {} "$RTK_BIN" \;
      rm -rf "$tmp"
    fi
  fi

  if [ -x "$RTK_BIN" ]; then
    mkdir -p "$SHIM_DIR"
    for cmd in git gh npm npx pnpm tsc jest vitest playwright pytest docker kubectl curl wget ls find grep prettier prisma cargo rake rspec; do
      cat > "$SHIM_DIR/$cmd" <<EOF
#!/bin/sh
# Strip shim dir from PATH so rtk can find the real binary.
PATH=\$(printf '%s' "\$PATH" | awk -v RS=: -v d="$SHIM_DIR" 'BEGIN{ORS=":"} \$0!=d{print}' | sed 's/:\$//')
exec "$RTK_BIN" $cmd "\$@"
EOF
      chmod +x "$SHIM_DIR/$cmd"
    done
    if [ -n "$CLAUDE_ENV_FILE" ]; then
      echo "PATH=$SHIM_DIR:$HOME/.local/bin:\$PATH" >> "$CLAUDE_ENV_FILE"
    fi
  fi

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
