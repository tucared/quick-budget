import { Suspense } from "react"
import { redirect } from "next/navigation"
import { format, startOfMonth } from "date-fns"
import {
  getServerUser,
  getBudgetAndAllowanceSummary,
  getMonthlyBudgetTarget,
  getExpensesAndCategories,
} from "@/lib/server/data"
import { BudgetPageContent } from "@/components/budget-page-content"
import { Skeleton } from "@/components/ui/skeleton"

interface BudgetPageProps {
  searchParams: Promise<{ month?: string }>
}

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
  const { month } = await searchParams

  let budgetMonth: string
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    budgetMonth = `${month}-01`
  } else {
    budgetMonth = format(startOfMonth(new Date()), "yyyy-MM-dd")
  }

  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl">
      <Suspense fallback={<BudgetPageSkeleton />}>
        <BudgetPageData budgetMonth={budgetMonth} />
      </Suspense>
    </main>
  )
}

async function BudgetPageData({ budgetMonth }: { budgetMonth: string }) {
  const [user, { budgets, allowances }, target, { expenses, categories }] = await Promise.all([
    getServerUser(),
    getBudgetAndAllowanceSummary(budgetMonth),
    getMonthlyBudgetTarget(budgetMonth),
    getExpensesAndCategories({ mode: "monthly", month: budgetMonth }),
  ])

  if (!user) {
    redirect("/login")
  }

  return (
    <BudgetPageContent
      initialBudgets={budgets}
      initialAllowances={allowances}
      initialTarget={target}
      initialExpenses={expenses}
      categories={categories}
      householdId={user.householdId}
      budgetMonth={budgetMonth}
    />
  )
}

function BudgetPageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  )
}
