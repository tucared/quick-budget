import { vi } from "vitest"

vi.mock("server-only", () => ({}))

// jwt-verify.ts constructs JWKS_URL at module initialization — needs a valid base URL.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321"
