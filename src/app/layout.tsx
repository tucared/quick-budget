import type { Metadata, Viewport } from "next"
import "@fontsource-variable/dm-sans"
import "./globals.css"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
}

export const metadata: Metadata = {
  title: {
    default: "Quick Budget",
    template: "%s · Quick Budget",
  },
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
