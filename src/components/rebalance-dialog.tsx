"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { createClient } from "@/lib/supabase"
import { formatCurrency } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import type { BudgetSummary } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface RebalanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budgets: BudgetSummary[]
  householdId: string
  budgetMonth: string
}

type Step = "source" | "amount" | "destination" | "confirm"

export function RebalanceDialog({
  open,
  onOpenChange,
  budgets,
  householdId,
  budgetMonth,
}: RebalanceDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("source")
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [destId, setDestId] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const sourceBudget = budgets.find((b) => b.category_id === sourceId)
  const destBudget = budgets.find((b) => b.category_id === destId)
  const transferAmount = Number(amount) || 0

  // Categories with remaining > 0 as potential sources
  const sourceCandidates = budgets
    .filter((b) => Number(b.remaining_amount) > 0)
    .sort((a, b) => Number(b.remaining_amount) - Number(a.remaining_amount))

  function reset() {
    setStep("source")
    setSourceId(null)
    setDestId(null)
    setAmount("")
    setError("")
    setSaving(false)
  }

  function handleOpenChange(value: boolean) {
    if (!value) reset()
    onOpenChange(value)
  }

  function selectSource(categoryId: string) {
    setSourceId(categoryId)
    setStep("amount")
  }

  function confirmAmount() {
    if (!sourceBudget) return
    const maxAmount = Number(sourceBudget.remaining_amount)
    if (transferAmount <= 0) {
      setError("Amount must be greater than 0")
      return
    }
    if (transferAmount > maxAmount) {
      setError(`Maximum available: ${formatCurrency(maxAmount)}`)
      return
    }
    setError("")
    setStep("destination")
  }

  function selectDestination(categoryId: string) {
    setDestId(categoryId)
    setStep("confirm")
  }

  async function handleConfirm() {
    if (!sourceId || !destId || !sourceBudget || !destBudget) return
    setSaving(true)
    setError("")

    const supabase = createClient()
    const sourceNewAmount = Number(sourceBudget.allocated_amount) - transferAmount
    const destNewAmount = Number(destBudget.allocated_amount) + transferAmount

    // Update source allocation
    const { error: sourceError } = await supabase
      .from("budget_allocations")
      .update({ allocated_amount: sourceNewAmount })
      .eq("household_id", householdId)
      .eq("category_id", sourceId)
      .eq("budget_month", budgetMonth)

    if (sourceError) {
      setError(getErrorMessage(sourceError))
      setSaving(false)
      return
    }

    // Update destination allocation (upsert in case it doesn't exist yet)
    const { error: destError } = await supabase
      .from("budget_allocations")
      .upsert(
        {
          household_id: householdId,
          category_id: destId,
          budget_month: budgetMonth,
          allocated_amount: destNewAmount,
          currency: "EUR",
        },
        { onConflict: "household_id,category_id,budget_month" }
      )

    if (destError) {
      setError(getErrorMessage(destError))
      setSaving(false)
      return
    }

    handleOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Rebalance - {format(parseISO(budgetMonth), "MMMM yyyy")}
          </DialogTitle>
          <DialogDescription>
            {step === "source" && "Select a category to take money from."}
            {step === "amount" && `How much to move from ${sourceBudget?.category_name}?`}
            {step === "destination" && "Select the category to receive funds."}
            {step === "confirm" && "Review the transfer."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        )}

        {/* Step 1: Pick source */}
        {step === "source" && (
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {sourceCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No categories with remaining budget to transfer from.
              </p>
            ) : (
              sourceCandidates.map((b) => (
                <button
                  key={b.category_id}
                  onClick={() => selectSource(b.category_id!)}
                  className="w-full flex items-center justify-between p-3 rounded-md hover:bg-accent text-left"
                >
                  <div className="flex items-center gap-2">
                    {b.category_icon && <span className="text-lg">{b.category_icon}</span>}
                    <span className="text-sm font-medium">{b.category_name}</span>
                  </div>
                  <span className="text-sm text-green-600 font-medium">
                    {formatCurrency(Number(b.remaining_amount), 0)} left
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 2: Enter amount */}
        {step === "amount" && sourceBudget && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Available: {formatCurrency(Number(sourceBudget.remaining_amount))}
            </div>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Amount to move"
              value={amount}
              onChange={(e) => {
                if (e.target.value === "" || /^\d*\.?\d{0,2}$/.test(e.target.value)) {
                  setAmount(e.target.value)
                  setError("")
                }
              }}
              autoFocus
              className="text-right"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setStep("source"); setSourceId(null); setAmount(""); setError("") }}>
                Back
              </Button>
              <Button onClick={confirmAmount}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Pick destination */}
        {step === "destination" && (
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {budgets
              .filter((b) => b.category_id !== sourceId)
              .map((b) => (
                <button
                  key={b.category_id}
                  onClick={() => selectDestination(b.category_id!)}
                  className="w-full flex items-center justify-between p-3 rounded-md hover:bg-accent text-left"
                >
                  <div className="flex items-center gap-2">
                    {b.category_icon && <span className="text-lg">{b.category_icon}</span>}
                    <span className="text-sm font-medium">{b.category_name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatCurrency(Number(b.remaining_amount), 0)} left
                  </span>
                </button>
              ))}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => { setStep("amount"); setDestId(null); setError("") }}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === "confirm" && sourceBudget && destBudget && (
          <div className="space-y-4">
            <div className="rounded-md border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">From</span>
                <span className="font-medium">{sourceBudget.category_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">To</span>
                <span className="font-medium">{destBudget.category_name}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{formatCurrency(transferAmount)}</span>
              </div>
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
              <Button variant="outline" onClick={() => { setStep("destination"); setDestId(null); setError("") }}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? "Transferring..." : "Confirm Transfer"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
