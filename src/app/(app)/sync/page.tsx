import { redirect } from "next/navigation"
import {
  getServerUser,
  getTricountLinks,
  getHouseholdUsers,
  getTricountLinkBalances,
} from "@/lib/server/data"
import { TricountSyncClient } from "@/components/tricount-sync-client"

export default async function SyncPage() {
  const [user, links, users, linkBalances] = await Promise.all([
    getServerUser(),
    getTricountLinks(),
    getHouseholdUsers(),
    getTricountLinkBalances(),
  ])

  if (!user) {
    redirect("/login")
  }

  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      <TricountSyncClient
        initialLinks={links}
        householdUsers={users}
        linkBalances={linkBalances}
      />
    </main>
  )
}
