import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface PersonalFieldsProps {
  email: string
  onEmailChange: (value: string) => void
  password: string
  onPasswordChange: (value: string) => void
  confirmPassword: string
  onConfirmPasswordChange: (value: string) => void
  allowanceName: string
  onAllowanceNameChange: (value: string) => void
}

// Who's signing up. Always visible — unlike the household fields below it,
// nothing here depends on whether the email turns out to be invited: an
// invited joiner gets a personal allowance too, so the allowance name stays.
export default function PersonalFields({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  allowanceName,
  onAllowanceNameChange,
}: PersonalFieldsProps) {
  return (
    <>
      <div className="space-y-1">
        <p className="text-xs font-medium">Your account</p>
        <p className="text-xs text-muted-foreground">
          How you&apos;ll log in to Quick Budget.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="allowanceName">Your personal allowance</Label>
        <p className="text-xs text-muted-foreground">
          Everyone gets a personal budget for guilt-free spending that stays
          out of the shared totals. Name yours however you like.
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
    </>
  )
}
