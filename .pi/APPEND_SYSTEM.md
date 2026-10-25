# pi on the rpi sandbox

You run in a rootless podman container on a Raspberry Pi. Ignore the "Claude Code only" sections of AGENTS.md.

- **Network is allowlisted** through a proxy: `openrouter.ai`, `github.com`, `api.github.com`, `codeload.github.com`, `registry.npmjs.org`, the Dev Supabase host, `api.frankfurter.app`. Any other host fails by design — tell the user instead of working around it.
- **npm runs with `ignore-scripts`.** If a package genuinely needs an install script, ask the user.
- **No Supabase MCP or SQL access, and never Prod.** Clean up test data through the app UI; if that fails, leave it — Dev resets daily at 05:00 UTC.
- **GitHub:** you can push branches and open PRs (which trigger CI as usual). Your token can't push to `main`, push changes under `.github/workflows/`, or dispatch workflows by hand — propose workflow edits in your summary and ask the user to run dispatches.
- **VCS:** jj only.
