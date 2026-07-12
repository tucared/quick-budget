import { MAX_SIGNUP_CATEGORIES, type SignupCategory } from "@/lib/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
}

// The founder's spending categories — starts empty, filled from suggestion
// chips or free-form rows. Hidden by the parent (like the household fields)
// when the email turns out to be an invite, since the joiner inherits the
// founder's categories.
export default function CategoryFields({
  categories,
  onAdd,
  onChange,
  onRemove,
}: CategoryFieldsProps) {
  const chosenNames = new Set(categories.map((c) => c.name.trim().toLowerCase()))
  const suggestions = DEFAULT_CATEGORY_SUGGESTIONS.filter(
    (s) => !chosenNames.has(s.name.toLowerCase())
  )

  return (
    <div className="space-y-4 pt-2 border-t border-border">
      <div className="space-y-1">
        <p className="text-xs font-medium">Spending categories</p>
        <p className="text-xs text-muted-foreground">
          Every expense lands in a category — they&apos;re the buckets your
          monthly budget is split across. Start from the suggestions or add
          your own; a personal allowance for each of you is created
          automatically.
        </p>
      </div>

      {suggestions.length > 0 && categories.length < MAX_SIGNUP_CATEGORIES && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => onAdd(s)}
              className="rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              {s.icon} {s.name}
            </button>
          ))}
        </div>
      )}

      {categories.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add at least one to get started.
        </p>
      )}

      {categories.map((category, index) => (
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

      {categories.length < MAX_SIGNUP_CATEGORIES && (
        <button
          type="button"
          onClick={() => onAdd({ name: "", icon: "🏷️" })}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          + Add your own
        </button>
      )}
    </div>
  )
}
