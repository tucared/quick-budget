import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server/data"
import LoginForm from "./login-form"

export default async function LoginPage() {
  const user = await getServerUser()
  if (user) {
    redirect("/expenses")
  }
  return <LoginForm />
}
