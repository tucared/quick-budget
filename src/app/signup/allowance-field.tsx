import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AllowanceFieldProps {
  allowanceName: string
  onAllowanceNameChange: (value: string) => void
}

// Naming your personal allowance. Rendered both for a founder (grouped with the
// spending categories, since an allowance is just another budget bucket) and for
// an invited joiner (who still gets their own allowance). Kept as its own
// component so both paths share one implementation.
export default function AllowanceField({
  allowanceName,
  onAllowanceNameChange,
}: AllowanceFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="allowanceName">Your personal allowance</Label>
      <p className="text-xs text-muted-foreground">
        A personal bucket that stays out of the shared totals.
      </p>
      <Input
        id="allowanceName"
        name="allowanceName"
        value={allowanceName}
        onChange={(e) => onAllowanceNameChange(e.target.value)}
        placeholder="e.g. Sam's fun money — optional"
        autoComplete="off"
        maxLength={40}
      />
    </div>
  )
}
