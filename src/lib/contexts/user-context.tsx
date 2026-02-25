"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useUser as useUserHook, type UserData } from "@/lib/hooks/use-user"

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
