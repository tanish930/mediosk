import {
  assessDoshic,
  buildInputFromAssessment,
  DOSHA_LABELS,
  type DoshicAssessmentInput,
  type DoshicEvidence,
} from '../src/lib/doshicAssessment'

function evidenceFields(doshas: any[], dosha: string): string[] {
  return doshas.find((d) => d.dosha === dosha)?.evidence.map((e: DoshicEvidence) => e.field) ?? []
}

describe('assessDoshic — deterministic rule engine', () => {
  it('is deterministic and reports an empty result for a blank assessment', () => {
    const input: DoshicAssessmentInput = {}
    const first = assessDoshic(input)
    const second = assessDoshic(input)

    expect(first).toEqual(second)
    expect(first.decisionSupport).toBe(true)
    expect(first.requiresDoctorReview).toBe(true)
    expect(first.source).toBe('rule-based')
    expect(first.doshas).toHaveLength(3)
    for (const d of first.doshas) {
      expect(d.suggested).toBe(false)
      expect(d.evidence).toEqual([])
    }
    expect(first.conclusion).toContain('No dominant dosha involvement is suggested')
  })

  it('never turns missing / empty / whitespace values into findings', () => {
    const input: DoshicAssessmentInput = {
      prakriti: '',
      vikriti: '   ',
      agni: null,
      koshtha: undefined,
      note: '',
      sleep: '      ',
    }
    const result = assessDoshic(input)
    expect(result.doshas.every((d) => d.evidence.length === 0)).toBe(true)
  })

  it('never treats unknown / not-sure / skip patient phrases as evidence', () => {
    // "Not sure" is a patient skip qualifier; a doctor field carrying it must
    // not be converted into a positive finding either.
    const result = assessDoshic({
      vikriti: "I don't know / not sure",
      prakriti: "I don't know",
      note: "don't know",
    })
    expect(result.doshas.every((d) => d.suggested === false)).toBe(true)
  })

  it('matches explicit tridosha terms using word boundaries', () => {
    const result = assessDoshic({
      vikriti: 'Vata-Pitta imbalance',
      prakriti: 'predominantly Pitta',
    })
    expect(findDosha(result, 'vata').suggested).toBe(true)
    expect(findDosha(result, 'pitta').suggested).toBe(true)
    expect(findDosha(result, 'kapha').suggested).toBe(false)
  })

  it('does not substring-match unrelated words (e.g. "elevator" must not match vata)', () => {
    const result = assessDoshic({
      note: 'The patient works in an elevator maintenance lift',
      sleep: 'sleeps at noon',
    })
    expect(result.doshas.every((d) => d.suggested === false)).toBe(true)
  })

  it('matches Devanagari dosha terms', () => {
    const result = assessDoshic({ vikriti: 'वात और पित्त असंतुलन' })
    expect(findDosha(result, 'vata').suggested).toBe(true)
    expect(findDosha(result, 'pitta').suggested).toBe(true)
  })

  it('maps field-scoped classical agni qualifiers to the correct dosha', () => {
    const vishama = assessDoshic({ agni: 'Vishama agni' })
    expect(findDosha(vishama, 'vata').suggested).toBe(true)
    expect(findDosha(vishama, 'pitta').suggested).toBe(false)

    const tikshna = assessDoshic({ agni: 'tikshna agni' })
    expect(findDosha(tikshna, 'pitta').suggested).toBe(true)
    expect(findDosha(tikshna, 'vata').suggested).toBe(false)

    const manda = assessDoshic({ agni: 'manda agni' })
    expect(findDosha(manda, 'kapha').suggested).toBe(true)
  })

  it('maps field-scoped classical koshtha qualifiers to the correct dosha', () => {
    const krura = assessDoshic({ koshtha: 'krūra koshtha with vibandha' })
    expect(findDosha(krura, 'vata').suggested).toBe(true)
    expect(findDosha(krura, 'pitta').suggested).toBe(false)

    const mridu = assessDoshic({ koshtha: 'mridu koshtha' })
    expect(findDosha(mridu, 'pitta').suggested).toBe(true)

    // Sama / balanced koshtha never contributes to a dosha.
    const sama = assessDoshic({ koshtha: 'sama koshtha' })
    expect(sama.doshas.every((d) => d.suggested === false)).toBe(true)
  })

  it('records provenance evidence per field so the doctor can see why a rule fired', () => {
    const result = assessDoshic({
      agni: 'Manda agni',
      sleep: 'fitful, vata-type sleep',
    })
    const kapha = findDosha(result, 'kapha')
    expect(kapha.suggested).toBe(true)
    expect(kapha.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'agni', matchedTerm: 'manda' }),
      ])
    )
    expect(evidenceFields(result.doshas, 'vata')).toContain('sleep')
    for (const ev of [...kapha.evidence, ...findDosha(result, 'vata').evidence]) {
      expect(ev).toEqual(
        expect.objectContaining({
          field: expect.any(String),
          fieldLabel: expect.any(String),
          matchedTerm: expect.any(String),
          value: expect.any(String),
          note: expect.any(String),
        })
      )
    }
  })

  it('reads the structured Nadi capture for dosha terminology', () => {
    const result = assessDoshic({
      nadiData: { rateBpm: 72, gati: 'pitta nadi', quality: 'wiry, paittika' },
    })
    expect(findDosha(result, 'pitta').suggested).toBe(true)
    expect(evidenceFields(result.doshas, 'pitta')).toEqual(
      expect.arrayContaining(['nadiData.gati', 'nadiData.quality'])
    )
    // Numbers never contribute evidence.
    expect(evidenceFields(result.doshas, 'pitta')).not.toContain('nadiData.rateBpm')
  })

  it('labels the output clearly as decision support, not diagnosis', () => {
    const result = assessDoshic({ vikriti: 'Vata aggravation' })
    expect(result.conclusion).toContain('decision support')
    expect(result.conclusion).toContain('not a diagnosis')
  })
})

describe('buildInputFromAssessment', () => {
  it('converts a Prisma-style AyushAssessment row cleanly', () => {
    const input = buildInputFromAssessment({
      id: 'a-1',
      patientId: 'p-1',
      consultationId: 'c-1',
      doctorId: 'd-1',
      vikriti: '  Vata   ',
      sleep: 'broken sleep',
      nadiData: { rateBpm: 78, gati: 'vata nadi', note: 'thin' },
    })
    expect(input.vikriti).toBe('  Vata   ')
    expect(input.sleep).toBe('broken sleep')
    expect(input.nadiData).toEqual({ rateBpm: 78, gati: 'vata nadi', note: 'thin' })
  })

  it('ignores null / non-object nadiData', () => {
    expect(buildInputFromAssessment({ nadiData: null }).nadiData).toBeUndefined()
    expect(buildInputFromAssessment({ nadiData: 'text' }).nadiData).toBeUndefined()
  })
})

function findDosha(result: any, dosha: string) {
  const found = result.doshas.find((d: any) => d.dosha === dosha)
  if (!found) throw new Error(`missing dosha ${dosha}`)
  return found
}

// Ensures DOSHA_LABELS stays complete so UI labelling cannot drift.
describe('DOSHA_LABELS', () => {
  it('labels every supported dosha', () => {
    expect(DOSHA_LABELS.vata).toBe('Vata')
    expect(DOSHA_LABELS.pitta).toBe('Pitta')
    expect(DOSHA_LABELS.kapha).toBe('Kapha')
  })
})