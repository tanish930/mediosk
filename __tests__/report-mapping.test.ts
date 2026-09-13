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
