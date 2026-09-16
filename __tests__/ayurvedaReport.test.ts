import {
  groupPatientAyurvedicHistory,
  AYURVEDA_FINDING_LABELS,
} from '../src/lib/ayurvedaReport'

describe('groupPatientAyurvedicHistory', () => {
  it('groups patient-reported findings by Ayurvedic category', () => {
    const ayush = {
      version: 1,
      mode: 'AYURVEDA',
      findings: {
        nidana: 'ate stale food',
        agni: 'poor appetite',
        aharaVihara: 'irregular meals',
        mala: 'loose stools',
        mutra: 'clear',
        prakriti: { value: 'told I am Pitta', source: 'patient-recall' },
      },
    }

    const groups = groupPatientAyurvedicHistory(ayush)
    expect(groups.map((g) => g.id)).toEqual([
      'AYURVEDA_HISTORY',
      'ASHTAVIDHA',
      'DASHAVIDHA',
    ])

    const history = groups.find((g) => g.id === 'AYURVEDA_HISTORY')!
    expect(history.findings.map((f) => f.key)).toEqual([
      'nidana',
      'agni',
      'aharaVihara',
    ])
    expect(history.findings[0]).toMatchObject({
      label: AYURVEDA_FINDING_LABELS.nidana,
      value: 'ate stale food',
      notSure: false,
    })

    const dashavidha = groups.find((g) => g.id === 'DASHAVIDHA')!
    expect(dashavidha.findings[0]).toEqual({
      key: 'prakriti',
      label: AYURVEDA_FINDING_LABELS.prakriti,
      value: 'told I am Pitta',
      notSure: false,
    })
  })

  it('surfaces not-sure answers for the doctor', () => {
    const groups = groupPatientAyurvedicHistory({
      version: 1,
      mode: 'AYURVEDA',
      findings: { koshtha: { notSure: true } },
    })
    const koshtha = groups[0]?.findings[0]
    expect(koshtha).toMatchObject({ key: 'koshtha', value: '', notSure: true })
  })

  it('drops empty groups and unknown (doctor-side) fields', () => {
    const groups = groupPatientAyurvedicHistory({
      version: 1,
      mode: 'AYURVEDA',
      findings: { nadi: 'doctor-only', sara: 'doctor-only', mutra: 'clear' },
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe('ASHTAVIDHA')
    expect(groups[0].findings.map((f) => f.key)).toEqual(['mutra'])
  })

  it('rejects malformed / non-AYURVEDA payloads', () => {
    expect(groupPatientAyurvedicHistory(null)).toEqual([])
    expect(groupPatientAyurvedicHistory(undefined)).toEqual([])
    expect(groupPatientAyurvedicHistory('text')).toEqual([])
    expect(groupPatientAyurvedicHistory({ mode: 'GENERAL' })).toEqual([])
    expect(
      groupPatientAyurvedicHistory({ version: 2, mode: 'AYURVEDA', findings: {} })
    ).toEqual([])
  })

  it('never renders a Trividha (doctor-observation) block from patient data', () => {
    const groups = groupPatientAyurvedicHistory({
      version: 1,
      mode: 'AYURVEDA',
      findings: { nidana: 'x' },
    })
    expect(groups.some((g) => g.id === 'TRIVIDHA')).toBe(false)
  })
})