/**
 * Best-effort RTK Query / fetch error → user-facing string. Pulls `data.error` if the
 * server returned a structured `{ error, code }` body; falls back to the HTTP status or
 * the raw error.
 */
export function formatError(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { error?: string } }).data
    if (data?.error) return data.error
  }
  if (err && typeof err === "object" && "status" in err) {
    return `HTTP ${(err as { status: number }).status}`
  }
  return String(err)
}
