// Deterministic, rule-based Ayurvedic doshic decision support.
//
// PURPOSE
//   Produces a transparent, testable "suggested doshic involvement" result
//   from a doctor-verified AyushAssessment. It NEVER runs an LLM and never
//   determines Prakriti/Vikriti/dosha by itself: it only surfaces which
//   doshas appear in the doctor-verified assessment text and records the
//   exact evidence (field, matched term, value) that contributed.
//
// SAFETY RULES (must be preserved)
//   - Only doctor-verified assessment fields are read. Patient-reported
//     Ayurvedic history is deliberately NOT an input.
//   - Unknown / not-sure / missing / empty values are never converted into a
//     positive finding.
//   - Only a curated canonical vocabulary is matched (tridosha terms plus the
//     well-established Ayurvedic agni and koshtha qualifiers) — no invented
//     clinical categories.
//   - The output is labelled decision support and always requires doctor
//     verification. It is not a diagnosis and does not prescribe anything.

export type DoshaKey = 'vata' | 'pitta' | 'kapha'

export const DOSHA_KEYS: readonly DoshaKey[] = ['vata', 'pitta', 'kapha']

export const DOSHA_LABELS: Record<DoshaKey, string> = {
  vata: 'Vata',
  pitta: 'Pitta',
  kapha: 'Kapha',
}

export interface NadiData {
  rateBpm?: number | null
  rhythm?: string | null
  gati?: string | null
  quality?: string | null
  note?: string | null
}

// Doctor-verified fields that the rule engine is allowed to read. Each key is
// a flat column of AyushAssessment; nadiData is handled separately.
export interface DoshicAssessmentInput {
  prakriti?: string | null
  vikriti?: string | null
  sara?: string | null
  samhanna?: string | null
  pramana?: string | null
  satmya?: string | null
  sattva?: string | null
  aharaShakti?: string | null
  vyayamaShakti?: string | null
  vaya?: string | null
  aharaVihara?: string | null
  agni?: string | null
  koshtha?: string | null
  nadi?: string | null
  sleep?: string | null
  note?: string | null
  nadiData?: NadiData | null
}

export interface DoshicEvidence {
  field: string
  fieldLabel: string
  matchedTerm: string
  value: string
  note: string
}

export interface DoshaResult {
  dosha: DoshaKey
  suggested: boolean
  evidence: DoshicEvidence[]
}

export interface DoshicAssessmentResult {
  version: number
  source: 'rule-based'
  decisionSupport: true
  requiresDoctorReview: true
  conclusion: string
  doshas: DoshaResult[]
}

const FIELD_LABELS: Record<string, string> = {
  prakriti: 'Prakriti (doctor)',
  vikriti: 'Vikriti (doctor)',
  sara: 'Sara',
  samhanna: 'Samhanana',
  pramana: 'Pramana',
  satmya: 'Satmya',
  sattva: 'Sattva',
  aharaShakti: 'Ahara Shakti',
  vyayamaShakti: 'Vyayama Shakti',
  vaya: 'Vaya',
  aharaVihara: 'Ahara-Vihara',
  agni: 'Agni',
  koshtha: 'Koshtha',
  nadi: 'Nadi (pulse)',
  sleep: 'Sleep (history)',
  note: 'Clinical note',
  'nadiData.rateBpm': 'Nadi rate (bpm)',
  'nadiData.rhythm': 'Nadi rhythm',
  'nadiData.gati': 'Nadi gati',
  'nadiData.quality': 'Nadi quality',
  'nadiData.note': 'Nadi note',
}

interface Marker {
  term: string
  note: string
}

// Canonical tridosha terminology. These are the only terms matched against
// general doctor-verified text fields. Word-boundary matching avoids
// accidental substring hits (e.g. "elevator" must not match "vat").
const DOSHA_TERMS: Record<DoshaKey, Marker[]> = {
  vata: [
    { term: 'vata', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'vatika', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'vataja', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'vataj', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'वात', note: 'Explicit dosha term found in doctor-verified field' },
  ],
  pitta: [
    { term: 'pitta', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'paittika', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'pittaja', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'pittaj', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'पित्त', note: 'Explicit dosha term found in doctor-verified field' },
  ],
  kapha: [
    { term: 'kapha', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'kaphaja', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'kaphaj', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'shlaishmika', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'kafa', note: 'Explicit dosha term found in doctor-verified field' },
    { term: 'कफ', note: 'Explicit dosha term found in doctor-verified field' },
  ],
}

// Well-established classical agni (digestive capacity) qualifiers, matched
// ONLY against the doctor's agni field.
const AGNI_QUALIFIERS: Record<DoshaKey, Marker[]> = {
  vata: [{ term: 'vishama', note: 'Vishama agni is classically associated with Vata' }],
  pitta: [{ term: 'tikshna', note: 'Tikshna agni is classically associated with Pitta' }],
  kapha: [
    { term: 'manda', note: 'Manda agni is classically associated with Kapha' },
    { term: 'मंद', note: 'Manda agni is classically associated with Kapha' },
  ],
}

// Well-established classical koshtha (bowel habit) qualifiers, matched ONLY
// against the doctor's koshtha field. Sama / madhyama (balanced) is not
// assigned to any dosha.
const KOSHTHA_QUALIFIERS: Record<DoshaKey, Marker[]> = {
  vata: [
    { term: 'krura', note: 'Krura koshtha is classically associated with Vata' },
    { term: 'krūra', note: 'Krura koshtha is classically associated with Vata' },
    { term: 'vibandha', note: 'Vibandha (constipation) is classically associated with Vata' },
  ],
  pitta: [
    { term: 'mridu', note: 'Mridu koshtha is classically associated with Pitta' },
    { term: 'mrudu', note: 'Mridu koshtha is classically associated with Pitta' },
    { term: 'मृदु', note: 'Mridu koshtha is classically associated with Pitta' },
  ],
  kapha: [],
}

const EXCERPT_LENGTH = 160

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Matches a single canonical term against value text. ASCII terms use
// word-boundary regex; non-ASCII (Devanagari) terms use a plain includes().
function termMatches(value: string, term: string): boolean {
  if (!value.length) return false
  const haystack = value.toLowerCase()
  const needle = term.toLowerCase()
  if (/^[\x00-\x7F]+$/.test(needle)) {
    return new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(value)
  }
  return haystack.includes(needle)
}

function isMeaningful(value: unknown): value is string {
  if (value === undefined || value === null) return false
  const text = String(value).trim()
  return text.length > 0
}

function excerpt(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ')
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text
}

function matchMarkers(field: string, value: unknown, markers: Marker[]): DoshicEvidence[] {
  if (!isMeaningful(value)) return []
  const text = String(value).trim()
  const found: DoshicEvidence[] = []
  for (const marker of markers) {
    if (!termMatches(text, marker.term)) continue
    found.push({
      field,
      fieldLabel: FIELD_LABELS[field] ?? field,
      matchedTerm: marker.term,
      value: excerpt(text),
      note: marker.note,
    })
  }
  return found
}

// Converts a Prisma AyushAssessment row into the pure input shape used by the
// rule engine. Handles nadiData stored as a JSON object.
export function buildInputFromAssessment(ayush: Record<string, unknown>): DoshicAssessmentInput {
  const input: DoshicAssessmentInput = {}
  const textFields: Array<keyof DoshicAssessmentInput> = [
    'prakriti',
    'vikriti',
    'sara',
    'samhanna',
    'pramana',
    'satmya',
    'sattva',
    'aharaShakti',
    'vyayamaShakti',
    'vaya',
    'aharaVihara',
    'agni',
    'koshtha',
    'nadi',
    'sleep',
    'note',
  ]
  for (const field of textFields) {
    const raw = ayush[field]
    if (raw !== undefined && raw !== null) input[field] = String(raw)
  }

  const rawNadi = ayush.nadiData
  if (rawNadi && typeof rawNadi === 'object' && !Array.isArray(rawNadi)) {
    const nadi = rawNadi as Record<string, unknown>
    const parsed: NadiData = {}
    if (nadi.rateBpm !== undefined && nadi.rateBpm !== null) {
      const n = Number(nadi.rateBpm)
      parsed.rateBpm = Number.isFinite(n) ? n : null
    }
    for (const key of ['rhythm', 'gati', 'quality', 'note'] as const) {
      const val = nadi[key]
      if (val !== undefined && val !== null) parsed[key] = String(val)
    }
    input.nadiData = parsed
  }

  return input
}

function doshaLabel(dosha: DoshaKey): string {
  return DOSHA_LABELS[dosha]
}

function aggregateDoshaEvidence(input: DoshicAssessmentInput, dosha: DoshaKey): DoshicEvidence[] {
  const evidence: DoshicEvidence[] = []

  // General text fields match explicit tridosha terms only.
  const generalFields: Array<keyof DoshicAssessmentInput> = [
    'prakriti',
    'vikriti',
    'sara',
    'samhanna',
    'pramana',
    'satmya',
    'sattva',
    'aharaShakti',
    'vyayamaShakti',
    'vaya',
    'aharaVihara',
    'nadi',
    'sleep',
    'note',
  ]
  for (const field of generalFields) {
    evidence.push(...matchMarkers(field, input[field], DOSHA_TERMS[dosha]))
  }

  // Field-scoped classical qualifiers.
  evidence.push(...matchMarkers('agni', input.agni, AGNI_QUALIFIERS[dosha]))
  evidence.push(...matchMarkers('koshtha', input.koshtha, KOSHTHA_QUALIFIERS[dosha]))

  // Structured nadi capture (doctor-side examination).
  const nadi = input.nadiData
  if (nadi && typeof nadi === 'object') {
    for (const key of ['rhythm', 'gati', 'quality', 'note'] as const) {
      evidence.push(...matchMarkers(`nadiData.${key}`, nadi[key], DOSHA_TERMS[dosha]))
    }
  }

  return evidence
}

// Runs the deterministic doshic decision-support evaluation. Pure function:
// called with a DoshicAssessmentInput, returns a stable result with
// provenance. Known unknowns / missing values never produce evidence.
export function assessDoshic(input: DoshicAssessmentInput): DoshicAssessmentResult {
  const doshas: DoshaResult[] = DOSHA_KEYS.map((dosha) => {
    const evidence = aggregateDoshaEvidence(input, dosha)
    return {
      dosha,
      suggested: evidence.length > 0,
      evidence,
    }
  })

  const suggested = doshas.filter((d) => d.suggested)

  const conclusion =
    suggested.length === 0
      ? 'No dominant dosha involvement is suggested by the doctor-verified assessment. ' +
        'No dosha has been assumed. This is decision support only — the doctor must determine ' +
        'any doshic relevance clinically, and must not assume a doshic imbalance exists.'
      : `Suggested doshic involvement based on doctor-verified assessment: ${suggested
          .map((d) => doshaLabel(d.dosha))
          .join(', ')}. This is decision support only and requires doctor verification. It is not a diagnosis.`

  return {
    version: 1,
    source: 'rule-based',
    decisionSupport: true,
    requiresDoctorReview: true,
    conclusion,
    doshas,
  }
}