import type { Prisma } from '@prisma/client'
import { isSkipResponse } from './responseQualifiers'

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
  ayush?: Prisma.InputJsonValue
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
  answers: Map<string, unknown>,
  options?: { mode?: string | null }
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

  // Versioned, patient-reported Ayurvedic history. Written only for AYURVEDA
  // sessions and containing only answered patient-reported fields.
  if (options?.mode === 'AYURVEDA') {
    result.ayush = buildAyushBlock(answers)
  }

  return result
}

// Keys that may feed report.ayush.findings. Clinical-appraisal items
// (Nadi, Jihva, Drika, Shabda, Sparsha, Sara, Samhanana, Pramana, Trividha)
// are intentionally absent: they are doctor-side only.
const AYURVEDA_REPORT_FIELDS: ReadonlyArray<{
  key: string
  field: string
  recollection: boolean
}> = [
  { key: 'ayush_nidana', field: 'nidana', recollection: false },
  { key: 'ayush_agni', field: 'agni', recollection: false },
  { key: 'ayush_koshtha', field: 'koshtha', recollection: false },
  { key: 'ayush_ahara_vihara', field: 'aharaVihara', recollection: false },
  { key: 'ayush_mala', field: 'mala', recollection: false },
  { key: 'ayush_mutra', field: 'mutra', recollection: false },
  { key: 'ayush_samprapti', field: 'samprapti', recollection: false },
  { key: 'ayush_prakriti', field: 'prakriti', recollection: true },
  { key: 'ayush_vikriti', field: 'vikriti', recollection: true },
  { key: 'ayush_vaya', field: 'vaya', recollection: false },
  { key: 'ayush_satmya', field: 'satmya', recollection: false },
  { key: 'ayush_sattva', field: 'sattva', recollection: false },
  { key: 'ayush_vyayama_shakti', field: 'vyayamaShakti', recollection: false },
]

function buildAyushBlock(answers: Map<string, unknown>): Prisma.InputJsonValue {
  const findings: Record<string, unknown> = {}

  for (const { key, field, recollection } of AYURVEDA_REPORT_FIELDS) {
    if (!answers.has(key)) continue
    const raw = answers.get(key)

    // A "Not sure" / "Prefer not to answer" response is recorded verbatim as
    // patient-reported (notSure) instead of being dropped silently.
    if (isSkipResponse(raw)) {
      findings[field] = { notSure: true }
      continue
    }

    if (recollection) {
      // Prior knowledge recalled by the patient; never an AI inference.
      findings[field] = { value: String(raw), source: 'patient-recall' }
    } else {
      findings[field] = String(raw)
    }
  }

  return { version: 1, mode: 'AYURVEDA', findings } as Prisma.InputJsonValue
}