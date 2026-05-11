import { redirect } from "next/navigation"
import {
  getServerUser,
  getRecentExpenses,
  getCategories,
  computeTopCategoryIds,
} from "@/lib/server/data"
import { SUPPORTED_CURRENCIES } from "@/lib/currency"
import { ExpensesPageClient } from "@/components/expenses-page-client"

const MAX_AMOUNT = 9_999_999.99
const MAX_NOTE_LENGTH = 500

interface ExpensesPageProps {
  // Optional deep-link params used by bank-notification Shortcuts to pre-fill
  // the expense form. See PR description for the iOS Shortcut recipe.
  searchParams: Promise<{ amount?: string; currency?: string; note?: string }>
}

function parsePrefillAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const normalized = raw.replace(",", ".")
  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return undefined
  return value
}

function parsePrefillCurrency(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(raw) ? raw : undefined
}

function parsePrefillNote(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, MAX_NOTE_LENGTH)
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const { amount, currency, note } = await searchParams

  // Run the user fetch in parallel with the data queries. The data queries
  // rely on RLS (not an explicit household_id filter), so they don't need to
  // wait for getServerUser to resolve. This cuts one full round-trip off the
  // critical path compared to the naive "await user, then fetch data" pattern.
  const [user, expenses, categories] = await Promise.all([
    getServerUser(),
    getRecentExpenses(30),
    getCategories(),
  ])

  if (!user) {
    redirect("/login")
  }

  // Top category ordering is computed from the expenses we just fetched,
  // avoiding a separate RPC round-trip. See computeTopCategoryIds in data.ts.
  const topCategoryIds = computeTopCategoryIds(expenses, categories)

  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      <ExpensesPageClient
        initialExpenses={expenses}
        initialCategories={categories}
        initialTopCategoryIds={topCategoryIds}
        prefillAmount={parsePrefillAmount(amount)}
        prefillCurrency={parsePrefillCurrency(currency)}
        prefillDescription={parsePrefillNote(note)}
      />
    </main>
  )
}
