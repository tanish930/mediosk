import type { Prisma } from '@prisma/client'

type ReportMapping = {
  onsetDuration?: string
  location?: string
  severity?: string
  character?: string
  aggravating?: Prisma.InputJsonValue
  relieving?: Prisma.InputJsonValue
  relevantHistory?: Prisma.InputJsonValue
  associated?: Prisma.InputJsonValue
  currentMedications?: string
  allergies?: string
  pastSurgicalHistory?: string
  familyHistory?: string
  personalSocialHistory?: string
  reviewOfSystems?: string
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value as Prisma.InputJsonValue
  }

  if (typeof value === 'object') {
    return value as Prisma.InputJsonValue
  }

  return undefined
}

export function mapAnswersToReport(
  answers: Map<string, unknown>
): ReportMapping {
  const result: ReportMapping = {}

  const getString = (key: string): string | undefined => {
    const val = answers.get(key)

    return val !== undefined && val !== null
      ? String(val)
      : undefined
  }

  // Onset / duration
  result.onsetDuration = getString('onset')

  // Location
  const location = answers.get('location')

  if (location !== undefined && location !== null) {
    const locStr = String(location).trim()

    if (!['yes', 'no'].includes(locStr.toLowerCase())) {
      result.location = locStr
    }
  }

  // Severity
  // Prisma stores severity as String?, so preserve the patient's answer
  // as a string instead of assuming it is numeric.
  const severity = answers.get('severity')

  if (severity !== undefined && severity !== null) {
    result.severity = String(severity)
  }

  // HPI
  result.character = getString('character')
  result.aggravating = toJsonValue(answers.get('aggravating'))
  result.relieving = toJsonValue(answers.get('relieving'))

  // Medical history
  result.relevantHistory = toJsonValue(
    answers.get('past_medical_history') ?? answers.get('context')
  )

  result.associated = toJsonValue(
    answers.get('associated_symptoms')
  )

  // Medication and allergy history
  result.currentMedications = getString('medication_history')
  result.allergies = getString('allergy_history')

  // Detailed history
  result.pastSurgicalHistory = getString('past_surgical_history')
  result.familyHistory = getString('family_history')
  result.personalSocialHistory = getString('personal_social_history')
  result.reviewOfSystems = getString('review_of_systems')

  return result
}