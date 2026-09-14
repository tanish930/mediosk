export interface PreconsultIntent {
  newFlow: boolean
  sessionId: string | null
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

/**
 * Resolves how the patient arrived at the pre-consultation page:
 *
 * - `?session=<id>`  -> operate explicitly on that session. Never auto-resume.
 * - `?new=1`         -> start a brand-new consultation flow. Never auto-resume.
 * - no params        -> default: resume the latest in-progress session.
 *
 * An explicit session id always wins over the new-flow flag.
 */
export function parsePreconsultIntent(query: {
  new?: string | string[]
  session?: string | string[]
}): PreconsultIntent {
  const sessionId = first(query.session)
  const newFlag = first(query.new)
  return {
    newFlow: !sessionId && (newFlag === '1' || newFlag === 'true'),
    sessionId,
  }
}