import { checkEmergencyRedFlags, getNextAdaptiveQuestion, AnsweredQuestion, AYURVEDA_QUESTION_KEYS } from '../src/lib/adaptiveQuestioning'
import { QuestionType } from '@prisma/client'

describe('Adaptive Questioning Engine', () => {
  const complaint = 'Stomach pain'
  const domain = 'gastrointestinal'

  test('should detect emergency red flags', () => {
    const answers: AnsweredQuestion[] = [{ key: 'chief_complaint', value: 'I have severe chest pain' }]
    expect(checkEmergencyRedFlags(answers, complaint)).toBe(true)
  })

  test('should detect high severity as emergency', () => {
    const answers: AnsweredQuestion[] = [{ key: 'severity', value: 9 }]
    expect(checkEmergencyRedFlags(answers, complaint)).toBe(true)
  })

  test('should return null if emergency detected', () => {
    const answers: AnsweredQuestion[] = [{ key: 'severity', value: 10 }]
    expect(getNextAdaptiveQuestion(domain, answers, complaint)).toBeNull()
  })

  test('should select correct follow-up questions', () => {
    const answers: AnsweredQuestion[] = [
      { key: 'chief_complaint', value: 'stomach pain' },
      { key: 'onset', value: 'yesterday' }
    ]
    const nextQ = getNextAdaptiveQuestion(domain, answers, complaint)
    expect(nextQ).toBeDefined()
    expect(nextQ?.key).toBe('duration')
  })

  test('should not ask duplicate questions', () => {
    const answers: AnsweredQuestion[] = [
      { key: 'chief_complaint', value: 'pain' },
      { key: 'onset', value: 'yesterday' },
      { key: 'duration', value: '2 hours' },
      { key: 'location', value: 'upper abdomen' },
      { key: 'severity', value: 5 },
      { key: 'character', value: 'sharp' }
    ]
    // After character, it should go to associated symptoms
    const nextQ = getNextAdaptiveQuestion(domain, answers, complaint)
    expect(nextQ?.key).toBe('nausea_vomiting')
  })

  test('should fallback to general questions for unknown domain', () => {
    const answers: AnsweredQuestion[] = [{ key: 'chief_complaint', value: 'feeling weird' }]
    const nextQ = getNextAdaptiveQuestion('unknown', answers, 'feeling weird')
    expect(nextQ?.key).toBe('onset')
  })
})

describe('AYURVEDA mode sequencing', () => {
  // Walks the questionnaire to the end using "skip" as the value for every
  // newly asked question, collecting the keys in order.
  function sequenceKeys(answers: AnsweredQuestion[], domain: string, complaint: string, mode?: string | null): string[] {
    const keys: string[] = []
    let current = answers
    for (let i = 0; i < 80; i++) {
      const next = getNextAdaptiveQuestion(domain, current, complaint, 'en', mode)
      if (!next) break
      keys.push(next.key)
      current = [...current, { key: next.key, value: 'skip' }]
    }
    return keys
  }

  test('AYURVEDA mode asks the full AYURVEDA baseline exactly once after the general core', () => {
    const keys = sequenceKeys([], 'respiratory', 'Cough', 'AYURVEDA')

    for (const k of AYURVEDA_QUESTION_KEYS) {
      if (k === 'ayush_mala' || k === 'ayush_mutra') continue // gastro-only
      expect(keys).toContain(k)
    }
    for (const k of AYURVEDA_QUESTION_KEYS) {
      if (k === 'ayush_mala' || k === 'ayush_mutra') continue // gastro-only
      expect(keys.filter((x) => x === k)).toHaveLength(1)
    }

    // The unchanged general core is still present, in the same order.
    expect(keys[0]).toBe('chief_complaint')
    const generalOrder = ['onset', 'duration', 'location', 'severity', 'character', 'past_medical_history', 'review_of_systems']
    const positions = generalOrder.map((k) => keys.indexOf(k))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  test('GENERAL and default modes never ask AYURVEDA questions (byte-for-byte regression)', () => {
    const general = sequenceKeys([], 'respiratory', 'Cough', 'GENERAL')
    const defaults = sequenceKeys([], 'respiratory', 'Cough')

    expect(defaults).toEqual(general)
    for (const k of AYURVEDA_QUESTION_KEYS) {
      expect(general).not.toContain(k)
    }
  })

  test('mala and mutra only appear in gastrointestinal AYURVEDA sessions', () => {
    const gastro = sequenceKeys([], 'gastrointestinal', 'Stomach pain', 'AYURVEDA')
    expect(gastro).toContain('ayush_mala')
    expect(gastro).toContain('ayush_mutra')

    const resp = sequenceKeys([], 'respiratory', 'Cough', 'AYURVEDA')
    expect(resp).not.toContain('ayush_mala')
    expect(resp).not.toContain('ayush_mutra')
  })

  test('AYURVEDA baseline begins only after the general core is complete', () => {
    const complaint = 'Cough'
    const domain = 'respiratory'
    const core = [
      { key: 'chief_complaint', value: 'Cough' },
      { key: 'onset', value: '5 days' },
      { key: 'duration', value: '5 days' },
      { key: 'location', value: 'chest' },
      { key: 'severity', value: 4 },
      { key: 'character', value: 'dry' },
      { key: 'fever', value: false },
      { key: 'sputum', value: false },
      { key: 'associated_symptoms', value: 'none' },
      { key: 'aggravating', value: 'cold air' },
      { key: 'relieving', value: 'rest' },
    ]
    expect(getNextAdaptiveQuestion(domain, core, complaint, 'en', 'AYURVEDA')?.key).toBe('ayush_nidana')
    expect(getNextAdaptiveQuestion(domain, core, complaint, 'en')?.key).toBe('past_medical_history')
    expect(getNextAdaptiveQuestion(domain, core, complaint, 'en', 'GENERAL')?.key).toBe('past_medical_history')
  })

  test('AYURVEDA mode still halts on emergency red flags', () => {
    const answers: AnsweredQuestion[] = [{ key: 'severity', value: 10 }]
    expect(getNextAdaptiveQuestion('general', answers, 'pain', 'en', 'AYURVEDA')).toBeNull()
  })
})
