import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { getServerUser } from "@/lib/server/data"
import { parseTricountToken } from "@/lib/tricount/client"

// Manage the household's Tricount links (a household may connect several).
// GET    — list connected links
// POST   — connect a new link from a share URL or bare code
// PATCH  — update a link's manual member mapping / pause flag
// DELETE — unlink: remove the link AND every expense it imported (no
//          orphan-leaving "keep" variant; pause to freeze a finished tricount)

const TRICOUNT_CATEGORY_NAME = "Tricount"

export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from("tricount_links")
    .select("*")
    .order("created_at", { ascending: true })
  return NextResponse.json({ links: data ?? [] })
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

  // Ensure the shared "Tricount" category exists for this household.
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
    .insert({
      household_id: user.householdId,
      public_identifier_token: token,
      default_category_id: categoryId,
    })
    .select("*")
    .single()

  if (error) {
    // 23505 = unique_violation → this tricount is already connected.
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "That tricount is already connected." }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to save Tricount link" }, { status: 500 })
  }

  return NextResponse.json({ link })
}

export async function PATCH(request: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  let body: { id?: string; member_map?: Record<string, unknown>; is_active?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  const update: { member_map?: Record<string, string | null>; is_active?: boolean } = {}

  if (body.member_map !== undefined) {
    if (typeof body.member_map !== "object" || body.member_map === null) {
      return NextResponse.json({ error: "member_map must be an object" }, { status: 400 })
    }
    // Normalize: membership id (string) → user id (string) or null (exclude).
    const memberMap: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(body.member_map)) {
      memberMap[k] = typeof v === "string" && v ? v : null
    }
    update.member_map = memberMap
  }

  if (body.is_active !== undefined) {
    update.is_active = Boolean(body.is_active)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: link, error } = await supabase
    .from("tricount_links")
    .update(update)
    .eq("id", body.id)
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: "Failed to update link" }, { status: 500 })
  }
  return NextResponse.json({ link })
}

export async function DELETE(request: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const supabase = await createServerSupabaseClient()

  // Always remove the mirrored expenses this link produced (no "keep" variant
  // — that left orphans). Deleting the expenses cascades their map rows away.
  // Income rows carry a null expense_id (reconciled, never mirrored as spend);
  // exclude them at the query so only real expense ids come back.
  const { data: maps, error: mapErr } = await supabase
    .from("tricount_entry_map")
    .select("expense_id")
    .eq("link_id", id)
    .not("expense_id", "is", null)
  if (mapErr) {
    return NextResponse.json({ error: "Failed to read sync map" }, { status: 500 })
  }
  // Non-null by the query filter above.
  const expenseIds = (maps ?? []).map((m) => m.expense_id as string)
  if (expenseIds.length > 0) {
    const { error: delErr } = await supabase.from("expenses").delete().in("id", expenseIds)
    if (delErr) {
      return NextResponse.json({ error: "Failed to delete mirrored expenses" }, { status: 500 })
    }
  }

  const { error } = await supabase.from("tricount_links").delete().eq("id", id)
  if (error) {
    return NextResponse.json({ error: "Failed to unlink Tricount" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
