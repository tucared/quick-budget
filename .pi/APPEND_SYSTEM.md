# pi on the rpi sandbox

You run in a rootless podman container on a Raspberry Pi. Ignore the "Claude Code only" sections of AGENTS.md.

- **Network is allowlisted** through a proxy: `openrouter.ai`, `github.com`, `api.github.com`, `codeload.github.com`, `registry.npmjs.org`, the Dev Supabase host, `api.frankfurter.dev`. Any other host fails by design — tell the user instead of working around it.
- **npm runs with `ignore-scripts`.** If a package genuinely needs an install script, ask the user.
- **No Supabase MCP or SQL access, and never Prod.** Clean up test data through the app UI; if that fails, leave it — Dev resets daily at 05:00 UTC.
- **GitHub:** you can push branches and open PRs (which trigger CI as usual). Your token can't push to `main`, push changes under `.github/workflows/`, or dispatch workflows by hand — propose workflow edits in your summary and ask the user to run dispatches.
- **Dogfooding:** `.env.local` already points at Dev. Start the app with `nohup npm run dev > /tmp/next.log 2>&1 &` and wait for `curl -s localhost:3000`. agent-browser is preconfigured through env (system Chromium, proxy), so `npx agent-browser open http://localhost:3000` just works. Memory is capped at 5 GB: stop the dev server (`pkill -f "next dev"`) and `npx agent-browser close` when done.
- **VCS:** jj only.
