import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { getServerUser } from "@/lib/server/data"
import { parseTricountToken } from "@/lib/tricount/client"

// Manage the household's single Tricount link.
// GET    — current link (or null)
// POST   — connect/replace a link from a share URL or bare code
// DELETE — disconnect (mirrored expenses are left in place as normal rows)

const TRICOUNT_CATEGORY_NAME = "Tricount"

export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from("tricount_links").select("*").maybeSingle()
  return NextResponse.json({ link: data ?? null })
}

export async function POST(request: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const token = parseTricountToken(String(body?.url ?? ""))
  if (!token) {
    return NextResponse.json(
      { error: "Could not find a Tricount share code in that link." },
      { status: 400 }
    )
  }

  const supabase = await createServerSupabaseClient()

  // Ensure the dedicated "Tricount" category exists for this household.
  const { data: existingCat } = await supabase
    .from("categories")
    .select("id")
    .eq("household_id", user.householdId)
    .ilike("name", TRICOUNT_CATEGORY_NAME)
    .maybeSingle()

  let categoryId = existingCat?.id ?? null
  if (!categoryId) {
    const { data: newCat, error: catErr } = await supabase
      .from("categories")
      .insert({
        household_id: user.householdId,
        name: TRICOUNT_CATEGORY_NAME,
        icon: "🧾",
        is_active: true,
        exclude_from_budget_total: false,
      })
      .select("id")
      .single()
    if (catErr) {
      return NextResponse.json({ error: "Failed to create Tricount category" }, { status: 500 })
    }
    categoryId = newCat.id
  }

  const { data: link, error } = await supabase
    .from("tricount_links")
    .upsert(
      {
        household_id: user.householdId,
        public_identifier_token: token,
        default_category_id: categoryId,
      },
      { onConflict: "household_id" }
    )
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: "Failed to save Tricount link" }, { status: 500 })
  }

  return NextResponse.json({ link })
}

export async function DELETE() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from("tricount_links")
    .delete()
    .eq("household_id", user.householdId)

  if (error) {
    return NextResponse.json({ error: "Failed to disconnect Tricount" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
