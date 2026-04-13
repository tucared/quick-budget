"use client"

import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { clearStorageKeys } from "@/lib/types"
import { Receipt, Wallet, LogOut } from "lucide-react"
import { UserProvider } from "@/lib/contexts/user-context"
import type { UserData } from "@/lib/hooks/use-user"
import { useKeyboardVisible } from "@/lib/hooks/use-keyboard-visible"

const tabs = [
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/budget", label: "Budget", icon: Wallet },
] as const

export default function AppLayoutClient({
  children,
  initialUser,
}: {
  children: React.ReactNode
  initialUser: UserData | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const isKeyboardVisible = useKeyboardVisible()

  const handleLogout = async () => {
    clearStorageKeys()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <UserProvider initialUser={initialUser}>
      <div className="min-h-screen bg-background">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-foreground text-primary-foreground">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-sm font-medium uppercase tracking-[0.15em]">Quick Budget</h1>
            <button
              onClick={handleLogout}
              className="text-primary-foreground/60 hover:text-primary-foreground transition-colors p-1"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="pb-16">{children}</div>

        {/* Bottom tab bar — hidden when mobile keyboard is open */}
        {!isKeyboardVisible && <nav className="fixed bottom-0 left-0 right-0 z-10 bg-card border-t">
          <div className="flex">
            {tabs.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs uppercase tracking-wider transition-colors ${
                    isActive
                      ? "text-accent font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              )
            })}
          </div>
        </nav>}
      </div>
    </UserProvider>
  )
}
