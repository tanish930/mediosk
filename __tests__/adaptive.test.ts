import { checkEmergencyRedFlags, getNextAdaptiveQuestion, AnsweredQuestion } from '../src/lib/adaptiveQuestioning'
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
