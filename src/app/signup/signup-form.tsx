"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase"
import { MAX_PARTNER_EMAILS, signupSchema } from "@/lib/validations"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import PersonalFields from "./personal-fields"
import HouseholdFields from "./household-fields"

const INVITE_CHECK_DEBOUNCE_MS = 500
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  const [invited, setInvited] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)

  // The error banner sits at the top of a form that is taller than a phone
  // viewport, while the submit button sits at the bottom — without this, a
  // validation failure lands off-screen and the tap appears to do nothing.
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [error])

  // Live "have you been invited?" check as the visitor types their email —
  // collapses the household fields below instead of showing them greyed out
  // with a static disclaimer. Debounced and self-cancelling: a response for a
  // stale email (changed mid-flight) is dropped rather than applied.
  useEffect(() => {
    if (!EMAIL_RE.test(email)) {
      return
    }
    let cancelled = false
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/signup/check-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
        if (cancelled) return
        const data = await res.json()
        setInvited(data?.invited === true)
      } catch {
        if (!cancelled) setInvited(false)
      }
    }, INVITE_CHECK_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [email])

  const updatePartner = (index: number, value: string) => {
    setPartnerEmails((prev) => prev.map((e, i) => (i === index ? value : e)))
  }
  const addPartner = () =>
    setPartnerEmails((prev) =>
      prev.length >= MAX_PARTNER_EMAILS ? prev : [...prev, ""]
    )
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
      fullName: fullName.trim() || undefined,
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
            full_name: parsed.data.fullName ?? "",
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
            Sign up
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
                <div ref={errorRef} className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  {error}
                </div>
              )}

              <PersonalFields
                fullName={fullName}
                onFullNameChange={setFullName}
                email={email}
                onEmailChange={setEmail}
                password={password}
                onPasswordChange={setPassword}
                confirmPassword={confirmPassword}
                onConfirmPasswordChange={setConfirmPassword}
              />

              {invited && EMAIL_RE.test(email) ? (
                <p
                  className="text-xs text-muted-foreground pt-2 border-t border-border"
                  aria-live="polite"
                >
                  You&apos;ve been invited to join an existing household —
                  sign up to join it. The household fields don&apos;t apply.
                </p>
              ) : (
                <HouseholdFields
                  householdName={householdName}
                  onHouseholdNameChange={setHouseholdName}
                  baseCurrency={baseCurrency}
                  onBaseCurrencyChange={setBaseCurrency}
                  secondaryCurrency={secondaryCurrency}
                  onSecondaryCurrencyChange={setSecondaryCurrency}
                  partnerEmails={partnerEmails}
                  onPartnerEmailChange={updatePartner}
                  onAddPartner={addPartner}
                  onRemovePartner={removePartner}
                />
              )}
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing up..." : "Sign up"}
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
