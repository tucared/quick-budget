import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
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
      <body className="font-sans">
          {children}
          <Analytics />
          <SpeedInsights />
        </body>
    </html>
  )
}
