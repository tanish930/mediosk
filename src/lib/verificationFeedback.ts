export function verificationSuccessMessage(targetType: string, status: string): string {
  const s = (status || '').toUpperCase()
  const isReviewed = s === 'REVIEWED'
  switch ((targetType || '').toUpperCase()) {
    case 'PRECONSULTATION_REPORT':
      return isReviewed ? 'Symptom report marked as reviewed' : 'Symptom report verified'
    case 'MEDICAL_SUMMARY':
      return isReviewed ? 'Case summary marked as reviewed' : 'Case summary verified'
    case 'DOCUMENT':
      return isReviewed ? 'Document marked as reviewed' : 'Document verified'
    case 'AYUSH':
    case 'AYUSH_ASSESSMENT':
      return 'AYUSH assessment verified'
    default:
      return isReviewed ? 'Marked as reviewed' : 'Verified'
  }
}

export function verificationFailureMessage(error: string | null | undefined): string {
  if (error) return `Verification failed: ${error}`
  return 'Verification failed. Please try again.'
}