import { redirect } from "next/navigation"
import { getServerUser, getTricountLink } from "@/lib/server/data"
import { TricountSyncClient } from "@/components/tricount-sync-client"

export default async function SyncPage() {
  const [user, link] = await Promise.all([getServerUser(), getTricountLink()])

  if (!user) {
    redirect("/login")
  }

  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      <TricountSyncClient initialLink={link} />
    </main>
  )
}
