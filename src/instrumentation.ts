export async function register() {
  // In cloud environments (Claude Code web), all outbound traffic must go through
  // a security proxy. Node.js native fetch (undici) does not respect HTTP_PROXY /
  // HTTPS_PROXY env vars by default. This sets a global dispatcher so that
  // server-side Supabase calls route through the proxy.
  if (
    typeof globalThis.process !== "undefined" &&
    (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  ) {
    const { EnvHttpProxyAgent, setGlobalDispatcher } = await import("undici")
    setGlobalDispatcher(new EnvHttpProxyAgent())
  }
}
