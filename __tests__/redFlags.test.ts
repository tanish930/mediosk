import {
  detectRedFlag,
  detectRedFlagFromAnswers,
  checkEmergencyRedFlags,
} from '../src/lib/redFlags'
import type { AnsweredQuestion } from '../src/lib/adaptiveQuestioning'
import { DONT_KNOW_VALUE, PREFER_NOT_TO_ANSWER_VALUE } from '../src/lib/responseQualifiers'

describe('Red Flag Detection', () => {
  describe('detectRedFlag', () => {
    test('detects English emergency keywords', () => {
      expect(detectRedFlag('chest pain since morning')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY', matches: expect.arrayContaining(['chest pain']) })
      )
      expect(detectRedFlag('slurred speech and weakness')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY' })
      )
      expect(detectRedFlag('severe head injury')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY' })
      )
    })

    test('detects English urgent keywords', () => {
      expect(detectRedFlag('high fever for 3 days')).toEqual(
        expect.objectContaining({ severity: 'URGENT', matches: expect.arrayContaining(['high fever']) })
      )
      expect(detectRedFlag('severe abdominal pain')).toEqual(
        expect.objectContaining({ severity: 'URGENT' })
      )
    })

    test('returns NORMAL for non-red-flag text', () => {
      expect(detectRedFlag('mild cough')).toEqual(
        expect.objectContaining({ severity: 'NORMAL', matches: [] })
      )
      expect(detectRedFlag('')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
    })

    test('robustly handles negations in English', () => {
      expect(detectRedFlag('no chest pain')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
      expect(detectRedFlag('I do not have chest pain')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
      expect(detectRedFlag('there is no loss of consciousness')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
      // Negation inside a word should NOT count (e.g. "another" has "no")
      expect(detectRedFlag('another episode of chest pain')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY' })
      )
    })

    test('mixed negation does not mask a separate red flag in its own clause', () => {
      expect(detectRedFlag("I don't have chest pain, but I suddenly became breathless")).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY' })
      )
    })

    test('detects Hindi red-flag keywords', () => {
      expect(detectRedFlag('छाती में दर्द', 'hi')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY', matches: expect.arrayContaining(['छाती में दर्द']) })
      )
      expect(detectRedFlag('सीने में जकड़न', 'hi')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY' })
      )
      expect(detectRedFlag('अचानक सुन्नपन', 'hi')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY' })
      )
    })

    test('detects Hindi urgent keywords', () => {
      expect(detectRedFlag('तेज बुखार', 'hi')).toEqual(
        expect.objectContaining({ severity: 'URGENT', matches: expect.arrayContaining(['तेज बुखार']) })
      )
      expect(detectRedFlag('गंभीर पेट दर्द', 'hi')).toEqual(
        expect.objectContaining({ severity: 'URGENT' })
      )
    })

    test('handles Hindi negation properly', () => {
      expect(detectRedFlag('मुझे सीने में दर्द नहीं है', 'hi')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
      expect(detectRedFlag('छाती में दर्द ना है', 'hi')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
    })

    test('detects Marathi red-flag keywords', () => {
      expect(detectRedFlag('छातीत दुखणे', 'mr')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY', matches: expect.arrayContaining(['छातीत दुखणे']) })
      )
      expect(detectRedFlag('अचानक अशक्तपणा', 'mr')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY' })
      )
      expect(detectRedFlag('तीव्र ताप', 'mr')).toEqual(
        expect.objectContaining({ severity: 'URGENT' })
      )
    })

    test('handles Marathi negation properly', () => {
      expect(detectRedFlag('छातीत दुखणे नाही', 'mr')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
      expect(detectRedFlag('श्वास लागणे नको', 'mr')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
    })

    test('recognises transliterated Hindi/Marathi negations', () => {
      expect(detectRedFlag('chest pain nahi hai', 'hi')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
      expect(detectRedFlag('दुखणे nahi', 'mr')).toEqual(
        expect.objectContaining({ severity: 'NORMAL' })
      )
    })

    test('emergency severity takes priority over urgent', () => {
      expect(detectRedFlag('chest pain and high fever')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY' })
      )
    })

    test('collects multiple matched keywords', () => {
      const result = detectRedFlag('chest pain and severe bleeding')
      expect(result.severity).toBe('EMERGENCY')
      expect(result.matches.length).toBeGreaterThanOrEqual(2)
    })

    test('handles null/undefined text gracefully', () => {
      expect(detectRedFlag(null)).toEqual(
        expect.objectContaining({ severity: 'NORMAL', matches: [] })
      )
      expect(detectRedFlag(undefined)).toEqual(
        expect.objectContaining({ severity: 'NORMAL', matches: [] })
      )
    })
  })

  describe('detectRedFlagFromAnswers', () => {
    test('builds combined text from complaint and answers', () => {
      const answers: AnsweredQuestion[] = [
        { key: 'chief_complaint', value: 'chest pain' },
        { key: 'onset', value: 'yesterday' },
      ]
      expect(detectRedFlagFromAnswers(answers, 'chest pain')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY', matches: expect.arrayContaining(['chest pain']) })
      )
    })

    test('excludes skip/don\'t know responses from text', () => {
      const answers: AnsweredQuestion[] = [
        { key: 'weakness_numbness', value: DONT_KNOW_VALUE },
        { key: 'sputum', value: PREFER_NOT_TO_ANSWER_VALUE },
      ]
      expect(detectRedFlagFromAnswers(answers, 'mild cough')).toEqual(
        expect.objectContaining({ severity: 'NORMAL', matches: [] })
      )
    })

    test('uses provided language', () => {
      const answers: AnsweredQuestion[] = [
        { key: 'chief_complaint', value: 'सीने में जकड़न' },
      ]
      expect(detectRedFlagFromAnswers(answers, '', 'hi')).toEqual(
        expect.objectContaining({ severity: 'EMERGENCY' })
      )
    })
  })

  describe('checkEmergencyRedFlags', () => {
    test('returns true for EMERGENCY keyword matches', () => {
      expect(checkEmergencyRedFlags([{ key: 'chief_complaint', value: 'chest pain' }], 'chest pain')).toBe(true)
    })

    test('returns true for high severity score', () => {
      expect(checkEmergencyRedFlags([{ key: 'severity', value: 9 }], 'anything')).toBe(true)
      expect(checkEmergencyRedFlags([{ key: 'severity', value: 10 }], 'anything')).toBe(true)
    })

    test('returns false for severity below 9', () => {
      expect(checkEmergencyRedFlags([{ key: 'severity', value: 8 }], 'anything')).toBe(false)
    })

    test('returns false when emergency keyword is negated', () => {
      expect(checkEmergencyRedFlags([{ key: 'chief_complaint', value: 'no chest pain' }], 'anything')).toBe(false)
      expect(checkEmergencyRedFlags([{ key: 'chief_complaint', value: 'मुझे सीने में दर्द नहीं है' }], '', 'hi')).toBe(false)
    })

    test('skips "don\'t know" responses to avoid false positives', () => {
      expect(checkEmergencyRedFlags([{ key: 'weakness', value: DONT_KNOW_VALUE }], 'anything')).toBe(false)
    })

    test('preserves original 2-arg backward-compatible signature', () => {
      expect(checkEmergencyRedFlags([{ key: 'chief_complaint', value: 'chest pain' }], 'chest pain')).toBe(true)
      expect(checkEmergencyRedFlags([], 'mild headache')).toBe(false)
    })
  })
})