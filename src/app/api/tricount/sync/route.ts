import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { getServerUser } from "@/lib/server/data"
import { runSync } from "@/lib/tricount/sync"

// POST /api/tricount/sync — pull the linked tricount and reconcile expenses.
// Runs in the caller's session so RLS scopes every write to their household.
export async function POST() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const supabase = await createServerSupabaseClient()
  const { data: link } = await supabase.from("tricount_links").select("*").maybeSingle()
  if (!link) {
    return NextResponse.json({ configured: false })
  }

  try {
    const result = await runSync(supabase, {
      userId: user.id,
      householdId: user.householdId,
      link,
    })
    return NextResponse.json({ configured: true, result })
  } catch (error) {
    console.error("Tricount sync failed:", error)
    const message = error instanceof Error ? error.message : "Sync failed"
    return NextResponse.json({ configured: true, error: message }, { status: 502 })
  }
}
