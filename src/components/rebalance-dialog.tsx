"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"
import { createClient } from "@/lib/supabase"
import { formatCurrency } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import type { BudgetSummary } from "@/lib/types"
import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CentsInput } from "@/components/ui/cents-input"

const NEW_MONEY_SENTINEL = "__new_money__"

interface RebalanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  budgets: BudgetSummary[]
  householdId: string
  budgetMonth: string
  initialDestId?: string | null
}

type Step = "source" | "amount" | "confirm"

export function RebalanceDialog({
  open,
  onOpenChange,
  onSuccess,
  budgets,
  householdId,
  budgetMonth,
  initialDestId,
}: RebalanceDialogProps) {
  const [step, setStep] = useState<Step>("source")
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [destId, setDestId] = useState<string | null>(null)
  const [amountCents, setAmountCents] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const isNewMoney = sourceId === NEW_MONEY_SENTINEL
  const sourceBudget = isNewMoney ? null : budgets.find((b) => b.category_id === sourceId)
  const destBudget = budgets.find((b) => b.category_id === destId)
  const transferAmount = amountCents / 100

  // When opened with a pre-selected destination, initialize state
  const effectiveDestId = initialDestId ?? null
  const destBudgetForTitle = budgets.find((b) => b.category_id === effectiveDestId)

  // Categories with remaining > 0 as potential sources (excluding dest if pre-selected)
  const sourceCandidates = budgets
    .filter((b) => Number(b.remaining_amount) > 0 && b.category_id !== effectiveDestId)
    .sort((a, b) => Number(b.remaining_amount) - Number(a.remaining_amount))

  function reset() {
    setStep("source")
    setSourceId(null)
    setDestId(null)
    setAmountCents(0)
    setError("")
    setSaving(false)
  }

  function handleOpenChange(value: boolean) {
    if (!value) reset()
    onOpenChange(value)
  }

  function selectSource(categoryId: string) {
    setSourceId(categoryId)
    if (effectiveDestId) {
      setDestId(effectiveDestId)
    }
    setStep("amount")
  }

  function confirmAmount() {
    if (amountCents <= 0) {
      setError("Amount must be greater than 0")
      return
    }
    if (!isNewMoney && sourceBudget) {
      const maxAmount = Number(sourceBudget.remaining_amount)
      if (transferAmount > maxAmount) {
        setError(`Maximum available: ${formatCurrency(maxAmount)}`)
        return
      }
    }
    setError("")
    if (effectiveDestId) {
      setDestId(effectiveDestId)
    }
    setStep("confirm")
  }

  async function handleConfirm() {
    if (!destId) return
    setSaving(true)
    setError("")

    const supabase = createClient()

    if (isNewMoney) {
      const { error: rpcError } = await supabase.rpc("top_up_budget", {
        p_household_id: householdId,
        p_budget_month: budgetMonth,
        p_category_id: destId,
        p_amount: transferAmount,
      })

      if (rpcError) {
        setError(getErrorMessage(rpcError))
        setSaving(false)
        return
      }
    } else {
      if (!sourceId || !sourceBudget || !destBudget) return

      const { error: rpcError } = await supabase.rpc("rebalance_budget", {
        p_household_id: householdId,
        p_budget_month: budgetMonth,
        p_source_category_id: sourceId,
        p_dest_category_id: destId,
        p_amount: transferAmount,
      })

      if (rpcError) {
        setError(getErrorMessage(rpcError))
        setSaving(false)
        return
      }
    }

    handleOpenChange(false)
    onSuccess?.()
  }

  const destRemaining = destBudgetForTitle ? Number(destBudgetForTitle.remaining_amount) : 0
  const destBannerNeutral = destBudgetForTitle && destRemaining >= 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {effectiveDestId
              ? `Add funds to ${destBudgetForTitle?.category_name ?? "category"}`
              : `Rebalance - ${format(parseISO(budgetMonth), "MMMM yyyy")}`}
          </DialogTitle>
          <DialogDescription>
            {step === "source" && (effectiveDestId
              ? "Pick a source to transfer from, or add new money."
              : "Select a category to take money from, or add new money.")}
            {step === "amount" && (isNewMoney
              ? "How much new money to add?"
              : `How much to move from ${sourceBudget?.category_name}?`)}
            {step === "confirm" && "Review the transfer."}
          </DialogDescription>
        </DialogHeader>

        {effectiveDestId && destBudgetForTitle && (
          <div className={`flex items-center justify-between rounded-md px-3 py-2 text-sm border ${destBannerNeutral ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"}`}>
            <span className={`flex items-center gap-1.5 ${destBannerNeutral ? "text-blue-700" : "text-red-700"}`}>
              {destBudgetForTitle.category_icon && <span>{destBudgetForTitle.category_icon}</span>}
              <span className="font-medium">{destBudgetForTitle.category_name}</span>
            </span>
            <span className={`font-semibold ${destBannerNeutral ? "text-blue-700" : "text-red-700"}`}>
              {formatCurrency(destRemaining)}
            </span>
          </div>
        )}

        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        )}

        {/* Step 1: Pick source */}
        {step === "source" && (
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {/* New money option */}
            <button
              onClick={() => selectSource(NEW_MONEY_SENTINEL)}
              className="w-full flex items-center justify-between p-3 rounded-md hover:bg-accent text-left border border-dashed border-muted-foreground/30"
            >
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm font-medium">New money</span>
                  <span className="block text-xs text-muted-foreground">Increases total budget</span>
                </div>
              </div>
            </button>

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

        {/* Step 2: Enter amount (+ pick destination if no initialDestId) */}
        {step === "amount" && (isNewMoney || sourceBudget) && (
          <div className="space-y-4">
            {!isNewMoney && sourceBudget && (
              <div className="text-sm text-muted-foreground">
                Available from {sourceBudget.category_name}: {formatCurrency(Number(sourceBudget.remaining_amount))}
              </div>
            )}
            <CentsInput
              value={amountCents}
              onChange={(cents) => { setAmountCents(cents); setError("") }}
              autoFocus
            />
            {!effectiveDestId && (
              <>
                <p className="text-sm font-medium">Move to:</p>
                <div className="space-y-1 max-h-[30vh] overflow-y-auto">
                  {budgets
                    .filter((b) => b.category_id !== sourceId)
                    .map((b) => (
                      <button
                        key={b.category_id}
                        onClick={() => setDestId(b.category_id!)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-md text-left transition-colors ${destId === b.category_id ? "bg-accent ring-1 ring-ring" : "hover:bg-accent/50"}`}
                      >
                        <div className="flex items-center gap-2">
                          {b.category_icon && <span className="text-base">{b.category_icon}</span>}
                          <span className="text-sm font-medium">{b.category_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatCurrency(Number(b.remaining_amount), 0)} left
                        </span>
                      </button>
                    ))}
                </div>
              </>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setStep("source"); setSourceId(null); setDestId(null); setAmountCents(0); setError("") }}>
                Back
              </Button>
              <Button onClick={() => {
                if (!effectiveDestId && !destId) { setError("Select a destination category"); return }
                confirmAmount()
              }} disabled={!effectiveDestId && !destId}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && (isNewMoney || sourceBudget) && (destBudget || destBudgetForTitle) && (
          <div className="space-y-4">
            <div className="rounded-md border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">From</span>
                <span className="font-medium">{isNewMoney ? "New money" : sourceBudget!.category_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">To</span>
                <span className="font-medium">{(destBudget ?? destBudgetForTitle)!.category_name}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{formatCurrency(transferAmount)}</span>
              </div>
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
              <Button variant="outline" onClick={() => { setStep("amount"); setError("") }}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? (isNewMoney ? "Adding..." : "Transferring...") : (isNewMoney ? "Confirm Top-up" : "Confirm Transfer")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
