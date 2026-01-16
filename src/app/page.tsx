import Link from "next/link"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-4">Quick Budget</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Frictionless expense tracking for couples
        </p>
        <div className="mb-8 p-6 bg-muted rounded-lg text-left">
          <h2 className="font-semibold mb-3">Test Accounts (Local Development)</h2>
          <div className="space-y-2 text-sm">
            <div>
              <strong>User 1:</strong> user1@test.com / password123
            </div>
            <div>
              <strong>User 2:</strong> user2@test.com / password123
            </div>
          </div>
        </div>
        <Link
          href="/login"
          className="inline-block px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          Log In
        </Link>
      </div>
    </main>
  )
}
