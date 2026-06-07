import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { getServerUser } from "@/lib/server/data"
import { runSync, runSyncAll, type SyncResult } from "@/lib/tricount/sync"

type LinkResult = { linkId: string; title: string; result?: SyncResult; error?: string }

// POST /api/tricount/sync — reconcile the household's tricounts.
// Body { linkId } syncs one; no body syncs all. Runs in the caller's session
// so RLS scopes every write to their household.
export async function POST(request: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  let linkId: string | undefined
  try {
    const body = await request.json()
    if (body && typeof body.linkId === "string") linkId = body.linkId
  } catch {
    // No body — sync all.
  }

  const supabase = await createServerSupabaseClient()

  try {
    let results: LinkResult[]
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
        link,
      })
      results = [{ linkId: link.id, title: result.title, result }]
    } else {
      results = await runSyncAll(supabase, { userId: user.id, householdId: user.householdId })
    }
    return NextResponse.json({ configured: results.length > 0, results })
  } catch (error) {
    console.error("Tricount sync failed:", error)
    const message = error instanceof Error ? error.message : "Sync failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
