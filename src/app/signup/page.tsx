import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server/data"
import SignupForm from "./signup-form"

export default async function SignupPage() {
  const user = await getServerUser()
  if (user) {
    redirect("/expenses")
  }
  return <SignupForm />
}
