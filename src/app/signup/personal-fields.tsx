import { MIN_PASSWORD_LENGTH } from "@/lib/validations"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface PersonalFieldsProps {
  email: string
  onEmailChange: (value: string) => void
  password: string
  onPasswordChange: (value: string) => void
}

// Who's signing up. Always visible — unlike the household fields below it,
// nothing here depends on whether the email turns out to be invited.
// No confirm-password field: a typo'd password is recoverable through the
// existing "Forgot password?" flow, and one field keeps the form short.
export default function PersonalFields({
  email,
  onEmailChange,
  password,
  onPasswordChange,
}: PersonalFieldsProps) {
  return (
    <>
      <p className="text-sm font-semibold">Your account</p>

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
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>
    </>
  )
}
