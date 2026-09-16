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

// Consultation mode selects which interview flow the pre-consultation uses.
// Only these values are accepted when a consultation is created.
export const CONSULTATION_MODES = ['GENERAL', 'AYURVEDA'] as const
export type ConsultationMode = (typeof CONSULTATION_MODES)[number]
export const DEFAULT_CONSULTATION_MODE: ConsultationMode = 'GENERAL'

export function isValidConsultationMode(mode: unknown): mode is ConsultationMode {
  if (!mode) return false
  return (CONSULTATION_MODES as readonly string[]).includes(String(mode))
}