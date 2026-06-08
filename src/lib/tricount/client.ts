import "server-only"
import { generateKeyPairSync, randomUUID } from "node:crypto"
import type { FetchedRegistry, TricountMembership } from "./types"

// Read-only client for Tricount's undocumented app backend (bunq infra).
//
// There is no official Tricount API. The app authenticates anonymously: it
// POSTs a freshly generated app-installation UUID + an RSA public key to a
// single `session-registry-installation` endpoint, gets back a session token
// and a synthetic user id, then reads any tricount by its public share token
// (the code in a https://tricount.com/<token> link). No signing, no secret —
// matching the community reference (github.com/marinoo3/TricountAPI-python).
//
// Server-side only. Outbound fetch is routed through the cloud security proxy
// by src/instrumentation.ts (EnvHttpProxyAgent), so plain `fetch` works here
// and in production alike.

const BASE_URL = "https://api.tricount.bunq.com"
// Tricount's backend is undocumented and carries no SLA. Cap each call so a
// hung upstream can't keep a serverless invocation (or a manual "Sync") open
// until the platform timeout — the abort surfaces as the normal fetch error.
const FETCH_TIMEOUT_MS = 10_000
// Pins the app build the API expects in the User-Agent. Bump if the endpoint
// starts rejecting the handshake after a Tricount app update.
const USER_AGENT = "com.bunq.tricount.android:RELEASE:7.0.7:3174:ANDROID:13:C"

interface InstallationResponse {
  Response: Array<Record<string, unknown>>
}

function memberName(m: TricountMembership): string {
  const inner = m.RegistryMembershipNonUser
  return inner.alias?.pointer?.name ?? inner.alias?.display_name ?? ""
}

/**
 * Extract the public identifier token from a Tricount share link or raw code.
 * Accepts `https://tricount.com/tSRhtvSJtYyDukBmBw`, with/without trailing
 * slash or query, or the bare token. Returns null when nothing token-shaped
 * is found.
 */
export function parseTricountToken(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Bare token
  if (/^[A-Za-z0-9]{6,}$/.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
    const seg = url.pathname.split("/").filter(Boolean).pop()
    if (seg && /^[A-Za-z0-9]{6,}$/.test(seg)) return seg
  } catch {
    // fall through
  }
  return null
}

async function authenticate(): Promise<{ token: string; userId: number; headers: Record<string, string> }> {
  const appId = randomUUID()
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString()

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "app-id": appId,
    "X-Bunq-Client-Request-Id": randomUUID(),
    "Content-Type": "application/json",
  }

  const res = await fetch(`${BASE_URL}/v1/session-registry-installation`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      app_installation_uuid: appId,
      client_public_key: pem,
      device_description: "Android",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!res.ok) {
    throw new Error(`Tricount auth failed (HTTP ${res.status})`)
  }

  const json = (await res.json()) as InstallationResponse
  const response = json.Response ?? []
  const tokenEntry = response.find((r) => "Token" in r) as
    | { Token: { token: string } }
    | undefined
  const userEntry = response.find((r) => "UserPerson" in r) as
    | { UserPerson: { id: number } }
    | undefined

  const token = tokenEntry?.Token?.token
  const userId = userEntry?.UserPerson?.id
  if (!token || !userId) {
    throw new Error("Tricount auth response missing token or user id")
  }

  return { token, userId, headers }
}

/**
 * Fetch and normalize a tricount registry by its public share token.
 * @throws on auth/network failure or when the token resolves to no registry.
 */
export async function fetchRegistry(token: string): Promise<FetchedRegistry> {
  const { token: authToken, userId, headers } = await authenticate()

  const res = await fetch(
    `${BASE_URL}/v1/user/${userId}/registry?public_identifier_token=${encodeURIComponent(token)}`,
    {
      headers: { ...headers, "X-Bunq-Client-Authentication": authToken },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  )

  if (!res.ok) {
    throw new Error(`Tricount registry fetch failed (HTTP ${res.status})`)
  }

  const json = (await res.json()) as { Response?: Array<{ Registry?: unknown }> }
  const registry = json.Response?.[0]?.Registry as
    | {
        title: string
        currency: string
        memberships: TricountMembership[]
        all_registry_entry: { RegistryEntry: FetchedRegistry["entries"][number] }[]
      }
    | undefined

  if (!registry) {
    throw new Error("Tricount registry not found for the provided link")
  }

  return {
    title: registry.title,
    currency: registry.currency,
    members: (registry.memberships ?? []).map((m) => ({
      id: m.RegistryMembershipNonUser.id,
      name: memberName(m),
    })),
    entries: (registry.all_registry_entry ?? []).map((e) => e.RegistryEntry),
  }
}
