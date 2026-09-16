import { isSkipResponse } from './responseQualifiers'

// Doctor-facing helper for rendering the patient-reported Ayurvedic history
// captured during an AYURVEDA-mode pre-consultation session.
//
// Patient-reported history (report.ayush.findings) is strictly separate from
// the Doctor Ayurvedic Assessment (AyushAssessment). This module only formats
// what the patient reported; it never invents or infers classification.

export interface PatientAyurvedicFinding {
  key: string
  label: string
  value: string
  notSure: boolean
}

export type AyurvedicGroupId =
  | 'AYURVEDA_HISTORY'
  | 'TRIVIDHA'
  | 'ASHTAVIDHA'
  | 'DASHAVIDHA'

export interface AyurvedicHistoryGroup {
  id: AyurvedicGroupId
  title: string
  findings: PatientAyurvedicFinding[]
}

export const AYURVEDA_FINDING_LABELS: Record<string, string> = {
  nidana: 'Nidana (reported cause)',
  agni: 'Agni (appetite / digestion)',
  koshtha: 'Koshtha (bowel habit)',
  aharaVihara: 'Ahara-Vihara (diet & lifestyle)',
  mala: 'Mala (stool)',
  mutra: 'Mutra (urine)',
  samprapti: 'Samprapti (development)',
  prakriti: 'Prakriti (recalled)',
  vikriti: 'Vikriti (recalled)',
  vaya: 'Vaya (age / vitality)',
  satmya: 'Satmya (habituation)',
  sattva: 'Sattva (sleep / mood / memory)',
  vyayamaShakti: 'Vyayama Shakti (exercise capacity)',
}

const GROUP_TITLES: Record<AyurvedicGroupId, string> = {
  AYURVEDA_HISTORY: 'Ayurvedic History (patient-reported)',
  TRIVIDHA: 'Trividha (observation — doctor-side)',
  ASHTAVIDHA: 'Ashtavidha (patient-reported)',
  DASHAVIDHA: 'Dashavidha (patient-reported)',
}

const GROUP_FIELDS: Record<AyurvedicGroupId, readonly string[]> = {
  AYURVEDA_HISTORY: ['nidana', 'agni', 'koshtha', 'aharaVihara', 'samprapti'],
  TRIVIDHA: [],
  ASHTAVIDHA: ['mala', 'mutra'],
  DASHAVIDHA: ['prakriti', 'vikriti', 'vaya', 'satmya', 'sattva', 'vyayamaShakti'],
}

function normalizeFinding(
  field: string,
  raw: unknown
): PatientAyurvedicFinding | null {
  if (raw === undefined || raw === null) return null
  const label = AYURVEDA_FINDING_LABELS[field] ?? field

  if (typeof raw === 'object') {
    const obj = raw as { notSure?: boolean; value?: unknown }
    if (obj.notSure === true) {
      return { key: field, label, value: '', notSure: true }
    }
    return {
      key: field,
      label,
      value: String(obj.value ?? ''),
      notSure: false,
    }
  }

  if (isSkipResponse(raw)) {
    return { key: field, label, value: '', notSure: true }
  }

  return { key: field, label, value: String(raw), notSure: false }
}

// Reduces a versioned report.ayush block into grouped, doctor-readable items.
// Returns an empty array for anything that is not a recognised versioned
// AYURVEDA patient-reported block.
export function groupPatientAyurvedicHistory(ayush: unknown): AyurvedicHistoryGroup[] {
  if (!ayush || typeof ayush !== 'object') return []
  const rec = ayush as { version?: number; mode?: string; findings?: Record<string, unknown> }
  if (rec.version !== 1 || rec.mode !== 'AYURVEDA') return []
  const findings = rec.findings && typeof rec.findings === 'object' ? rec.findings : {}

  const groups: AyurvedicHistoryGroup[] = []
  for (const id of Object.keys(GROUP_FIELDS) as AyurvedicGroupId[]) {
    const items: PatientAyurvedicFinding[] = []
    for (const field of GROUP_FIELDS[id]) {
      if (!(field in findings)) continue
      const item = normalizeFinding(field, findings[field])
      if (item) items.push(item)
    }
    if (items.length > 0) {
      groups.push({ id, title: GROUP_TITLES[id], findings: items })
    }
  }
  return groups
}