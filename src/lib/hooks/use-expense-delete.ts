"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase"
import { getErrorMessage } from "@/lib/error-handler"

export interface DeletableExpense {
  id: string
  split_group_id: string | null
}

export function useExpenseDelete(onDeleted?: (expenseIds: string[]) => void) {
  const [showingDeleteId, setShowingDeleteId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState("")

  // Latest-callback ref so handleDelete stays referentially stable for
  // memoized children even when the parent passes a fresh onDeleted closure.
  const onDeletedRef = useRef(onDeleted)
  useEffect(() => { onDeletedRef.current = onDeleted }, [onDeleted])

  const handleCardClick = useCallback((expenseId: string) => {
    setShowingDeleteId((prev) => (prev === expenseId ? null : expenseId))
  }, [])

  const clearDeletingId = useCallback((expenseId: string) => {
    setDeletingIds((prev) => {
      const next = new Set(prev)
      next.delete(expenseId)
      return next
    })
  }, [])

  const handleDelete = useCallback(async (expense: DeletableExpense, e: React.MouseEvent) => {
    e.stopPropagation()
    setShowingDeleteId(null)
    setDeleteError("")

    const supabase = createClient()

    if (expense.split_group_id) {
      // Fetch sibling ids first so we know exactly which rows are about to be
      // wiped — needed for the optimistic UI and the parent's state filter.
      const { data: siblings, error: fetchError } = await supabase
        .from("expenses")
        .select("id")
        .eq("split_group_id", expense.split_group_id)
      if (fetchError) {
        setDeleteError(getErrorMessage(fetchError))
        return
      }
      const ids = (siblings ?? []).map((s) => s.id)
      if (ids.length === 0) {
        // Edge case: row vanished mid-flight. Nothing to do.
        return
      }
      setDeletingIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.add(id))
        return next
      })
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("split_group_id", expense.split_group_id)
      if (error) {
        setDeleteError(getErrorMessage(error))
        setDeletingIds((prev) => {
          const next = new Set(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
        return
      }
      onDeletedRef.current?.(ids)
      setTimeout(() => ids.forEach((id) => clearDeletingId(id)), 5000)
      return
    }

    setDeletingIds((prev) => new Set(prev).add(expense.id))
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id)

    if (error) {
      setDeleteError(getErrorMessage(error))
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(expense.id)
        return next
      })
    } else {
      // Optimistic update — postgres_changes realtime is unreliable on this
      // project, so the parent removes from state via this callback. The 5s
      // fallback below clears the animation flag in case the parent doesn't.
      onDeletedRef.current?.([expense.id])
      setTimeout(() => clearDeletingId(expense.id), 5000)
    }
  }, [clearDeletingId])

  return {
    showingDeleteId,
    deletingIds,
    deleteError,
    setDeleteError,
    handleCardClick,
    handleDelete,
    clearDeletingId,
  }
}
