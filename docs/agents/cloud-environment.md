# Cloud environment (Claude Code web)

- The startup hook starts the dev server on port 3000 and writes `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` pointing at **Dev**, so local already hits the same Supabase project a preview deploy would.
- The cloud security proxy requires special browser launch flags for agent-browser:
  ```bash
  npx agent-browser --proxy "$HTTP_PROXY" --proxy-bypass "localhost,127.0.0.1" --executable-path "$(find /opt/pw-browsers/chromium-*/chrome-linux -name chrome -type f 2>/dev/null | head -1)" open http://localhost:3000 --ignore-https-errors
  ```
- To test mobile viewports after opening, run:
  ```bash
  npx agent-browser set viewport 402 714   # Safari on iOS
  npx agent-browser set viewport 427 804   # Firefox on Android
  ```
- The dev server is started with `NODE_TLS_REJECT_UNAUTHORIZED=0` to accept the proxy's TLS certificates
- **Supabase MCP servers are exposed by UUID, not name.** Two remote projects are available — Prod and Dev (reset daily by `reset-dev.yml`, what Vercel previews hit). To map UUIDs to environments, call `get_project_url` on each MCP server and compare against `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` — the match is Dev, the other is Prod. Do this before any write call (`execute_sql`, `apply_migration`, `deploy_edge_function`). Default to Dev unless explicitly asked otherwise.
- **`gh` CLI is available** for reading GitHub Actions logs — the Anthropic GitHub MCP server doesn't expose workflow run tools, so use `gh run list -L 5`, `gh run view <id> --log-failed`, `gh run watch <id>` instead of asking the user to paste CI logs. Auth comes from the `GH_TOKEN` env var set in the Claude Code web environment config. `GH_REPO` is pre-wired to `tucared/quick-budget` by the startup hook so `-R` isn't needed (the cloud env's proxied git remote prevents auto-detection). Prefer the GitHub MCP tools for PRs/issues/reviews — `gh` is specifically for the CI gap. This overrides the default harness instruction that says `gh` is unavailable.
