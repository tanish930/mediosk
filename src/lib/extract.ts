import { z } from 'zod'

export const MedicineSchema = z.object({
  name: z.string(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
})

export const InvestigationSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
  unit: z.string().optional(),
  referenceRange: z.string().optional(),
})

export const ProcedureSchema = z.object({
  name: z.string(),
  date: z.string().optional(),
})

export const ExtractionSchema = z.object({
  diagnoses: z.array(z.string()).optional(),
  medicines: z.array(MedicineSchema).optional(),
  investigations: z.array(InvestigationSchema).optional(),
  procedures: z.array(ProcedureSchema).optional(),
  findings: z.array(z.string()).optional(),
  dates: z.array(z.string()).optional(),
})

export type Extraction = z.infer<typeof ExtractionSchema>

const NON_MEDICINE_LINES = new Set([
  'demo medical laboratory report',
  'patient',
  'report date',
  'complete blood count',
  'complete blood count (cbc)',
  'investigation',
  'result',
  'unit',
  'reference range',
  'clinical note',
  'important',
])

const INVESTIGATION_HEADERS = new Set([
  'investigation',
  'result',
  'unit',
  'reference range',
])

const COMMON_UNITS = [
  'g/dL',
  'mg/dL',
  'mg',
  'g',
  'kg',
  'ml',
  'mL',
  'mcg',
  'mmol/L',
  'mIU/L',
  'IU/L',
  'cells/uL',
  'cells/µL',
  '%',
]

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeHeader(value: string): string {
  return cleanText(value).toLowerCase().replace(/[():]/g, '')
}

function isMedicalTableHeader(value: string): boolean {
  return INVESTIGATION_HEADERS.has(normalizeHeader(value))
}

function isNumeric(value: string): boolean {
  return /^[-+]?\d+(?:[.,]\d+)?$/.test(cleanText(value))
}

function isRange(value: string): boolean {
  return /^\s*[-+]?\d+(?:[.,]\d+)?\s*(?:-|–|—|to)\s*[-+]?\d+(?:[.,]\d+)?\s*$/i.test(
    cleanText(value),
  )
}

function isUnit(value: string): boolean {
  const normalized = cleanText(value).replace(/\s+/g, '')
  return COMMON_UNITS.some((unit) => unit.replace(/\s+/g, '').toLowerCase() === normalized.toLowerCase())
}

function parseDateValues(text: string): string[] {
  const dates: string[] = []

  const dateRx =
    /\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/gi

  for (const match of text.matchAll(dateRx)) {
    dates.push(match[0])
  }

  return [...new Set(dates)]
}

function parseReferenceRange(value: string): string | undefined {
  const cleaned = cleanText(value)

  if (isRange(cleaned)) {
    return cleaned.replace(/\s*(?:–|—)\s*/g, '-')
  }

  return undefined
}

function parseExplicitMedicines(lines: string[]): z.infer<typeof MedicineSchema>[] {
  const medicines: z.infer<typeof MedicineSchema>[] = []

  for (const rawLine of lines) {
    const line = cleanText(rawLine)

    if (!line) continue

    const match = line.match(
      /^(?:current\s+)?(?:medication|medications|medicine|medicines|drug|drugs|treatment)\s*:\s*(.+)$/i,
    )

    if (!match) continue

    const medicationText = cleanText(match[1])

    // Example:
    // Paracetamol 500 mg, as needed for fever.
    const dosageMatch = medicationText.match(
      /\b(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|mL|units?))\b/i,
    )

    const dosage = dosageMatch?.[1]

    const name = cleanText(
      medicationText
        .replace(dosageMatch?.[0] || '', '')
        .replace(/,\s*(?:as needed|prn).*$/i, '')
        .replace(/\s+/g, ' '),
    )

    if (!name || NON_MEDICINE_LINES.has(name.toLowerCase())) continue

    const frequencyMatch = medicationText.match(
      /\b(as needed|as required|once a day|twice a day|three times a day|daily|weekly|bd|tds|od|prn)\b.*$/i,
    )

    medicines.push({
      name,
      dosage,
      frequency: frequencyMatch?.[0]?.replace(/\.$/, '').trim(),
    })
  }

  return medicines
}

function parseExplicitDiagnoses(lines: string[]): string[] {
  const diagnoses: string[] = []

  for (const rawLine of lines) {
    const line = cleanText(rawLine)

    const match = line.match(
      /^(?:diagnosis|diagnoses|dx|diagnosed\s+with|impression)\s*:\s*(.+)$/i,
    )

    if (match) {
      const diagnosis = cleanText(match[1])
      if (diagnosis) diagnoses.push(diagnosis)
    }
  }

  return [...new Set(diagnoses)]
}

function parseProcedures(lines: string[]): z.infer<typeof ProcedureSchema>[] {
  const procedures: z.infer<typeof ProcedureSchema>[] = []

  for (const rawLine of lines) {
    const line = cleanText(rawLine)

    if (
      /^(?:procedure|operation|surgery)\s*:/i.test(line) ||
      /\b(?:appendectomy|cholecystectomy|bypass surgery)\b/i.test(line)
    ) {
      const name = cleanText(
        line.replace(/^(?:procedure|operation|surgery)\s*:\s*/i, ''),
      )

      if (name) {
        procedures.push({ name })
      }
    }
  }

  return procedures
}

function parseFindings(lines: string[]): string[] {
  const findings: string[] = []

  for (const rawLine of lines) {
    const line = cleanText(rawLine)

    const match = line.match(
      /^(?:clinical\s+note|finding|findings|remark|remarks|observation|observations)\s*:\s*(.+)$/i,
    )

    if (match) {
      const finding = cleanText(match[1])
      if (finding) findings.push(finding)
    }
  }

  return [...new Set(findings)]
}

/**
 * Handles OCR output where a laboratory table has been flattened vertically.
 *
 * Example OCR:
 *
 * Investigation
 * Result
 * Hemoglobin
 * 13.8
 * Total WBC Count
 * 7200
 * ...
 * Unit
 * g/dL
 * cells/uL
 * ...
 * Reference Range
 * 12.0-16.0
 * 4000-11000
 * ...
 */
function parseVerticalInvestigationTable(lines: string[]): z.infer<typeof InvestigationSchema>[] {
  const investigations: z.infer<typeof InvestigationSchema>[] = []

  const normalized = lines.map(cleanText).filter(Boolean)

  const investigationHeaderIndex = normalized.findIndex(
    (line) => normalizeHeader(line) === 'investigation',
  )

  const resultHeaderIndex = normalized.findIndex(
    (line, index) =>
      index > investigationHeaderIndex &&
      normalizeHeader(line) === 'result',
  )

  const unitHeaderIndex = normalized.findIndex(
    (line, index) =>
      index > resultHeaderIndex &&
      normalizeHeader(line) === 'unit',
  )

  const referenceHeaderIndex = normalized.findIndex(
    (line, index) =>
      index > unitHeaderIndex &&
      normalizeHeader(line) === 'reference range',
  )

  if (
    investigationHeaderIndex === -1 ||
    resultHeaderIndex === -1 ||
    unitHeaderIndex === -1 ||
    referenceHeaderIndex === -1
  ) {
    return investigations
  }

  const names = normalized
    .slice(resultHeaderIndex + 1, unitHeaderIndex)
    .filter((line) => {
      if (isNumeric(line)) return false
      if (isUnit(line)) return false
      if (isRange(line)) return false
      if (isMedicalTableHeader(line)) return false
      return true
    })

  const values = normalized
    .slice(resultHeaderIndex + 1, unitHeaderIndex)
    .filter(isNumeric)

  const units = normalized
    .slice(unitHeaderIndex + 1, referenceHeaderIndex)
    .filter(isUnit)

  const referenceRanges = normalized
    .slice(referenceHeaderIndex + 1)
    .filter(isRange)
    .map((value) => parseReferenceRange(value))
    .filter((value): value is string => Boolean(value))

  const rowCount = Math.min(
    names.length,
    values.length,
    units.length,
    referenceRanges.length,
  )

  for (let i = 0; i < rowCount; i += 1) {
    const name = cleanText(names[i])

    if (!name || NON_MEDICINE_LINES.has(name.toLowerCase())) {
      continue
    }

    investigations.push({
      name,
      value: cleanText(values[i]),
      unit: cleanText(units[i]),
      referenceRange: referenceRanges[i],
    })
  }

  return investigations
}

/**
 * Handles simpler OCR output where the investigation is on one line.
 *
 * Examples:
 * Hemoglobin: 13.8 g/dL
 * Fasting Blood Glucose 108 mg/dL
 */
function parseInlineInvestigations(lines: string[]): z.infer<typeof InvestigationSchema>[] {
  const investigations: z.infer<typeof InvestigationSchema>[] = []

  for (const rawLine of lines) {
    const line = cleanText(rawLine)

    if (!line || isMedicalTableHeader(line)) continue

    const match = line.match(
      /^(.+?)\s*:?\s*([-+]?\d+(?:[.,]\d+)?)\s*(g\/dL|mg\/dL|mg|g|kg|ml|mL|mcg|mmol\/L|mIU\/L|IU\/L|cells\/uL|cells\/µL|%)?(?:\s+(\d+(?:[.,]\d+)?\s*(?:-|–|—|to)\s*\d+(?:[.,]\d+)?))?$/i,
    )

    if (!match) continue

    const name = cleanText(match[1])
    const value = cleanText(match[2])
    const unit = match[3]
    const referenceRange = match[4]
      ? parseReferenceRange(match[4])
      : undefined

    if (
      !name ||
      NON_MEDICINE_LINES.has(name.toLowerCase()) ||
      !value
    ) {
      continue
    }

    investigations.push({
      name,
      value,
      unit,
      referenceRange,
    })
  }

  return investigations
}

export function extractFromText(text: string): Extraction {
  if (!text || !text.trim()) {
    return {}
  }

  const lines = text
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean)

  const diagnoses = parseExplicitDiagnoses(lines)
  const medicines = parseExplicitMedicines(lines)
  const procedures = parseProcedures(lines)
  const findings = parseFindings(lines)
  const dates = parseDateValues(text)

  const verticalInvestigations = parseVerticalInvestigationTable(lines)

  const investigations =
    verticalInvestigations.length > 0
      ? verticalInvestigations
      : parseInlineInvestigations(lines)

  const result: Extraction = {
    ...(diagnoses.length ? { diagnoses } : {}),
    ...(medicines.length ? { medicines } : {}),
    ...(investigations.length ? { investigations } : {}),
    ...(procedures.length ? { procedures } : {}),
    ...(findings.length ? { findings } : {}),
    ...(dates.length ? { dates } : {}),
  }

  return ExtractionSchema.parse(result)
}