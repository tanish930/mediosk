import {
  verificationFailureMessage,
  verificationSuccessMessage,
} from '../src/lib/verificationFeedback'

describe('verificationSuccessMessage', () => {
  test('symptom report review and verify messages', () => {
    expect(verificationSuccessMessage('PRECONSULTATION_REPORT', 'REVIEWED')).toBe(
      'Symptom report marked as reviewed'
    )
    expect(verificationSuccessMessage('PRECONSULTATION_REPORT', 'VERIFIED')).toBe(
      'Symptom report verified'
    )
  })

  test('AI medical summary review and verify messages', () => {
    expect(verificationSuccessMessage('MEDICAL_SUMMARY', 'REVIEWED')).toBe(
      'Case summary marked as reviewed'
    )
    expect(verificationSuccessMessage('MEDICAL_SUMMARY', 'VERIFIED')).toBe(
      'Case summary verified'
    )
  })

  test('document review message', () => {
    expect(verificationSuccessMessage('DOCUMENT', 'REVIEWED')).toBe(
      'Document marked as reviewed'
    )
  })

  test('AYUSH verification message', () => {
    expect(verificationSuccessMessage('AYUSH', 'VERIFIED')).toBe(
      'AYUSH assessment verified'
    )
    expect(verificationSuccessMessage('AYUSH_ASSESSMENT', 'VERIFIED')).toBe(
      'AYUSH assessment verified'
    )
  })

  test('unknown target falls back to generic messages', () => {
    expect(verificationSuccessMessage('SOMETHING', 'REVIEWED')).toBe(
      'Marked as reviewed'
    )
    expect(verificationSuccessMessage('SOMETHING', 'VERIFIED')).toBe('Verified')
  })

  test('status is case-insensitive', () => {
    expect(verificationSuccessMessage('document', 'reviewed')).toBe(
      'Document marked as reviewed'
    )
  })
})

describe('verificationFailureMessage', () => {
  test('includes the server-provided error', () => {
    expect(verificationFailureMessage('Access denied')).toBe(
      'Verification failed: Access denied'
    )
  })

  test('falls back when no error is provided', () => {
    expect(verificationFailureMessage(null)).toBe(
      'Verification failed. Please try again.'
    )
    expect(verificationFailureMessage(undefined)).toBe(
      'Verification failed. Please try again.'
    )
  })
})