import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  isValidLanguage,
  getLanguageLabel,
} from '../src/lib/languages'

describe('src/lib/languages', () => {
  test('exposes the default language as English', () => {
    expect(DEFAULT_LANGUAGE).toBe('en')
  })

  test('lists English, Marathi and Hindi initially', () => {
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(['en', 'mr', 'hi'])
    const labels = SUPPORTED_LANGUAGES.map((l) => l.label)
    expect(labels).toEqual(['English', 'Marathi', 'Hindi'])
  })

  test('every listed language is valid', () => {
    for (const l of SUPPORTED_LANGUAGES) {
      expect(isValidLanguage(l.code)).toBe(true)
    }
  })

  test('unsupported and empty values are rejected', () => {
    expect(isValidLanguage('fr')).toBe(false)
    expect(isValidLanguage('')).toBe(false)
    expect(isValidLanguage(null)).toBe(false)
    expect(isValidLanguage(undefined)).toBe(false)
    expect(isValidLanguage('ENGLISH')).toBe(false)
  })

  test('resolves language labels and returns null for unknown codes', () => {
    expect(getLanguageLabel('en')).toBe('English')
    expect(getLanguageLabel('mr')).toBe('Marathi')
    expect(getLanguageLabel('hi')).toBe('Hindi')
    expect(getLanguageLabel('xx')).toBeNull()
    expect(getLanguageLabel(null)).toBeNull()
  })
})