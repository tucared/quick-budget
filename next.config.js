/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.1.*"],
  serverExternalPackages: ['undici'],

  async headers() {
    // Build connect-src to include the configured Supabase URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    // Convert http(s):// to ws(s):// for WebSocket realtime connections
    const supabaseWs = supabaseUrl
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://")
    const connectSrc = [
      "'self'",
      supabaseUrl,
      supabaseWs,
      // Fallback wildcard for Supabase cloud projects
      "https://*.supabase.co",
      "wss://*.supabase.co",
      // Frankfurter exchange rate API (server-side only, but included for completeness)
      "https://api.frankfurter.dev",
    ]
      .filter(Boolean)
      .join(" ")

    const csp = [
      "default-src 'self'",
      // Next.js App Router requires unsafe-inline for hydration scripts
      "script-src 'self' 'unsafe-inline'",
      // Tailwind CSS v4 uses inline styles
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src ${connectSrc}`,
      // Prevent this page from being embedded in frames on other origins
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; ")

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ]
  },
};

export default nextConfig;
