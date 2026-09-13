export function mapAnswersToReport(answers: Map<string, unknown>): {
  onsetDuration?: string,
  location?: string,
  severity?: string,
  character?: string,
  aggravating?: any,
  relieving?: any,
  relevantHistory?: any,
  associated?: any,
} {
  const result: {
    onsetDuration?: string,
    location?: string,
    severity?: string,
    character?: string,
    aggravating?: any,
    relieving?: any,
    relevantHistory?: any,
    associated?: any,
  } = {}

  // Helper to get string value
  const getString = (key: string) => {
    const val = answers.get(key)
    return (val !== undefined && val !== null) ? String(val) : undefined
  }

  // Onset
  result.onsetDuration = getString('onset')

  // Location (Sanitize)
  const location = answers.get('location')
  if (location !== undefined && location !== null) {
    const locStr = String(location).trim()
    if (!['yes', 'no'].includes(locStr.toLowerCase())) {
      result.location = locStr
    }
  }

  // Severity (Number -> String)
  const severity = answers.get('severity')
  if (severity !== undefined && severity !== null) {
      const sevNum = Number(severity)
      result.severity = !isNaN(sevNum) ? String(sevNum) : String(severity)
  }

  // Extended fields
  result.character = getString('character')
  result.aggravating = answers.get('aggravating')
  result.relieving = answers.get('relieving')
  result.relevantHistory = answers.get('context')
  result.associated = answers.get('associated_symptoms')

  return result
}
