import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server/data"

export default async function Home() {
  const user = await getServerUser()
  redirect(user ? "/expenses" : "/login")
}
