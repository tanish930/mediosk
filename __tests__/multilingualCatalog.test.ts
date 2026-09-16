import {
  QUESTION_CATALOG,
  SECTION_LABELS,
  getQuestionText,
  type QuestionSection,
} from '../src/lib/multilingualQuestions'
import { AYURVEDA_QUESTION_KEYS } from '../src/lib/adaptiveQuestioning'
import type { LanguageCode } from '../src/lib/languages'

const LANGUAGES: LanguageCode[] = ['en', 'hi', 'mr']
const AYURVEDA_SECTIONS: QuestionSection[] = [
  'ayurveda_history',
  'ashtavidha',
  'dashavidha',
]
const AYURVEDA_GROUPS = ['AYURVEDA_HISTORY', 'TRIVIDHA', 'ASHTAVIDHA', 'DASHAVIDHA']

describe('Multilingual question catalog', () => {
  it('provides complete en/hi/mr text for every question', () => {
    for (const [key, entry] of Object.entries(QUESTION_CATALOG)) {
      for (const lang of LANGUAGES) {
        expect(entry.texts[lang]).toBeTruthy()
      }
    }
  })

  it('provides section labels for every supported section', () => {
    for (const [section, texts] of Object.entries(SECTION_LABELS)) {
      for (const lang of LANGUAGES) {
        expect(texts[lang]).toBeTruthy()
      }
    }
  })

  it('exposes every AYURVEDA engine key in the catalog', () => {
    for (const key of AYURVEDA_QUESTION_KEYS) {
      expect(QUESTION_CATALOG[key]).toBeDefined()
    }
  })

  it('marks every AYURVEDA question with a valid group and section', () => {
    for (const key of AYURVEDA_QUESTION_KEYS) {
      const entry = QUESTION_CATALOG[key]
      expect(AYURVEDA_GROUPS).toContain(entry.ayurvedaGroup)
      expect(AYURVEDA_SECTIONS).toContain(entry.section)
      // Patient questions must never be doctor-only examination groups.
      expect(entry.ayurvedaGroup).not.toBe('TRIVIDHA')
      // No hardcoded categorical option lists for PS-unspecified concepts.
      expect((entry as any).options).toBeUndefined()
    }
  })

  it('keeps doctor-only examination items out of the patient catalog', () => {
    for (const [key, entry] of Object.entries(QUESTION_CATALOG)) {
      if (entry.ayurvedaGroup) {
        expect(entry.ayurvedaGroup).not.toBe('TRIVIDHA')
      }
      expect(key).not.toMatch(/^ayush_(nadi|jihva|drika|shabda|sparsha|sara|samhanana|pramana)$/)
    }
  })

  it('only allows byMode variants for AYURVEDA', () => {
    for (const entry of Object.values(QUESTION_CATALOG)) {
      if (entry.byMode) {
        expect(Object.keys(entry.byMode)).toEqual(['AYURVEDA'])
      }
    }
  })

  it('builds translated text for AYURVEDA questions', () => {
    expect(getQuestionText('ayush_agni', 'hi')).toContain('भूख')
    expect(getQuestionText('ayush_koshtha', 'mr')).toContain('शौच')
    expect(getQuestionText('ayush_nidana', 'en')).toContain('caused or started')
  })

  it('uses byMode wording for shared keys when a mode is supplied', () => {
    const base = getQuestionText('chief_complaint', 'en')
    const ayurveda = getQuestionText('chief_complaint', 'en', null, 'AYURVEDA')
    expect(base).toBeTruthy()
    expect(ayurveda).toBeTruthy()
    expect(ayurveda).toContain('health concern')
  })

  it('ignores an unknown mode (falls back to default wording)', () => {
    expect(getQuestionText('chief_complaint', 'en', null, 'UNANI')).toBe(
      getQuestionText('chief_complaint', 'en')
    )
  })
})