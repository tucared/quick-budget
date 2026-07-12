import { FALLBACK_RATES_TO_EUR } from "@/lib/currency"
import { MAX_PARTNER_EMAILS } from "@/lib/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// Currencies with a known EUR-pivot rate (so cross-rates resolve offline). Keep
// EUR/BRL first to match the app's defaults.
const CURRENCIES = Object.keys(FALLBACK_RATES_TO_EUR)

// Mirror the Input component's classes so the native select sits flush with the
// text inputs (no shadcn Select primitive exists in this project).
const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"

interface HouseholdFieldsProps {
  householdName: string
  onHouseholdNameChange: (value: string) => void
  baseCurrency: string
  onBaseCurrencyChange: (value: string) => void
  secondaryCurrency: string
  onSecondaryCurrencyChange: (value: string) => void
  partnerEmails: string[]
  onPartnerEmailChange: (index: number, value: string) => void
  onAddPartner: () => void
  onRemovePartner: (index: number) => void
}

// Household setup — name, currencies, partner invites. The parent hides this
// entirely (rather than greying it out) once the email field is detected as
// an existing invite, since none of it applies to someone joining.
export default function HouseholdFields({
  householdName,
  onHouseholdNameChange,
  baseCurrency,
  onBaseCurrencyChange,
  secondaryCurrency,
  onSecondaryCurrencyChange,
  partnerEmails,
  onPartnerEmailChange,
  onAddPartner,
  onRemovePartner,
}: HouseholdFieldsProps) {
  return (
    <div className="space-y-4 pt-2 border-t border-border">
      <div className="space-y-1">
        <p className="text-xs font-medium">Your household</p>
        <p className="text-xs text-muted-foreground">
          Budgets here are shared — one pot for you and anyone you invite.
          Give it a name, or we&apos;ll make one from your email.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="householdName">Household name</Label>
        <Input
          id="householdName"
          name="householdName"
          value={householdName}
          onChange={(e) => onHouseholdNameChange(e.target.value)}
          placeholder="e.g. Casa Silva — optional"
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
              onChange={(e) => onBaseCurrencyChange(e.target.value)}
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
              onChange={(e) => onSecondaryCurrencyChange(e.target.value)}
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
          Every budget and total is shown in the base currency — it can&apos;t
          be changed later, so pick the one you mostly spend in. The secondary
          currency is the quick toggle on the expense form, for trips and
          foreign spending.
        </p>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-xs font-medium">Invite your partner</p>
          <p className="text-xs text-muted-foreground">
            When they sign up with this email, they&apos;ll join your household
            automatically — no code needed. Up to {MAX_PARTNER_EMAILS} partners.
          </p>
        </div>
        {partnerEmails.map((value, index) => (
          <div key={index} className="flex gap-2">
            <Input
              type="email"
              value={value}
              onChange={(e) => onPartnerEmailChange(index, e.target.value)}
              placeholder="partner@example.com"
              autoComplete="off"
              aria-label={`Partner email ${index + 1}`}
            />
            {partnerEmails.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemovePartner(index)}
                aria-label={`Remove partner email ${index + 1}`}
              >
                ×
              </Button>
            )}
          </div>
        ))}
        {partnerEmails.length < MAX_PARTNER_EMAILS && (
          <button
            type="button"
            onClick={onAddPartner}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            + Add another partner
          </button>
        )}
      </div>
    </div>
  )
}
