import {
  DEMO_FORMULARY,
  matchDemoFormulations,
  type MatchedFormulation,
} from '../src/lib/demoFormulary'
import { assessDoshic, type DoshaResult } from '../src/lib/doshicAssessment'

function doshicResult(input: Record<string, string | null | undefined>): DoshaResult[] {
  return assessDoshic(input).doshas
}

describe('Demo formulary', () => {
  it('is curated, small and clearly labelled as demo-only', () => {
    expect(DEMO_FORMULARY.length).toBeGreaterThan(0)
    expect(DEMO_FORMULARY.length).toBeLessThanOrEqual(10)
    for (const entry of DEMO_FORMULARY) {
      expect(entry.demoOnly).toBe(true)
      expect(entry.id).toMatch(/^demo-/)
      expect(entry.targets.length).toBeGreaterThan(0)
      expect(entry.category).toBeTruthy()
      expect(entry.name).toBeTruthy()
    }
  })

  it('matches formulations deterministically from suggested doshas', () => {
    const doshas = doshicResult({ vikriti: 'Vata and Kapha imbalance' })
    const matches = matchDemoFormulations(doshas)

    expect(matches.length).toBeGreaterThan(0)
    // No duplicate formulary rows.
    const ids = new Set(matches.map((m: MatchedFormulation) => m.formulary.id))
    expect(ids.size).toBe(matches.length)
    for (const m of matches) {
      expect(m.matchedDoshas.length).toBeGreaterThan(0)
      expect(m.formulary.targets.some((t) => m.matchedDoshas.includes(t))).toBe(true)
      expect(m.rationale).toContain('requires doctor review')
      expect(m.rationale).toContain('not a prescription')
    }
  })

  it('produces no suggestions when no dosha is suggested', () => {
    const doshas = doshicResult({ agni: 'Sama agni', koshtha: 'sama koshtha' })
    expect(matchDemoFormulations(doshas)).toEqual([])
  })

  it('matches nothing when doshas carry no doctor-verified evidence', () => {
    // Even if a dosha happens to be flagged, zero evidence means the rule
    // engine never emits a suggestion from that surface.
    const noEvidence: DoshaResult[] = [
      { dosha: 'vata', suggested: true, evidence: [] },
      { dosha: 'pitta', suggested: false, evidence: [] },
      { dosha: 'kapha', suggested: false, evidence: [] },
    ]
    expect(matchDemoFormulations(noEvidence)).toEqual([])
  })

  it('outputs a rationale that names the matched doshas and evidence', () => {
    const doshas = doshicResult({ vikriti: 'Pitta imbalance' })
    const matches = matchDemoFormulations(doshas)
    expect(matches.length).toBeGreaterThan(0)
    for (const m of matches) {
      expect(m.matchedDoshas).toContain('pitta')
      expect(m.rationale).toContain('Pitta')
      expect(m.rationale).toContain('Decision support only')
    }
  })
})