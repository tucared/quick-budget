import { Suspense } from "react"
import { redirect } from "next/navigation"
import {
  getServerUser,
  getExpensesAndCategories,
  computeTopCategoryIds,
} from "@/lib/server/data"
import { ExpensesPageClient } from "@/components/expenses-page-client"
import { Skeleton } from "@/components/ui/skeleton"

export default function ExpensesPage() {
  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      <Suspense fallback={<ExpensesPageSkeleton />}>
        <ExpensesPageData />
      </Suspense>
    </main>
  )
}

async function ExpensesPageData() {
  const [user, { expenses, categories }] = await Promise.all([
    getServerUser(),
    getExpensesAndCategories({ mode: "recent", limit: 30 }),
  ])

  if (!user) {
    redirect("/login")
  }

  const topCategoryIds = computeTopCategoryIds(expenses, categories)

  return (
    <ExpensesPageClient
      initialExpenses={expenses}
      initialCategories={categories}
      initialTopCategoryIds={topCategoryIds}
    />
  )
}

function ExpensesPageSkeleton() {
  return (
    <>
      <div className="mb-6 space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </>
  )
}
