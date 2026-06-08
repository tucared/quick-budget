// Default cap for outbound `fetch` calls. A hung upstream (Tricount's
// undocumented backend, Frankfurter) otherwise keeps a serverless invocation
// open until the platform timeout; the abort surfaces as a normal fetch error
// that each caller already handles via its fallback/try-catch path.
export const FETCH_TIMEOUT_MS = 10_000

/**
 * `fetch` with a default abort timeout applied when the caller hasn't supplied
 * its own `signal`. Drop-in for `fetch(input, init)`.
 */
export function fetchWithTimeout(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}
