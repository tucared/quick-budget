import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AllowanceFieldProps {
  allowanceName: string
  onAllowanceNameChange: (value: string) => void
}

// Naming your personal allowance. Rendered once by the signup form, below the
// founder/invited fork — both a founder and an invited joiner get their own
// allowance, so the field applies to either path.
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
