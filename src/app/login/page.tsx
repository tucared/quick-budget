import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server/data"
import LoginForm from "./login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await getServerUser()
  if (user) {
    redirect("/expenses")
  }
  const { error } = await searchParams
  const initialError =
    error === "recovery"
      ? "That reset link is invalid or has expired. Request a new one below."
      : undefined
  return <LoginForm initialError={initialError} />
}
