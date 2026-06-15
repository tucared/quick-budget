import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { getServerUser } from "@/lib/server/data"
import { runSync, runSyncAll, publicSyncErrorMessage, type LinkSyncOutcome } from "@/lib/tricount/sync"
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit"

// Each sync fans out to Tricount's undocumented backend. 10 requests per user
// per minute is generous for normal use (the on-load auto-sync is separately
// throttled to once per 10 min per link) but stops a stuck client or rapid
// re-clicking from hammering the upstream and risking an IP block.
const rateLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 })

// POST /api/tricount/sync — reconcile the household's tricounts.
// Body { linkId } syncs one; otherwise syncs all. { auto: true } marks the
// on-load background sync, which throttles links synced in the last 10 min;
// manual syncs omit it and always force a fresh pull. Runs in the caller's
// session so RLS scopes every write to their household.
export async function POST(request: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const limited = rateLimitResponse(rateLimiter, user.id)
  if (limited) return limited

  let linkId: string | undefined
  let auto = false
  try {
    const body = await request.json()
    if (body && typeof body.linkId === "string") linkId = body.linkId
    if (body && body.auto === true) auto = true
  } catch {
    // No body — manual sync all.
  }

  const supabase = await createServerSupabaseClient()

  try {
    let results: LinkSyncOutcome[]
    if (linkId) {
      const { data: link } = await supabase
        .from("tricount_links")
        .select("*")
        .eq("id", linkId)
        .maybeSingle()
      if (!link) return NextResponse.json({ error: "Tricount link not found" }, { status: 404 })
      const result = await runSync(supabase, {
        userId: user.id,
        householdId: user.householdId,
        baseCurrency: user.baseCurrency,
        link,
      })
      results = [{ linkId: link.id, title: result.title, result }]
    } else {
      results = await runSyncAll(supabase, { userId: user.id, householdId: user.householdId, auto })
    }
    return NextResponse.json({ configured: results.length > 0, results })
  } catch (error) {
    // Raw detail (Postgres text, upstream HTTP bodies) stays server-side; the
    // client gets a laundered message (the shape-drift "registry empty" abort
    // keeps its distinct text).
    console.error("Tricount sync failed:", error)
    return NextResponse.json({ error: publicSyncErrorMessage(error) }, { status: 502 })
  }
}
