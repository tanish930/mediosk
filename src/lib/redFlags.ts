import { isValidLanguage } from './languages'
import { isSkipResponse } from './responseQualifiers'
import type { LanguageCode } from './languages'
import type { AnsweredQuestion } from './adaptiveQuestioning'

export type RedFlagSeverity = 'EMERGENCY' | 'URGENT' | 'NORMAL'

export interface RedFlagResult {
  severity: RedFlagSeverity
  matches: string[]
}

// Deterministic, rule-based red-flag keywords per language. English is the
// base set; Hindi and Marathi cover the common colloquial phrasings used in
// the multilingual interview. AI output is never required for the red-flag
// gate — these rules run before any report is generated.
const EMERGENCY_KEYWORDS: Record<LanguageCode, string[]> = {
  en: [
    'chest pain',
    'shortness of breath',
    'breathless',
    'unconscious',
    'loss of consciousness',
    'severe bleeding',
    'heavy bleeding',
    'severe head injury',
    'sudden weakness',
    'sudden numbness',
    'slurred speech',
  ],
  hi: [
    'सीने में दर्द',
    'छाती में दर्द',
    'सीने में जकड़न',
    'सांस फूलना',
    'साँस फूलना',
    'सांस लेने में तकलीफ',
    'दम घुटना',
    'बेहोश',
    'बेहोशी',
    'होश खो देना',
    'होश खो बैठ',
    'भारी रक्तस्राव',
    'ज्यादा खून बहना',
    'अत्यधिक रक्तस्राव',
    'गंभीर सिर की चोट',
    'सिर पर गंभीर चोट',
    'अचानक कमजोरी',
    'अचानक सुन्नपन',
    'अस्पष्ट बोलना',
    'बोलने में परेशानी',
  ],
  mr: [
    'छातीत दुखणे',
    'छातीत दुखत',
    'छातीत जडपणा',
    'श्वास लागणे',
    'श्वास घेण्यास त्रास',
    'बेशुद्ध',
    'बेशुद्धी',
    'भान गमावणे',
    'भान हरपणे',
    'भारी रक्तस्राव',
    'जास्त रक्तस्त्राव',
    'गंभीर डोक्याला दुखापत',
    'डोक्याला जबरदस्त दुखापत',
    'अचानक अशक्तपणा',
    'शरीराच्या एका बाजूची कमकुवतपणा',
    'अचानक सुन्नपणा',
    'अस्पष्ट बोलणे',
  ],
}

const URGENT_KEYWORDS: Record<LanguageCode, string[]> = {
  en: [
    'high fever',
    'very high fever',
    'inability to breathe',
    'fainting',
    'near fainting',
    'severe abdominal pain',
    'severe headache',
  ],
  hi: [
    'तेज बुखार',
    'बहुत तेज बुखार',
    'तेज़ बुखार',
    'सांस रुकना',
    'लगभग बेहोश',
    'गंभीर पेट दर्द',
    'तेज सिरदर्द',
    'तेज़ सिरदर्द',
  ],
  mr: [
    'तीव्र ताप',
    'खूप तीव्र ताप',
    'श्वास थांबणे',
    'मूर्छा',
    'तीव्र पोटदुखी',
    'तीव्र डोकेदुखी',
  ],
}

// Negation tokens per language (own language + English are combined when
// scanning, because patients often mix languages in a free-text answer).
const NEGATION_TOKENS: Record<LanguageCode, string[]> = {
  en: [
    'no',
    'not',
    'none',
    'without',
    'never',
    "don't",
    "doesn't",
    "didn't",
    "haven't",
    "hasn't",
    'dont',
    'doesnt',
    'didnt',
    'no longer',
  ],
  hi: ['नहीं', 'नही', 'ना', 'कोई नहीं', 'बिल्कुल नहीं', 'nahi', 'nahin', 'nhi'],
  mr: ['नाही', 'ना', 'नको', 'नका', 'nahi', 'nahin'],
}

const NEGATION_WINDOW_BEFORE = 48
const NEGATION_WINDOW_AFTER = 32

// A negation only applies within the same clause. These punctuation marks and
// contrastive conjunctions mark a boundary, so a negated earlier clause
// ("I don't have chest pain,") cannot suppress a red flag in a later one
// (", but I suddenly became breathless").
const CLAUSE_SEPARATORS = [',', ';', '.', ':', '(', ')']
const CLAUSE_WORDS = ['but', 'yet', 'although', 'though', 'however', 'while', 'whereas']

// Index just after the last clause boundary before `position` (0 when none).
function clauseStartFor(text: string, position: number): number {
  let start = 0
  for (const sep of CLAUSE_SEPARATORS) {
    const idx = text.lastIndexOf(sep, position - 1)
    if (idx >= start) start = idx + 1
  }
  for (const w of CLAUSE_WORDS) {
    let idx = text.lastIndexOf(w, position - w.length)
    while (idx !== -1) {
      if (hasBoundaries(text, idx, idx + w.length)) {
        if (idx + w.length > start) start = idx + w.length
        break
      }
      idx = text.lastIndexOf(w, idx - 1)
    }
  }
  return start
}

const DEVANAGARI = /[\u0900-\u097F]/

function isWordChar(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c) || DEVANAGARI.test(c)
}

function normalizeText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function hasBoundaries(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : undefined
  const after = end < text.length ? text[end] : undefined
  if (before !== undefined && isWordChar(before)) return false
  if (after !== undefined && isWordChar(after)) return false
  return true
}

function collectTokenPositions(text: string, tokens: string[]): number[] {
  const positions: number[] = []
  for (const rawToken of tokens) {
    const token = rawToken.toLowerCase()
    if (!token) continue
    let idx = text.indexOf(token)
    while (idx !== -1) {
      if (hasBoundaries(text, idx, idx + token.length)) positions.push(idx)
      idx = text.indexOf(token, idx + token.length)
    }
  }
  return positions
}

function findKeywordPositions(text: string, keyword: string): number[] {
  const k = keyword.toLowerCase()
  const positions: number[] = []
  let idx = text.indexOf(k)
  while (idx !== -1) {
    if (hasBoundaries(text, idx, idx + k.length)) positions.push(idx)
    idx = text.indexOf(k, idx + k.length)
  }
  return positions
}

function isNegatedOccurrence(
  negPositions: number[],
  kwStart: number,
  kwEnd: number,
  clauseStart: number
): boolean {
  for (const neg of negPositions) {
    // Negations in an earlier clause cannot negate this keyword.
    if (neg < clauseStart) continue
    if (
      neg >= kwStart - NEGATION_WINDOW_BEFORE &&
      neg <= kwEnd + NEGATION_WINDOW_AFTER
    ) {
      return true
    }
  }
  return false
}

function resolveLanguage(lang?: string | null): LanguageCode {
  return isValidLanguage(lang) ? (lang as LanguageCode) : 'en'
}

// Detect red-flag keywords in a single combined text (already known to be a
// complaint or symptom description). Returns the worst severity found plus
// the list of matched keywords.
export function detectRedFlag(
  text: unknown,
  lang?: string | null
): RedFlagResult {
  const l = resolveLanguage(lang)
  const normalized = normalizeText(text)
  if (!normalized) return { severity: 'NORMAL', matches: [] }

  const negTokens = [...new Set([...NEGATION_TOKENS.en, ...NEGATION_TOKENS[l]])]
  const negPositions = collectTokenPositions(normalized, negTokens)

  const matches: string[] = []

  const emergencyKeys = [...new Set([...EMERGENCY_KEYWORDS[l], ...EMERGENCY_KEYWORDS.en])]
  for (const kw of emergencyKeys) {
    for (const pos of findKeywordPositions(normalized, kw)) {
      if (!isNegatedOccurrence(negPositions, pos, pos + kw.length, clauseStartFor(normalized, pos))) {
        matches.push(kw)
      }
    }
  }
  if (matches.length > 0) return { severity: 'EMERGENCY', matches }

  const urgentKeys = [...new Set([...URGENT_KEYWORDS[l], ...URGENT_KEYWORDS.en])]
  for (const kw of urgentKeys) {
    for (const pos of findKeywordPositions(normalized, kw)) {
      if (!isNegatedOccurrence(negPositions, pos, pos + kw.length, clauseStartFor(normalized, pos))) {
        matches.push(kw)
      }
    }
  }
  if (matches.length > 0) return { severity: 'URGENT', matches }

  return { severity: 'NORMAL', matches: [] }
}

// Red-flag detection over a collection of answered questions. Values that are
// "I don't know" / "Prefer not to answer" are excluded so they can never
// raise a false alarm or produce a phantom keyword match.
export function detectRedFlagFromAnswers(
  answers: AnsweredQuestion[],
  complaint: unknown,
  lang?: string | null
): RedFlagResult {
  const parts: unknown[] = []
  if (complaint !== undefined && complaint !== null) parts.push(complaint)
  for (const a of answers) {
    if (a.value === undefined || a.value === null) continue
    if (isSkipResponse(a.value)) continue
    parts.push(a.value)
  }
  return detectRedFlag(parts.join(' '), lang)
}

// Backwards-compatible helper used by the adaptive questioning engine and
// callers that only need a boolean answer (true = EMERGENCY). The numeric
// severity gate (>= 9) is intentionally kept here so existing behaviour is
// preserved exactly.
export function checkEmergencyRedFlags(
  answers: AnsweredQuestion[],
  complaint: string,
  lang?: string | null
): boolean {
  if (detectRedFlagFromAnswers(answers, complaint, lang).severity === 'EMERGENCY') {
    return true
  }
  const severityAnswer = answers.find(a => a.key === 'severity')
  if (severityAnswer) {
    const sevNum = Number(severityAnswer.value)
    if (!Number.isNaN(sevNum) && sevNum >= 9) return true
  }
  return false
}