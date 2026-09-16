import {
  timelineEntrySource,
  timelineSourceLabel,
} from '../src/lib/timeline'

describe('timeline source distinction', () => {
  test('entry with sourceDocumentId is labelled as a document', () => {
    expect(timelineEntrySource({ sourceDocumentId: 'doc-1' })).toBe('document')
    expect(timelineSourceLabel({ sourceDocumentId: 'doc-1' })).toBe(
      'From document (AI/OCR extracted)'
    )
  })

  test('entry without sourceDocumentId is labelled patient-entered', () => {
    expect(timelineEntrySource({})).toBe('patient')
    expect(timelineEntrySource({ sourceDocumentId: null })).toBe('patient')
    expect(timelineSourceLabel({ sourceDocumentId: null })).toBe(
      'Patient-entered'
    )
  })

  test('empty detail entries still resolve to patient-entered', () => {
    expect(timelineSourceLabel({})).toBe('Patient-entered')
  })
})