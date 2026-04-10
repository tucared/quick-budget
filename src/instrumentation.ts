export async function register() {
  // In cloud environments (Claude Code web), all outbound traffic must go through
  // a security proxy. Node.js native fetch (undici) does not respect HTTP_PROXY /
  // HTTPS_PROXY env vars by default. This sets a global dispatcher so that
  // server-side Supabase calls route through the proxy.
  //
  // Guard: only run in Node.js runtime (not Edge) where undici is available.
  if (
    typeof globalThis.process !== "undefined" &&
    typeof globalThis.process.versions?.node === "string" &&
    (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  ) {
    try {
      const { EnvHttpProxyAgent, setGlobalDispatcher } = await import("undici")
      setGlobalDispatcher(new EnvHttpProxyAgent())
    } catch {
      // Silently fail if undici is unavailable
    }
  }
}
