"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { format, addMonths, subMonths, startOfMonth } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MonthNavigatorProps {
  budgetMonth: string // yyyy-MM-dd format (first of month)
}

export function MonthNavigator({ budgetMonth }: MonthNavigatorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Parse year/month directly from the string so the Date is in local time,
  // not UTC midnight (which shifts the month for users in UTC-N timezones).
  const [navYear, navMon] = budgetMonth.split("-").map(Number)
  const current = new Date(navYear, navMon - 1, 1)
  const now = startOfMonth(new Date())
  const isCurrentMonth = navYear === now.getFullYear() && navMon - 1 === now.getMonth()

  function navigate(date: Date) {
    const params = new URLSearchParams(searchParams.toString())
    const monthStr = format(date, "yyyy-MM")
    // If navigating to current month, remove param for cleaner URL
    if (format(date, "yyyy-MM") === format(now, "yyyy-MM")) {
      params.delete("month")
    } else {
      params.set("month", monthStr)
    }
    const query = params.toString()
    router.push(`/budget${query ? `?${query}` : ""}`)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate(subMonths(current, 1))}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <span className="text-lg font-semibold min-w-[160px] text-center">
        {format(current, "MMMM yyyy")}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate(addMonths(current, 1))}
        disabled={isCurrentMonth}
        aria-label="Next month"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  )
}
