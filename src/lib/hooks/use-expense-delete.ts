"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase"
import { getErrorMessage } from "@/lib/error-handler"

export function useExpenseDelete(onDeleted?: (expenseId: string) => void) {
  const [showingDeleteId, setShowingDeleteId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState("")

  const handleCardClick = (expenseId: string) => {
    setShowingDeleteId((prev) => (prev === expenseId ? null : expenseId))
  }

  const handleDelete = async (expenseId: string, e: React.MouseEvent) => {
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
      onDeleted?.(expenseId)
      setTimeout(() => clearDeletingId(expenseId), 5000)
    }
  }

  const clearDeletingId = (expenseId: string) => {
    setDeletingIds((prev) => {
      const next = new Set(prev)
      next.delete(expenseId)
      return next
    })
  }

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
