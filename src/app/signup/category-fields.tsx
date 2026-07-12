import { MAX_SIGNUP_CATEGORIES, type SignupCategory } from "@/lib/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import AllowanceField from "./allowance-field"

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

interface CategoryFieldsProps {
  categories: SignupCategory[]
  onAdd: (category: SignupCategory) => void
  onChange: (index: number, patch: Partial<SignupCategory>) => void
  onRemove: (index: number) => void
  allowanceName: string
  onAllowanceNameChange: (value: string) => void
}

// The founder's budget buckets — spending categories plus a personal
// allowance, grouped together so the allowance reads as another bucket.
// Suggestions are toggle chips (selected = counted) so it's obvious which
// starter categories are in; custom rows sit below. Hidden by the parent
// (like the household fields) when the email turns out to be an invite, since
// the joiner inherits the founder's categories.
export default function CategoryFields({
  categories,
  onAdd,
  onChange,
  onRemove,
  allowanceName,
  onAllowanceNameChange,
}: CategoryFieldsProps) {
  const chosenNames = new Set(categories.map((c) => c.name.trim().toLowerCase()))

  // A suggestion is "on" when a chosen category shares its name. Custom rows are
  // everything that isn't a bare suggestion, so a selected chip isn't also
  // echoed as an editable row below.
  const suggestionNames = new Set(
    DEFAULT_CATEGORY_SUGGESTIONS.map((s) => s.name.toLowerCase())
  )
  const customRows = categories
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => !suggestionNames.has(c.name.trim().toLowerCase()))

  const atLimit = categories.length >= MAX_SIGNUP_CATEGORIES

  const toggleSuggestion = (s: SignupCategory) => {
    const existing = categories.findIndex(
      (c) => c.name.trim().toLowerCase() === s.name.toLowerCase()
    )
    if (existing >= 0) {
      onRemove(existing)
    } else if (!atLimit) {
      onAdd(s)
    }
  }

  return (
    <div className="space-y-4 pt-2 border-t border-border">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Budget categories</p>
        <p className="text-xs text-muted-foreground">
          Every expense lands in a category — they&apos;re the buckets your
          monthly budget is split across. Tap the starters you want, then add
          your own.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {DEFAULT_CATEGORY_SUGGESTIONS.map((s) => {
          const selected = chosenNames.has(s.name.toLowerCase())
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => toggleSuggestion(s)}
              disabled={!selected && atLimit}
              aria-pressed={selected}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-input text-muted-foreground hover:bg-muted"
              )}
            >
              <span aria-hidden className="font-medium">
                {selected ? "✓" : "+"}
              </span>
              {s.icon} {s.name}
            </button>
          )
        })}
      </div>

      {categories.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Pick at least one to get started.
        </p>
      )}

      {customRows.length > 0 && (
        <div className="space-y-2">
          {customRows.map(({ c: category, index }) => (
            <div key={index} className="flex gap-2">
              <Input
                value={category.icon}
                onChange={(e) => onChange(index, { icon: e.target.value })}
                className="w-14 text-center"
                maxLength={16}
                aria-label={`Category ${index + 1} icon`}
              />
              <Input
                value={category.name}
                onChange={(e) => onChange(index, { name: e.target.value })}
                placeholder="Category name"
                autoComplete="off"
                aria-label={`Category ${index + 1} name`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemove(index)}
                aria-label={`Remove category ${index + 1}`}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}

      {!atLimit && (
        <button
          type="button"
          onClick={() => onAdd({ name: "", icon: "🏷️" })}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          + Add your own
        </button>
      )}

      <div className="pt-2">
        <AllowanceField
          allowanceName={allowanceName}
          onAllowanceNameChange={onAllowanceNameChange}
        />
      </div>
    </div>
  )
}
