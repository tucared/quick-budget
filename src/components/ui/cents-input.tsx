"use client"

import { useRef } from "react"
import { cn } from "@/lib/utils"

/** Format an integer number of cents as "1 234,56" */
export function formatCentsDisplay(cents: number): string {
  if (cents === 0) return "0,00"
  const intPart = Math.floor(cents / 100)
  const decPart = cents % 100
  const intFormatted = intPart.toLocaleString("fr-FR")
  return `${intFormatted},${String(decPart).padStart(2, "0")}`
}

interface CentsInputProps {
  /** Current value in cents (integer, e.g. 15000 = €150.00) */
  value: number
  onChange: (cents: number) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

/**
 * POS-style amount input: digits fill from the right, no comma/period needed.
 * Type "1500" → displays "15,00". Type "150000" → displays "1 500,00".
 */
export function CentsInput({
  value,
  onChange,
  placeholder = "0,00",
  className,
  autoFocus,
}: CentsInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault()
      const next = value * 10 + parseInt(e.key)
      if (next <= 999999999) {
        onChange(next)
      }
    } else if (e.key === "Backspace") {
      e.preventDefault()
      onChange(Math.floor(value / 10))
    }
  }

  return (
    <div
      className={cn(
        "relative flex items-center border rounded-md bg-background cursor-text focus-within:ring-1 focus-within:ring-ring",
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Invisible input captures keyboard events */}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value=""
        onChange={() => {}}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        className="absolute inset-0 opacity-0 w-full cursor-text"
        aria-label="Amount input"
      />
      <span
        className={cn(
          "w-full text-right px-3 py-1.5 text-sm select-none",
          value === 0 ? "text-muted-foreground" : ""
        )}
      >
        {value === 0 ? placeholder : formatCentsDisplay(value)}
      </span>
    </div>
  )
}
