"use client"

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { useUser as useUserHook, type UserData } from "@/lib/hooks/use-user"
import { formatCurrency } from "@/lib/currency"

interface UserContextValue {
  user: UserData | null
  loading: boolean
  error: string | null
}

const UserContext = createContext<UserContextValue | undefined>(undefined)

interface UserProviderProps {
  children: ReactNode
  initialUser?: UserData | null
}

export function UserProvider({ children, initialUser }: UserProviderProps) {
  const value = useUserHook(initialUser)

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  )
}

/**
 * Hook to access the current user's data including household ID
 * Must be used within a UserProvider
 */
export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider")
  }
  return context
}

/**
 * Household-currency helpers bound to the current user's base/secondary
 * currency. `format` denominates an amount in the household's base currency
 * (what every `converted_amount`, allocation, and cap is stored in); pass an
 * explicit currency to `formatCurrency` directly when rendering an original
 * foreign amount instead. Defaults to EUR/BRL until the user resolves.
 */
export function useCurrency() {
  const { user } = useUser()
  const baseCurrency = user?.baseCurrency ?? "EUR"
  const secondaryCurrency = user?.secondaryCurrency ?? "BRL"
  const format = useCallback(
    (value: number, decimals: number = 2) => formatCurrency(value, decimals, baseCurrency),
    [baseCurrency],
  )
  return useMemo(
    () => ({ baseCurrency, secondaryCurrency, format }),
    [baseCurrency, secondaryCurrency, format],
  )
}
