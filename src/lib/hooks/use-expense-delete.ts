"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase"
import { getErrorMessage } from "@/lib/error-handler"

export function useExpenseDelete(onDeleted?: (expenseId: string) => void) {
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

  const handleDelete = useCallback(async (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingIds((prev) => new Set(prev).add(expenseId))
    setShowingDeleteId(null)
    setDeleteError("")

    const supabase = createClient()
    const { error } = await supabase.from("expenses").delete().eq("id", expenseId)

    if (error) {
      setDeleteError(getErrorMessage(error))
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(expenseId)
        return next
      })
    } else {
      // Optimistic update — postgres_changes realtime is unreliable on this
      // project, so the parent removes from state via this callback. The 5s
      // fallback below clears the animation flag in case the parent doesn't.
      onDeletedRef.current?.(expenseId)
      setTimeout(() => clearDeletingId(expenseId), 5000)
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
