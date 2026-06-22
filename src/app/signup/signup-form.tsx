"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase"
import { FALLBACK_RATES_TO_EUR } from "@/lib/currency"
import { signupSchema } from "@/lib/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Currencies with a known EUR-pivot rate (so cross-rates resolve offline). Keep
// EUR/BRL first to match the app's defaults.
const CURRENCIES = Object.keys(FALLBACK_RATES_TO_EUR)

// Mirror the Input component's classes so the native select sits flush with the
// text inputs (no shadcn Select primitive exists in this project).
const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"

// Map a Supabase auth signUp error to an actionable message. Several of these
// surface project-level/Supabase limits rather than anything the form did wrong
// — notably the built-in mailer's per-hour rate limit — so we spell out the wait
// and the fix instead of echoing Supabase's terse text.
function signupErrorMessage(error: { message?: string; code?: string; status?: number }): string {
  const message = error.message ?? ""
  const code = error.code ?? ""
  const lower = message.toLowerCase()

  if (lower.includes("fetch")) {
    return "Unable to reach the server. Check your connection and try again."
  }
  if (error.status === 429 || code === "over_email_send_rate_limit" || lower.includes("rate limit")) {
    return "Too many sign-up emails were sent recently, so the email service is rate-limited. Please try again in an hour or so (or ask the admin to configure custom SMTP)."
  }
  if (code === "email_address_invalid" || lower.includes("is invalid")) {
    return "That email address looks invalid or undeliverable. Please use a real email you can receive mail at."
  }
  if (code === "signup_disabled" || lower.includes("not allowed")) {
    return "Sign-ups aren't enabled for this app yet. Please check back later."
  }
  if (code === "user_already_exists" || lower.includes("already registered") || lower.includes("already been registered")) {
    return "An account with this email already exists. Try logging in, or use “Forgot password?”"
  }
  // weak_password and anything else: Supabase's own message is already readable.
  return message || "Couldn't create your household. Please try again."
}

export default function SignupForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [householdName, setHouseholdName] = useState("")
  const [baseCurrency, setBaseCurrency] = useState("EUR")
  const [secondaryCurrency, setSecondaryCurrency] = useState("BRL")
  const [partnerEmails, setPartnerEmails] = useState<string[]>([""])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const updatePartner = (index: number, value: string) => {
    setPartnerEmails((prev) => prev.map((e, i) => (i === index ? value : e)))
  }
  const addPartner = () => setPartnerEmails((prev) => [...prev, ""])
  const removePartner = (index: number) =>
    setPartnerEmails((prev) => prev.filter((_, i) => i !== index))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const inviteEmails = partnerEmails.map((s) => s.trim()).filter(Boolean)
    const parsed = signupSchema.safeParse({
      email,
      password,
      confirmPassword,
      fullName,
      householdName: householdName.trim() || undefined,
      baseCurrency,
      secondaryCurrency,
      inviteEmails,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form and try again.")
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: signUpError } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          // After confirming their email, land them straight in the app — the
          // household + categories are already created by the DB trigger.
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/expenses`,
          data: {
            full_name: parsed.data.fullName,
            household_name: parsed.data.householdName ?? "",
            base_currency: parsed.data.baseCurrency,
            secondary_currency: parsed.data.secondaryCurrency,
            invite_emails: parsed.data.inviteEmails,
          },
        },
      })

      if (signUpError) {
        setError(signupErrorMessage(signUpError))
        setLoading(false)
        return
      }

      // Email confirmation is required, so signUp returns no session. Show a
      // neutral confirmation prompt rather than navigating.
      setSent(true)
      setLoading(false)
    } catch (_err) {
      setError("An unexpected error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-none bg-transparent">
        <CardHeader className="text-center">
          <CardTitle className="text-sm font-medium uppercase tracking-[0.15em]">
            Create a household
          </CardTitle>
        </CardHeader>

        {sent ? (
          <CardContent className="space-y-4">
            <div className="p-3 text-sm rounded-md bg-muted text-foreground">
              Check your inbox — we&apos;ve sent a link to confirm your email. Once
              you confirm, you&apos;ll be signed in and ready to go. Any partners you
              invited can sign up with their own email to join this household.
            </div>
            <a href="/login" className="block text-center text-xs text-muted-foreground hover:text-foreground">
              Back to log in
            </a>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="fullName">Your name</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="householdName">Household name</Label>
                <Input
                  id="householdName"
                  name="householdName"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="Optional — defaults to your name"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="baseCurrency">Base currency</Label>
                    <select
                      id="baseCurrency"
                      name="baseCurrency"
                      value={baseCurrency}
                      onChange={(e) => setBaseCurrency(e.target.value)}
                      className={cn(selectClassName)}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondaryCurrency">Secondary currency</Label>
                    <select
                      id="secondaryCurrency"
                      name="secondaryCurrency"
                      value={secondaryCurrency}
                      onChange={(e) => setSecondaryCurrency(e.target.value)}
                      className={cn(selectClassName)}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Base currency is used for every budget and total and can&apos;t
                  be changed later. Secondary is the other option in the expense
                  form&apos;s currency toggle.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Invite partners (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  They&apos;ll join this household when they sign up with the email
                  you enter.
                </p>
                {partnerEmails.map((value, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="email"
                      value={value}
                      onChange={(e) => updatePartner(index, e.target.value)}
                      placeholder="partner@example.com"
                      autoComplete="off"
                      aria-label={`Partner email ${index + 1}`}
                    />
                    {partnerEmails.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePartner(index)}
                        aria-label={`Remove partner email ${index + 1}`}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPartner}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  + Add another partner
                </button>
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create household"}
              </Button>
              <a href="/login" className="text-xs text-muted-foreground hover:text-foreground">
                Already have an account? Log in
              </a>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
