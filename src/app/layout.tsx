import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Quick Budget",
  description: "Frictionless expense tracking for couples",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  )
}
