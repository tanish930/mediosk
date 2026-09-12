import { z } from 'zod'
import { Extraction, ExtractionSchema, extractFromText } from './extract'

export const DoctorSummarySchema = z.object({
  chronologicalHistory: z.string(),
  majorDiagnoses: z.array(z.string()).optional(),
  medications: z.array(z.object({ name: z.string(), dosage: z.string().optional(), frequency: z.string().optional(), notes: z.string().optional() })).optional(),
  investigations: z.array(z.object({ name: z.string(), value: z.string().optional(), unit: z.string().optional(), referenceRange: z.string().optional() })).optional(),
  procedures: z.array(z.object({ name: z.string(), date: z.string().optional() })).optional(),
  importantFindings: z.array(z.string()).optional(),
  recentRelevant: z.string().optional(),
  sources: z.object({ documents: z.array(z.string()).optional(), timelineEntries: z.array(z.string()).optional() }).optional()
})

export type DoctorSummary = z.infer<typeof DoctorSummarySchema>

const PROVIDER = process.env.LLM_PROVIDER || 'openai'

export async function callOpenAISystem(messages: any[], timeoutMs = 30000, maxRetries = 2): Promise<string> {
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  if (!apiKey) throw new Error('LLM API key not configured (LLM_API_KEY)')

  const body = {
    model,
    messages,
    temperature: 0.0,
    max_tokens: 1500
  }

  let attempt = 0
  while (true) {
    attempt++
    const controller = new AbortController()
    const id = setTimeout(()=>controller.abort(), timeoutMs)
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(body), signal: controller.signal })
      clearTimeout(id)
      if (res.status === 429) {
        if (attempt > maxRetries) throw new Error('LLM rate limited')
        await new Promise(r=>setTimeout(r, 1000 * attempt))
        continue
      }
      if (!res.ok) throw new Error('LLM provider error: ' + await res.text())
      const j = await res.json()
      const msg = j.choices?.[0]?.message?.content
      return msg
    } catch (e:any) {
      clearTimeout(id)
      if (e.name === 'AbortError') {
        if (attempt > maxRetries) throw new Error('LLM request timed out')
        await new Promise(r=>setTimeout(r, 500 * attempt))
        continue
      }
      throw e
    }
  }
}

function extractJSON(str: string) {
  // naive JSON extraction: find first { and last }
  const first = str.indexOf('{')
  const last = str.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) throw new Error('No JSON object found in model output')
  const sub = str.slice(first, last+1)
  return JSON.parse(sub)
}

/**
 * Extracts structured medical data from OCR text using an LLM.
 * Implements strict source-grounding to prevent invented diagnoses or medicines.
 */
export async function extractMedicalDataLLM(ocrText: string): Promise<Extraction> {
  if (!ocrText || !ocrText.trim()) return {}

  if (PROVIDER === 'mock') {
    return {
      diagnoses: ['Mock Diagnosis'],
      medicines: [{ name: 'Mock Medicine', dosage: '10mg', frequency: 'daily' }],
      investigations: [{ name: 'Mock Blood Test', value: '12', unit: 'g/dL', referenceRange: '11-15' }],
      procedures: [{ name: 'Mock Surgery', date: '2026-09-12' }],
      findings: ['Mock clinical findings'],
      dates: ['2026-09-12']
    }
  }

  // Sensible truncation to protect LLM request (approx 3000 tokens)
  const MAX_OCR_TEXT_LENGTH = 12000
  const truncatedText = ocrText.length > MAX_OCR_TEXT_LENGTH
    ? ocrText.slice(0, MAX_OCR_TEXT_LENGTH) + '\n[OCR Text truncated...]'
    : ocrText

  const systemPrompt = `You are a strict clinical extraction assistant.
Extract structured medical information from the provided OCR text into a JSON object matching the requested schema.

CRITICAL INSTRUCTIONS FOR STRICT SOURCE-GROUNDING:
1. You MUST extract ONLY information explicitly present in the OCR text.
2. You MUST NOT invent, infer, extrapolate, or assume any diagnoses, medicines, dosages, lab values, procedures, clinical interpretations, or dates.
3. If an item is not explicitly and clearly in the text, DO NOT include it.
4. For example, if the OCR contains "BP 140/90", extract it as an investigation/vital measurement, but do NOT assume or invent the diagnosis "Hypertension" unless "Hypertension", "High blood pressure", or similar is explicitly mentioned.
5. If a medicine name is partially unreadable, do not confidently invent the missing name. Extract as-is or omit if unreadable.
6. If any field or array is empty or not found in the text, omit it or return an empty array.

Return ONLY a JSON object:
{
  "diagnoses": ["string"],
  "medicines": [{"name": "string", "dosage": "string", "frequency": "string"}],
  "investigations": [{"name": "string", "value": "string", "unit": "string", "referenceRange": "string"}],
  "procedures": [{"name": "string", "date": "string"}],
  "findings": ["string"],
  "dates": ["string"]
}`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `OCR Text:\n\n${truncatedText}` }
  ]

  const responseText = await callOpenAISystem(messages)
  const parsedJSON = extractJSON(responseText)
  return ExtractionSchema.parse(parsedJSON)
}

/**
 * Orchestrates medical extraction with LLM and falls back to regex-based extraction on failure.
 */
export async function extractMedicalData(text: string): Promise<Extraction> {
  try {
    return await extractMedicalDataLLM(text)
  } catch (err: any) {
    console.warn('LLM extraction failed, falling back to regex:', err?.message || err)
    return extractFromText(text)
  }
}

export async function generateSummaryPatientFriendly(extracted: Extraction, timeline: any[]): Promise<string> {
  if (PROVIDER === 'mock') {
    // existing conservative mock
    const parts: string[] = []
    parts.push('AI Generated — patient-friendly summary. Please verify with your doctor.')
    if ((extracted as any).diagnoses) parts.push('Diagnoses: ' + (extracted as any).diagnoses.join('; '))
    if ((extracted as any).medicines) parts.push('Medications: ' + (extracted as any).medicines.map((m:any)=>m.name + (m.dosage? ' '+m.dosage: '')).join('; '))
    if ((extracted as any).investigations) parts.push('Investigations: ' + (extracted as any).investigations.map((i:any)=>i.name + (i.value? ' '+i.value: '')).join('; '))
    if (timeline && timeline.length) parts.push('Recent timeline events: ' + timeline.slice(0,5).map(t=>t.title).join('; '))
    return parts.join('\n\n')
  }

  // call provider (OpenAI)
  const prompt = `You are an assistant that creates a concise, patient-friendly medical history summary using ONLY the information provided. Do NOT invent facts. Clearly mark the summary as "AI Generated — Doctor Verification Required". Provide a plain text paragraph, suitable for a patient to read.`
  const docsText = JSON.stringify(extracted)
  const timelineText = JSON.stringify(timeline || [])
  const messages = [
    { role: 'system', content: 'You must only summarize provided data. Do not add any new medical facts, dates, or diagnoses.' },
    { role: 'user', content: `${prompt}\n\nData:\n${docsText}\n\nTimeline:\n${timelineText}` }
  ]
  const out = await callOpenAISystem(messages)
  // return as-is but prefix required disclaimer
  return `AI Generated — Doctor Verification Required\n\n${out.trim()}`
}

export async function generateSummaryDoctor(extracted: Extraction, timeline: any[], sources:{documents?:string[], timelineEntries?:string[]}): Promise<DoctorSummary> {
  if (PROVIDER === 'mock') {
    const docHist = timeline.map((t:any)=>`${t.date ? new Date(t.date).toISOString().slice(0,10) : ''} - ${t.title}`).join('\n')
    const ds: DoctorSummary = {
      chronologicalHistory: docHist || 'No timeline entries available',
      majorDiagnoses: (extracted as any).diagnoses || undefined,
      medications: (extracted as any).medicines ? (extracted as any).medicines.map((m:any)=>({ name: m.name, dosage: m.dosage, frequency: m.frequency })) : undefined,
      investigations: (extracted as any).investigations || undefined,
      procedures: (extracted as any).procedures || undefined,
      importantFindings: (extracted as any).findings || undefined,
      recentRelevant: timeline && timeline.length ? timeline[0].title : undefined,
      sources: sources
    }
    return DoctorSummarySchema.parse(ds)
  }

  const system = 'You are a clinical summarization assistant. Using ONLY the provided extracted text and timeline entries, produce a JSON object matching the specified schema. Do NOT invent facts, dates, medications, or diagnoses. If information is uncertain or absent, return empty arrays or omit fields. Include a sources object listing document IDs and timeline entry IDs provided.'
  const user = `Provide the doctor-facing summary as JSON matching this Zod schema: ${DoctorSummarySchema.toString()}.\n\nExtracted Data:\n${JSON.stringify(extracted)}\n\nTimeline:\n${JSON.stringify(timeline)}\n\nSources:\n${JSON.stringify(sources)}`

  const messages = [ { role: 'system', content: system }, { role: 'user', content: user } ]
  const out = await callOpenAISystem(messages)
  try {
    const parsed = extractJSON(out)
    return DoctorSummarySchema.parse(parsed)
  } catch (e:any) {
    throw new Error('Malformed model output: ' + (e?.message || e))
  }
}
