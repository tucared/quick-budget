# UI Simplification Plan

Two independent initiatives to reduce dependency count and complexity.

---

## 1. Drop React Hook Form — use React 19 + Zod directly

### Why

React Hook Form + `@hookform/resolvers` add 2 dependencies for a single form. React 19's built-in primitives (`useActionState`, `useTransition`) handle async submission, pending states, and error display natively. Zod alone handles validation — no resolver bridge needed.

### Current state

- **Only one form uses React Hook Form**: `src/components/expense-form.tsx`
- Other dialogs (`budget-edit-dialog.tsx`, `rebalance-dialog.tsx`) already use plain `useState` — no RHF there
- The form uses these RHF features:
  - `useForm()` with `zodResolver` — initialization + validation
  - `register()` — only on the description textarea (line 572)
  - `handleSubmit()` — form submission wrapper
  - `setValue()` — programmatic updates (~11 call sites for category, currency, date, amount, is_cash)
  - `watch()` — reactive reads of 5 fields (category_id, currency, is_cash, amount, expense_date)
  - `reset()` — clearing form after successful submit
  - `formState.errors` — displaying validation errors

### Migration approach

Replace RHF with a custom hook or inline state. Two options:

#### Option A: Plain useState + Zod (recommended — simplest)

```tsx
// State for each field
const [amount, setAmount] = useState<number>(NaN)
const [categoryId, setCategoryId] = useState<string>("")
const [currency, setCurrency] = useState<string>("EUR")
const [isCash, setIsCash] = useState<boolean>(false)
const [expenseDate, setExpenseDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
const [description, setDescription] = useState<string>("")

// Validation on submit
const [errors, setErrors] = useState<Record<string, string>>({})

async function onSubmit() {
  const result = expenseSchema.safeParse({ amount, category_id: categoryId, ... })
  if (!result.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message
    }
    setErrors(fieldErrors)
    return
  }
  setErrors({})
  // ... existing submit logic with result.data
}

// Reset after success
function resetForm() {
  setAmount(NaN)
  setDescription("")
  // keep category, currency, date (existing behavior)
}
```

This matches the existing pattern used in `budget-edit-dialog.tsx` and `rebalance-dialog.tsx`.

#### Option B: useActionState (if converting to Server Action)

Only worth it if the submit logic is also moved server-side. Currently, the expense form does client-side Supabase insert + exchange rate fetch, so a Server Action conversion would be a larger change. **Not recommended for this iteration.**

### Files to modify

| File | Change |
|------|--------|
| `src/components/expense-form.tsx` | Replace `useForm` with `useState` per field. Replace `watch()` with direct state reads. Replace `setValue()` with setter calls. Replace `handleSubmit(onSubmit)` with direct `onSubmit`. Replace `register("description")` with `value={description} onChange={...}`. Replace `formState.errors` with local `errors` state. Validate with `expenseSchema.safeParse()` on submit. |
| `src/lib/validations.ts` | No changes needed — Zod schema stays as-is |
| `package.json` | Remove `react-hook-form` and `@hookform/resolvers` |

### Packages removed

```
react-hook-form        (51 kB gzipped)
@hookform/resolvers    (2 kB gzipped)
```

### Risk assessment

- **Low risk** — the other dialogs already prove this pattern works in this codebase
- The POS-style amount input (invisible `<input>` with `onKeyDown`) doesn't use `register()` — it calls `setValue("amount", ...)` directly, which becomes `setAmount(...)`. No behavior change.
- The `CategoryTileSelector` callback `onValueChange` currently calls `setValue("category_id", value)` — becomes `setCategoryId(value)`. No behavior change.
- The `DatePicker` callback currently calls `setValue("expense_date", ...)` — becomes `setExpenseDate(...)`. No behavior change.

### Verification

After migration:
1. `npm run lint` — no unused imports
2. `npm run build` — no type errors
3. Manual test: log an expense in EUR, log one in BRL (triggers exchange rate fetch), verify form resets correctly, verify validation errors show on empty submit

---

## 2. Evaluate react-day-picker replacement

### Why

`react-day-picker` (v9) is the most specialized dependency in the stack. It works, but it's heavy for what amounts to a single-date picker with 3 quick-pick buttons.

### Current state

- **Used in 2 files**:
  - `src/components/ui/calendar.tsx` — wraps `DayPicker` with custom styling (213 lines, heavily customized)
  - `src/components/ui/date-picker.tsx` — combines Popover + Calendar + quick-pick buttons (121 lines)
- **Features actually used**: single-date selection, Monday week start, outside days shown, custom day button styling
- **Features NOT used**: range selection, multi-select, keyboard navigation across months, localization

### Options

#### Option A: Keep react-day-picker (recommended for now)

The calendar component works well, the styling is done, and the quick-pick buttons are custom anyway. The library is ~15 kB gzipped. Not worth replacing unless it becomes a maintenance burden.

#### Option B: Replace with native `<input type="date">` + quick-pick buttons

Drastically simpler but loses the custom popover UX. The quick-pick buttons ("Today", "Yesterday", "2 days ago") would need to be standalone buttons that set the hidden date input. Mobile browsers render native date pickers well; desktop browsers vary.

#### Option C: Build a minimal calendar from scratch

~150 lines of code for a single-month grid. Removes the dependency but adds maintenance surface. Only worth it if react-day-picker causes upgrade pain.

### Recommendation

**No action now.** Flag for revisit if:
- react-day-picker releases a breaking major version
- The calendar.tsx customizations fight upstream changes
- Bundle size becomes a concern (currently not — app is small)

---

## Execution order

1. **Do item 1 first** (drop RHF) — standalone, clear scope, immediate dependency reduction
2. **Item 2 is deferred** — react-day-picker stays unless problems arise

## Definition of done

- [ ] `expense-form.tsx` uses `useState` + `expenseSchema.safeParse()` instead of RHF
- [ ] `react-hook-form` and `@hookform/resolvers` removed from `package.json`
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Manual test: create expense in EUR and BRL, verify validation errors, verify form reset
