"use client"

import * as React from "react"
import { format, subDays } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = "Pick a date",
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const handleQuickPick = (daysAgo: number) => {
    const selectedDate = subDays(new Date(), daysAgo)
    onDateChange?.(selectedDate)
    setOpen(false)
  }

  const handleCalendarSelect = (selectedDate: Date | undefined) => {
    onDateChange?.(selectedDate)
    if (selectedDate) {
      setOpen(false)
    }
  }

  // Smart display: show "Today", "Yesterday", or formatted date
  const getDisplayText = (date: Date | undefined): string => {
    if (!date) return placeholder

    const today = new Date()
    const yesterday = subDays(today, 1)

    // Normalize dates to compare only day/month/year (ignore time)
    const normalizeDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const normalizedDate = normalizeDate(date)
    const normalizedToday = normalizeDate(today)
    const normalizedYesterday = normalizeDate(yesterday)

    if (normalizedDate.getTime() === normalizedToday.getTime()) {
      return "Today"
    } else if (normalizedDate.getTime() === normalizedYesterday.getTime()) {
      return "Yesterday"
    } else {
      return format(date, "PPP")
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span>{getDisplayText(date)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        {/* Quick picks section */}
        <div className="p-3 space-y-1 border-b">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal"
            onClick={() => handleQuickPick(0)}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal"
            onClick={() => handleQuickPick(1)}
          >
            Yesterday
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal"
            onClick={() => handleQuickPick(2)}
          >
            2 days ago
          </Button>
        </div>

        {/* Calendar section */}
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleCalendarSelect}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  )
}
