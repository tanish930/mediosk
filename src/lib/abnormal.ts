import { z } from 'zod'

export const AbnormalStatusSchema = z.enum(['LOW', 'HIGH', 'NORMAL', 'UNKNOWN'])

export type AbnormalStatus = z.infer<typeof AbnormalStatusSchema>

export type AbnormalResult = {
  status: AbnormalStatus
  reason?: string
}

function parseNumber(value?: string): number | null {
  if (!value) return null

  const normalized = value.replace(/,/g, '').trim()

  // Composite measurements such as blood pressure (140/90)
  // must not be treated as a single numeric laboratory value.
  if (/[-+]?\d*\.?\d+\s*\/\s*[-+]?\d*\.?\d+/.test(normalized)) {
    return null
  }

  const matches = normalized.match(/[-+]?\d*\.?\d+/g)

  // Require exactly one numeric value. This prevents accidentally
  // extracting the first number from a composite measurement.
  if (!matches || matches.length !== 1) return null

  const parsed = Number(matches[0])
  return Number.isFinite(parsed) ? parsed : null
}

export function assessAbnormalValue(
  value?: string,
  referenceRange?: string
): AbnormalResult {
  const numericValue = parseNumber(value)

  if (numericValue === null || !referenceRange?.trim()) {
    return {
      status: 'UNKNOWN',
      reason: 'Insufficient numeric value or reference range'
    }
  }

  const range = referenceRange.replace(/,/g, '').trim()

  // Explicit lower/upper bound: < 5, <= 5, > 10, >= 10
  const boundMatch = range.match(/^(<=|<|>=|>)\s*(-?\d*\.?\d+)/)

  if (boundMatch) {
    const operator = boundMatch[1]
    const limit = Number(boundMatch[2])

    if (!Number.isFinite(limit)) {
      return { status: 'UNKNOWN', reason: 'Invalid reference range' }
    }

    if (
      (operator === '<' && numericValue >= limit) ||
      (operator === '<=' && numericValue > limit)
    ) {
      return { status: 'HIGH', reason: `Value is above reference limit ${limit}` }
    }

    if (
      (operator === '>' && numericValue <= limit) ||
      (operator === '>=' && numericValue < limit)
    ) {
      return { status: 'LOW', reason: `Value is below reference limit ${limit}` }
    }

    return { status: 'NORMAL', reason: 'Value is within reference limit' }
  }

  // Standard range: 12-16, 12 � 16, 3.5 to 5.5
  const rangeMatch = range.match(
    /(-?\d*\.?\d+)\s*(?:-|�|�|to)\s*(-?\d*\.?\d+)/
  )

  if (!rangeMatch) {
    return {
      status: 'UNKNOWN',
      reason: 'Reference range format not recognized'
    }
  }

  const lower = Number(rangeMatch[1])
  const upper = Number(rangeMatch[2])

  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) {
    return {
      status: 'UNKNOWN',
      reason: 'Invalid reference range'
    }
  }

  if (numericValue < lower) {
    return {
      status: 'LOW',
      reason: `Value is below reference range ${lower}-${upper}`
    }
  }

  if (numericValue > upper) {
    return {
      status: 'HIGH',
      reason: `Value is above reference range ${lower}-${upper}`
    }
  }

  return {
    status: 'NORMAL',
    reason: `Value is within reference range ${lower}-${upper}`
  }
}

export type InvestigationAssessmentInput = {
  name?: string | null
  value?: string | null
  unit?: string | null
  referenceRange?: string | null
}

export type InvestigationAssessment = {
  name: string
  value: string | null
  unit: string | null
  referenceRange: string | null
  status: AbnormalStatus
  reason?: string
}

// Assess a single extracted investigation against its reference range.
// The original value, unit and reference range are preserved as-is so the
// doctor can judge the result; the status is only added as decision support.
export function assessInvestigation(
  inv: InvestigationAssessmentInput
): InvestigationAssessment {
  const result = assessAbnormalValue(inv.value ?? undefined, inv.referenceRange ?? undefined)
  return {
    name: inv.name ?? 'Investigation',
    value: inv.value ?? null,
    unit: inv.unit ?? null,
    referenceRange: inv.referenceRange ?? null,
    status: result.status,
    reason: result.reason,
  }
}

export function assessInvestigations(
  investigations: InvestigationAssessmentInput[] | null | undefined
): InvestigationAssessment[] {
  if (!investigations || !Array.isArray(investigations)) return []
  return investigations
    .filter((inv) => inv && typeof inv === 'object')
    .map(assessInvestigation)
}
