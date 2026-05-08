"use client"

import { forwardRef, useImperativeHandle, useRef } from "react"
import { formatCentsDisplay } from "@/components/ui/cents-input"
import { SUPPORTED_CURRENCIES } from "@/lib/currency"

const MAX_CENTS = 999_999_999 // ~10M cap

export interface AmountInputHandle {
  focus: () => void
  select: () => void
}

interface AmountInputWithCurrencyProps {
  centsRaw: number
  onCentsChange: (cents: number) => void
  currency: string
  onCurrencyChange: (currency: string) => void
  error?: boolean
  autoFocus?: boolean
  // Override Enter behavior. Default: prevent submit, do nothing.
  // ExpenseForm uses this to move focus to the description field.
  onEnter?: () => void
}

export const AmountInputWithCurrency = forwardRef<
  AmountInputHandle,
  AmountInputWithCurrencyProps
>(function AmountInputWithCurrency(
  { centsRaw, onCentsChange, currency, onCurrencyChange, error, autoFocus, onEnter },
  ref
) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    select: () => inputRef.current?.select(),
  }))

  // Use onChange for digit/backspace handling instead of onKeyDown,
  // because Firefox Android fires onKeyDown with e.key === "Unidentified"
  // for the virtual keyboard's backspace key.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault()
      onEnter()
      return
    }
    const allowedKeys = [
      "Backspace",
      "Delete",
      "Tab",
      "Escape",
      "Enter",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
    ]
    if (allowedKeys.includes(e.key)) return
    if (e.key >= "0" && e.key <= "9") return
    if (e.ctrlKey || e.metaKey) return
    if (e.key === "Unidentified") return
    e.preventDefault()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "")
    const next = parseInt(raw, 10) || 0
    if (next <= MAX_CENTS) onCentsChange(next)
  }

  return (
    <div
      className={`flex items-center h-16 rounded-md border bg-background px-3 gap-2 cursor-text focus-within:ring-2 focus-within:ring-ring ${
        error ? "border-destructive" : "border-input"
      }`}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        autoComplete="off"
        value={centsRaw > 0 ? String(centsRaw) : ""}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="sr-only"
        aria-label="Amount"
      />
      <span
        className={`flex-1 text-3xl font-semibold text-center tabular-nums ${
          centsRaw === 0 ? "text-muted-foreground" : ""
        }`}
      >
        {formatCentsDisplay(centsRaw)}
      </span>
      <div className="inline-flex rounded-md shrink-0" role="group">
        {SUPPORTED_CURRENCIES.map((c, i) => {
          const isFirst = i === 0
          const isLast = i === SUPPORTED_CURRENCIES.length - 1
          const radius = isFirst ? "rounded-l-md" : isLast ? "rounded-r-md" : ""
          const borderLeft = isFirst ? "" : "border-l-0"
          const isSelected = currency === c
          return (
            <button
              key={c}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCurrencyChange(c)
                inputRef.current?.focus()
              }}
              className={`px-2.5 py-1 text-xs font-semibold border ${borderLeft} ${radius} transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:bg-accent"
              }`}
            >
              {c}
            </button>
          )
        })}
      </div>
    </div>
  )
})
