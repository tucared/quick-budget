import { getServerUser } from "@/lib/server/data"
import AppLayoutClient from "./app-layout-client"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()

  return (
    <AppLayoutClient initialUser={user}>
      {children}
    </AppLayoutClient>
  )
}
