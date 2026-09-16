export interface TimelineEntryLike {
  sourceDocumentId?: string | null
}

export function timelineEntrySource(
  entry: TimelineEntryLike
): 'document' | 'patient' {
  return entry.sourceDocumentId ? 'document' : 'patient'
}

export function timelineSourceLabel(
  entry: TimelineEntryLike
): string {
  return timelineEntrySource(entry) === 'document'
    ? 'From document (AI/OCR extracted)'
    : 'Patient-entered'
}