export interface SummaryLike {
  id?: string
  status?: string
  note?: string | null
  createdAt?: string
  patientSummary?: string | null
  doctorSummary?: unknown
}

export function normalizeSummariesPayload(payload: unknown): SummaryLike[] {
  if (!payload || typeof payload !== 'object') return []
  const summaries = (payload as { summaries?: unknown }).summaries
  if (!Array.isArray(summaries)) return []
  return summaries.filter((item): item is SummaryLike => !!item && typeof item === 'object')
}

export function mergeCreatedSummary(existing: SummaryLike[], created: unknown): SummaryLike[] {
  if (!created || typeof created !== 'object') return existing
  const candidate = created as Record<string, unknown>
  if (typeof candidate.error === 'string') return existing
  return [candidate as SummaryLike, ...existing]
}