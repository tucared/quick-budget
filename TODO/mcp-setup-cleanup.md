# MCP setup cleanup

The Claude Code MCP configuration that ships with this project (and what the cloud Claude Code web sessions pick up) carries more surface than this codebase actually uses. Cleaning it up tightens context budget per turn, removes foot-guns on Prod, and makes the Supabase MCP discovery step in `CLAUDE.md` redundant.

Observations come from auditing what was actually used during the PR #108 follow-ups session (PR #109).

## What's configured today

`.mcp.json` (repo root):
```json
{
  "mcpServers": {
    "supabase-local": { "type": "http", "url": "http://localhost:54321/mcp" }
  }
}
```

Cloud sessions additionally pick up (presumably from a user-level / org-level config not in this repo):
- Two Supabase MCPs surfaced as **UUIDs** (one Dev, one Prod), each with the full read/write tool set.
- A Vercel + Stagewise Toolbar MCP (~22 tools).
- The GitHub MCP.

## Issues

### 1. `supabase-local` in `.mcp.json` is dead weight in cloud sessions

The cloud Claude Code environment doesn't run a local Supabase Docker stack — it talks to the remote Dev project via the UUID-based MCP and to `http://localhost:3000` via the dev server. `supabase-local` only works when you've run `supabase start` on a local laptop.

**Action:** Either delete it from `.mcp.json`, or move it to a separate config file the cloud session won't load. The cleanest move is delete: contributors who develop locally can re-add it for themselves.

### 2. Supabase MCPs are surfaced as UUIDs

`mcp__3442722c-99c0-474a-9289-6afca37b5c55__*` and `mcp__d09f26d1-2c59-4e66-a8f8-485bfc9b2438__*`. The agent can't tell which is Dev and which is Prod without calling `get_project_url` on each and matching against `NEXT_PUBLIC_SUPABASE_URL`. `CLAUDE.md` has an entire paragraph documenting this "Supabase MCP servers are exposed by UUID, not name" workflow — the right fix is to rename them at the MCP-config level.

**Action:** Alias the two MCPs as `supabase-dev` and `supabase-prod` (wherever they're configured — Claude Code settings or an org-level MCP registry). Once renamed:
- Drop the UUID-discovery paragraph from `CLAUDE.md`.
- The agent stops needing the discovery dance every session.
- Accidental Prod writes become harder to make by autocomplete-on-prefix.

### 3. Prod Supabase MCP has write tools

The Prod MCP currently exposes `execute_sql`, `apply_migration`, `deploy_edge_function` — full write surface. The only thing keeping the agent from writing to Prod is reading the `CLAUDE.md` paragraph and inferring intent. That's not a safety boundary.

**Action:** Restrict the Prod MCP to read-only tools: `get_project_url`, `get_advisors`, `get_logs`, `list_*`, `search_docs`, `generate_typescript_types`. Drop `execute_sql`, `apply_migration`, `deploy_edge_function`. Production schema/data changes should go through:
- `migrate.yml` (auto-runs on push to `main` to push migrations)
- Manual Supabase dashboard SQL editor (deliberate, friction-gated)

Not through an agent that read a comment.

### 4. Vercel + Stagewise Toolbar MCP carries a lot of unused surface

22 tools surfaced; this session used **none**. Specifically:

**Pure noise for this project (Stagewise toolbar — we don't use it):**
- `add_toolbar_reaction`
- `change_toolbar_thread_resolve_status`
- `edit_toolbar_message`
- `get_toolbar_thread`
- `list_toolbar_threads`
- `reply_to_toolbar_thread`

**Out-of-scope Vercel actions:**
- `check_domain_availability_and_price` — not buying a domain from inside this repo.
- `deploy_to_vercel` — CI does that on PR / push.
- `get_access_to_vercel_url` — not used.
- `web_fetch_vercel_url` — not used; ordinary `WebFetch` suffices.
- `search_vercel_documentation` — `WebSearch` covers it.

**Worth keeping:**
- `get_deployment`, `get_deployment_build_logs`, `get_runtime_logs` — useful when CI fails or Prod misbehaves.
- `list_deployments`, `get_project`, `list_projects`, `list_teams` — small inventory tools.

**Action:** Trim the Vercel MCP to those five-ish tools, or disable the whole MCP and call the Vercel Management API via `WebFetch` when needed (rare). Saves ~15 tool definitions per turn.

### 5. Tool definitions cost context budget every turn

Each MCP tool definition is loaded into the system prompt on every turn (or at least made discoverable via `ToolSearch`). Tools that are never called still cost — they're indexed, ranked, and considered. The cumulative effect: agent attention is pulled toward toolbar reactions and domain shopping while the actual task is editing TypeScript.

**Net target after 1–4:** roughly 25–30 fewer tool definitions, smaller context per turn, faster tool lookup, less wandering.

## Suggested order of operations

1. Rename the Supabase MCPs (#2) — biggest UX win, no behavior change. After this, update `CLAUDE.md` to remove the UUID-discovery paragraph.
2. Remove the Stagewise toolbar tools (#4 first half) — pure subtraction, no risk.
3. Make Prod Supabase MCP read-only (#3) — safety improvement, requires deciding what counts as "read-only" (probably the full GET-style toolset + `search_docs` + `generate_typescript_types`).
4. Trim the rest of the Vercel MCP (#4 second half).
5. Delete `supabase-local` from `.mcp.json` (#1) — last because it's the smallest impact and might break a local dev workflow if someone relies on it.

## Verification

After each step, start a fresh Claude Code session in this repo and:
1. Ask the agent what MCP tools are available — confirm the trimmed list.
2. Ask it to perform a known task (e.g., "show me PR #109 status", "check Dev advisors") — confirm the right tools resolve and it doesn't go searching for the deprecated ones.
3. For #3 specifically: ask the agent to "write a test row to Prod" — confirm it can't, or has to ask for an alternative path.
