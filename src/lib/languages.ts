export interface SupportedLanguage {
  code: string
  label: string
}

export type LanguageCode = 'en' | 'mr' | 'hi'

export const DEFAULT_LANGUAGE = 'en'

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'mr', label: 'Marathi' },
  { code: 'hi', label: 'Hindi' },
]

export function isValidLanguage(code: string | null | undefined): code is LanguageCode {
  if (!code) return false
  return SUPPORTED_LANGUAGES.some((l) => l.code === code)
}

export function getLanguageLabel(code: string | null | undefined): string | null {
  if (!code) return null
  const match = SUPPORTED_LANGUAGES.find((l) => l.code === code)
  return match ? match.label : null
}