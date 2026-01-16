import Link from "next/link"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Quick Budget</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Frictionless expense tracking for couples
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </main>
  )
}
