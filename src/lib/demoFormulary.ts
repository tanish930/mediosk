// DEMO formulary — curated demonstration entries only.
//
// This is NOT a production formulary and MUST NOT be presented as one. The
// entries below are illustrative, clearly-labelled demos used to show the
// rule-based decision-support workflow. They are never suggested by an LLM
// and never form a prescription: matching is a pure rule against the
// doctor-verified doshic decision-support result, and every suggestion
// explicitly requires doctor review.

import type { DoshaKey, DoshaResult } from './doshicAssessment'

export interface DemoFormularyEntry {
  id: string
  name: string
  category: string
  demoOnly: true
  keywordsLabel: string
  targets: DoshaKey[]
}

export const DEMO_FORMULARY: readonly DemoFormularyEntry[] = [
  {
    id: 'demo-trikatu',
    name: 'Trikatu (demo)',
    category: 'Digestive support',
    demoOnly: true,
    keywordsLabel: 'Traditionally referenced for digestive and metabolic support.',
    targets: ['vata', 'kapha'],
  },
  {
    id: 'demo-triphala',
    name: 'Triphala (demo)',
    category: 'Bowel regularity support',
    demoOnly: true,
    keywordsLabel: 'Traditionally referenced for bowel regularity.',
    targets: ['vata', 'pitta'],
  },
  {
    id: 'demo-ashwagandha',
    name: 'Ashwagandha (demo)',
    category: 'Strength and rest support',
    demoOnly: true,
    keywordsLabel: 'Traditionally referenced for strength and restful sleep support.',
    targets: ['vata', 'kapha'],
  },
  {
    id: 'demo-shunthi',
    name: 'Shunthi / dry ginger (demo)',
    category: 'Digestive support',
    demoOnly: true,
    keywordsLabel: 'Traditionally referenced for digestive support.',
    targets: ['vata', 'kapha'],
  },
  {
    id: 'demo-amla',
    name: 'Amla (demo)',
    category: 'Rasayana support',
    demoOnly: true,
    keywordsLabel: 'Traditionally referenced in rasayana (rejuvenation) support.',
    targets: ['pitta', 'kapha'],
  },
  {
    id: 'demo-guggulu',
    name: 'Guggulu (demo)',
    category: 'Joint and metabolic support',
    demoOnly: true,
    keywordsLabel: 'Traditionally referenced for joint and metabolic support.',
    targets: ['vata'],
  },
  {
    id: 'demo-brahmi',
    name: 'Brahmi (demo)',
    category: 'Mental and memory support',
    demoOnly: true,
    keywordsLabel: 'Traditionally referenced for mental and memory support.',
    targets: ['vata', 'pitta'],
  },
]

export interface MatchedFormulation {
  formulary: DemoFormularyEntry
  matchedDoshas: DoshaKey[]
  rationale: string
}

// Rule-based matching: a demo formulation is matched when at least one of the
// doshas it targets is suggested by the doctor-verified doshic assessment.
// A dosha only counts when it carries recorded evidence — an empty or
// not-sure result never produces a suggestion. Returns a stable, deterministic
// list (one entry per formulary).
export function matchDemoFormulations(doshas: DoshaResult[]): MatchedFormulation[] {
  const suggested = new Set(
    doshas
      .filter((d) => d.suggested && d.evidence.length > 0)
      .map((d) => d.dosha)
  )
  if (suggested.size === 0) return []

  const matches: MatchedFormulation[] = []
  for (const entry of DEMO_FORMULARY) {
    const matched = entry.targets.filter((dosha) => suggested.has(dosha))
    if (matched.length === 0) continue

    const evidenceCount = doshas
      .filter((d) => matched.includes(d.dosha))
      .reduce((sum, d) => sum + d.evidence.length, 0)

    const rationale =
      `Matched because the doctor-verified assessment suggests involvement of ` +
      `${matched.map((d) => doshaLabel(d)).join(', ')} (${evidenceCount} matching finding(s)). ` +
      `Decision support only — requires doctor review. This is not a prescription.`

    matches.push({ formulary: entry, matchedDoshas: matched, rationale })
  }
  return matches
}

function doshaLabel(dosha: DoshaKey): string {
  switch (dosha) {
    case 'vata':
      return 'Vata'
    case 'pitta':
      return 'Pitta'
    case 'kapha':
      return 'Kapha'
  }
}