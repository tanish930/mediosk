// Response qualifiers used by the pre-consultation interview.
//
// These distinguish answers where the patient genuinely does not know or
// prefers not to answer. Such answers are stored verbatim in the report (so
// the doctor sees them) but must never be treated as factual symptom input,
// and must never contribute to red-flag detection.

export const DONT_KNOW_VALUE = "I don't know"
export const PREFER_NOT_TO_ANSWER_VALUE = 'Prefer not to answer'

const DONT_KNOW_PHRASES = [
  "i don't know",
  "i dont know",
  "don't know",
  "dont know",
  "i do not know",
  "not sure",
  "no idea",
  "not known",
  "donno",
  "dunno",
  // Hindi
  'pata nahi',
  'nahi pata',
  'maloom nahi',
  'nahi maloom',
  'mujhe nahi pata',
  'मुझे नहीं पता',
  'नहीं पता',
  'मालूम नहीं',
  // Marathi
  'mahit nahi',
  'mala mahit nahi',
  'माहित नाही',
  'मला माहित नाही',
]

const PREFER_NOT_TO_ANSWER_PHRASES = [
  'prefer not to answer',
  'would rather not say',
  'rather not say',
  // Hindi
  'nahi batana',
  'nahi batana chahate',
  'जवाब नहीं देना चाहते',
  'नहीं बताना चाहते',
  'बताना नहीं चाहते',
  // Marathi
  'sangaychay nahi',
  'सांगायचं नाही',
  'सांगू इच्छित नाही',
  'जवाब द्यायचा नाही',
]

function normalize(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function isDontKnowResponse(value: unknown): boolean {
  const n = normalize(value)
  if (!n) return false
  return DONT_KNOW_PHRASES.some(p => n.includes(p))
}

export function isPreferNotToAnswer(value: unknown): boolean {
  const n = normalize(value)
  if (!n) return false
  return PREFER_NOT_TO_ANSWER_PHRASES.some(p => n.includes(p)) || n === 'skip'
}

// skip() is the union of the two: safe to ignore for clinical computation.
export function isSkipResponse(value: unknown): boolean {
  return isDontKnowResponse(value) || isPreferNotToAnswer(value)
}