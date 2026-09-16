import { mapAnswersToReport } from '../src/lib/reportMapping';

describe('mapAnswersToReport', () => {
  it('correctly maps all fields, including extended ones', () => {
    const answers = new Map<string, unknown>([
      ['onset', '2 days ago'],
      ['location', 'chest'],
      ['severity', 9],
      ['character', 'dry'],
      ['aggravating', { lying_down: true }],
      ['relieving', 'rest'],
      ['context', 'asthma'],
      ['associated_symptoms', { fever: true }]
    ]);
    const result = mapAnswersToReport(answers);
    expect(result).toEqual({
      onsetDuration: '2 days ago',
      location: 'chest',
      severity: '9',
      character: 'dry',
      aggravating: { lying_down: true },
      relieving: 'rest',
      relevantHistory: 'asthma',
      associated: { fever: true }
    });
  });

  it('handles backward compatibility where key might be null/missing', () => {
      // Mapping logic in the API handler now falls back to ID if key is null.
      // This test checks if mapAnswersToReport handles the keys we provide.
      const answers = new Map<string, unknown>([
          ['onset', '1 week'],
          ['random-id-123', 'some value']
      ]);
      const result = mapAnswersToReport(answers);
      expect(result.onsetDuration).toBe('1 week');
      // The function only extracts specific keys.
      expect(result.location).toBeUndefined();
  });
});

describe('mapAnswersToReport — AYURVEDA mode', () => {
  it('writes a versioned patient-reported ayush block in AYURVEDA mode', () => {
    const answers = new Map<string, unknown>([
      ['onset', '2 days'],
      ['ayush_nidana', 'ate stale food'],
      ['ayush_agni', 'poor appetite'],
      ['ayush_prakriti', 'my doctor told me I am Pitta'],
    ]);
    const result = mapAnswersToReport(answers, { mode: 'AYURVEDA' });

    expect(result.ayush).toEqual({
      version: 1,
      mode: 'AYURVEDA',
      findings: {
        nidana: 'ate stale food',
        agni: 'poor appetite',
        prakriti: { value: 'my doctor told me I am Pitta', source: 'patient-recall' },
      },
    });
  });

  it('records Not sure / Prefer not to answer without inventing values', () => {
    const answers = new Map<string, unknown>([
      ['ayush_koshtha', "I don't know"],
      ['ayush_mutra', 'Prefer not to answer'],
    ]);
    const result = mapAnswersToReport(answers, { mode: 'AYURVEDA' });

    expect(result.ayush).toEqual({
      version: 1,
      mode: 'AYURVEDA',
      findings: {
        koshtha: { notSure: true },
        mutra: { notSure: true },
      },
    });
  });

  it('never writes ayush for GENERAL or legacy sessions', () => {
    const answers = new Map<string, unknown>([['ayush_nidana', 'x'], ['onset', 'today']]);
    expect(mapAnswersToReport(answers, { mode: 'GENERAL' }).ayush).toBeUndefined();
    expect(mapAnswersToReport(answers).ayush).toBeUndefined();
  });

  it('includes only the AYURVEDA fields the patient actually answered', () => {
    const answers = new Map<string, unknown>([
      ['ayush_nidana', 'x'],
      ['ayush_mala', 'loose stools'],
    ]);
    const result = mapAnswersToReport(answers, { mode: 'AYURVEDA' });

    expect(result.ayush).toEqual({
      version: 1,
      mode: 'AYURVEDA',
      findings: { nidana: 'x', mala: 'loose stools' },
    });
  });

  it('never maps doctor-side examination fields into patient findings', () => {
    const answers = new Map<string, unknown>([
      ['ayush_nadi', 'wheezy'],
      ['ayush_sara', 'good'],
      ['ayush_nidana', 'stale food'],
    ]);
    const result = mapAnswersToReport(answers, { mode: 'AYURVEDA' });

    expect(result.ayush).toEqual({
      version: 1,
      mode: 'AYURVEDA',
      findings: { nidana: 'stale food' },
    });
  });
});
