import { useState } from "react"
import { MAX_SIGNUP_CATEGORIES, type SignupCategory } from "@/lib/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// Starter suggestions — the set handle_new_user() also falls back to when a
// signup arrives without categories (keep in sync with the trigger and
// supabase/seeds/02_seed_categories.sql).
const DEFAULT_CATEGORY_SUGGESTIONS: SignupCategory[] = [
  { name: "Groceries", icon: "🛒" },
  { name: "Dining Out", icon: "🍽️" },
  { name: "Transportation", icon: "🚌" },
  { name: "Entertainment", icon: "🎭" },
  { name: "Shopping", icon: "🛍️" },
  { name: "Bills", icon: "📋" },
]

const chipClassName = (selected: boolean) =>
  cn(
    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    selected
      ? "border-primary bg-primary/10 text-foreground"
      : "border-input text-muted-foreground hover:bg-muted"
  )

interface CategoryFieldsProps {
  categories: SignupCategory[]
  onAdd: (category: SignupCategory) => void
  onRemove: (index: number) => void
}

// The founder's spending categories, as one coherent chip list: the six
// starter suggestions plus anything custom the user added, all rendered the
// same way (selected = counted, tap to toggle off). Custom entries are created
// through an explicit draft row (name + icon + Add) and only join `categories`
// on Add — nothing is inferred from what's being typed, so a half-typed name
// can never be absorbed into a suggestion or duplicate one invisibly. Hidden
// by the parent (like the household fields) when the email turns out to be an
// invite, since the joiner inherits the founder's categories.
export default function CategoryFields({
  categories,
  onAdd,
  onRemove,
}: CategoryFieldsProps) {
  const [draftName, setDraftName] = useState("")
  const [draftIcon, setDraftIcon] = useState("🏷️")
  const [draftOpen, setDraftOpen] = useState(false)

  const chosenIndexByName = new Map(
    categories.map((c, index) => [c.name.trim().toLowerCase(), index])
  )
  const suggestionNames = new Set(
    DEFAULT_CATEGORY_SUGGESTIONS.map((s) => s.name.toLowerCase())
  )
  // Chosen categories that aren't one of the suggestions render as extra chips
  // after them, in the same style, always selected (tap to remove).
  const customChips = categories
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => !suggestionNames.has(c.name.trim().toLowerCase()))

  const atLimit = categories.length >= MAX_SIGNUP_CATEGORIES

  const toggleSuggestion = (s: SignupCategory) => {
    const existing = chosenIndexByName.get(s.name.toLowerCase())
    if (existing !== undefined) {
      onRemove(existing)
    } else if (!atLimit) {
      onAdd(s)
    }
  }

  const trimmedDraft = draftName.trim()
  const draftDuplicate = chosenIndexByName.has(trimmedDraft.toLowerCase())
  const canAddDraft = trimmedDraft !== "" && !draftDuplicate && !atLimit

  const addDraft = () => {
    if (!canAddDraft) return
    // A draft that names a suggestion becomes that suggestion (canonical icon),
    // so the chip that lights up matches what gets submitted.
    const suggestion = DEFAULT_CATEGORY_SUGGESTIONS.find(
      (s) => s.name.toLowerCase() === trimmedDraft.toLowerCase()
    )
    onAdd(suggestion ?? { name: trimmedDraft, icon: draftIcon.trim() || "🏷️" })
    setDraftName("")
    setDraftIcon("🏷️")
  }

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Budget categories</p>
        <p className="text-xs text-muted-foreground">
          The buckets your budget splits across. Tap the starters you want, then
          add your own.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {DEFAULT_CATEGORY_SUGGESTIONS.map((s) => {
          const selected = chosenIndexByName.has(s.name.toLowerCase())
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => toggleSuggestion(s)}
              disabled={!selected && atLimit}
              aria-pressed={selected}
              className={chipClassName(selected)}
            >
              <span aria-hidden className="font-medium">
                {selected ? "✓" : "+"}
              </span>
              {s.icon} {s.name}
            </button>
          )
        })}
        {customChips.map(({ c, index }) => (
          <button
            key={`${c.name}-${index}`}
            type="button"
            onClick={() => onRemove(index)}
            aria-pressed
            aria-label={`Remove category ${c.name}`}
            className={chipClassName(true)}
          >
            <span aria-hidden className="font-medium">
              ✓
            </span>
            {c.icon} {c.name}
          </button>
        ))}
        {!draftOpen && !atLimit && (
          <button
            type="button"
            onClick={() => setDraftOpen(true)}
            className={chipClassName(false)}
          >
            <span aria-hidden className="font-medium">
              +
            </span>
            Add your own
          </button>
        )}
      </div>

      {categories.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Pick at least one to get started.
        </p>
      )}

      {draftOpen && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input
              value={draftIcon}
              onChange={(e) => setDraftIcon(e.target.value)}
              className="w-14 text-center"
              maxLength={16}
              aria-label="New category icon"
            />
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                // Enter adds the draft instead of submitting the whole signup.
                if (e.key === "Enter") {
                  e.preventDefault()
                  addDraft()
                }
              }}
              placeholder="Category name"
              autoComplete="off"
              maxLength={40}
              aria-label="New category name"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addDraft}
              disabled={!canAddDraft}
            >
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setDraftOpen(false)
                setDraftName("")
                setDraftIcon("🏷️")
              }}
              aria-label="Close new category row"
            >
              ×
            </Button>
          </div>
          {draftDuplicate && (
            <p className="text-xs text-muted-foreground">
              Already in your list — tap its chip above to remove it.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
