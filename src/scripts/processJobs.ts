import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { runOCR } from '../lib/ocr'
import { extractMedicalData } from '../lib/llm'
import { assessAbnormalValue } from '../lib/abnormal'
import { Extraction } from '../lib/extract'

export const STALE_PROCESSING_MS = 10 * 60 * 1000

export const PROCESSING_FAILED_MESSAGE = 'Document processing failed'
export const OCR_PROCESSING_FAILED_MESSAGE = 'OCR processing failed'
export const EXTRACTION_FAILED_MESSAGE = 'Medical data extraction failed'
export const EMPTY_OCR_MESSAGE = 'OCR processing failed: no text was extracted from the document'

class ProcessingError extends Error {
  safeMessage: string
  constructor(safeMessage: string, detail?: string) {
    super(detail || safeMessage)
    this.safeMessage = safeMessage
  }
}

// Failure messages stored on jobs are intentionally safe and phase-based so a
// patient never sees secrets, storage credentials, or raw provider errors.
function safeError(err: any, fallback: string): string {
  if (err instanceof ProcessingError) return err.safeMessage
  return fallback
}

export function buildTimelineEntries(
  doc: { id: string; patientId: string },
  extracted: Extraction
): Prisma.MedicalTimelineCreateManyInput[] {
  const entries: Prisma.MedicalTimelineCreateManyInput[] = []

  if (extracted.diagnoses) {
    for (const diag of extracted.diagnoses) {
      entries.push({ patientId: doc.patientId, title: diag, details: 'AI/OCR Generated — diagnosis', entryType: 'DIAGNOSIS', date: new Date(), sourceDocumentId: doc.id })
    }
  }
  if (extracted.procedures) {
    for (const p of extracted.procedures) {
      entries.push({ patientId: doc.patientId, title: p.name, details: 'AI/OCR Generated — procedure', entryType: 'PROCEDURE', date: p.date ? new Date(p.date) : new Date(), sourceDocumentId: doc.id })
    }
  }
  if (extracted.investigations) {
    for (const inv of extracted.investigations) {
      const title = `${inv.name}${inv.value ? ': ' + inv.value + (inv.unit ? ' ' + inv.unit : '') : ''}`
      const abnormal = assessAbnormalValue(inv.value, inv.referenceRange)
      const statusDetails = abnormal.status === 'UNKNOWN'
        ? 'AI/OCR Generated — investigation'
        : `AI/OCR Generated — investigation — ${abnormal.status}`
      entries.push({ patientId: doc.patientId, title, details: statusDetails, entryType: 'INVESTIGATION', date: new Date(), sourceDocumentId: doc.id })
    }
  }
  if (extracted.medicines) {
    for (const m of extracted.medicines) {
      const title = m.name + (m.dosage ? ' ' + m.dosage : '')
      entries.push({ patientId: doc.patientId, title, details: 'AI/OCR Generated — medicine', entryType: 'MEDICINE', date: new Date(), sourceDocumentId: doc.id })
    }
  }

  return entries
}

export async function processOnce(): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS)
  const job = await prisma.documentProcessing.findFirst({
    where: {
      OR: [
        { status: 'PENDING' },
        // Reclaim jobs a crashed/restarted worker left in PROCESSING so they
        // cannot remain stuck forever.
        { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!job) return false

  if (job.status === 'PROCESSING') {
    const stale = new Date(job.updatedAt).getTime() < staleBefore.getTime()
    // A recently updated PROCESSING job is still being worked on elsewhere.
    if (!stale) return false
    await prisma.documentProcessing.update({ where: { id: job.id }, data: { status: 'FAILED', error: PROCESSING_FAILED_MESSAGE } })
    return true
  }

  // COMPLETED/FAILED jobs are never auto-reprocessed here; retries flow through
  // the explicit patient retry endpoint.
  if (job.status !== 'PENDING') return false

  try {
    await prisma.documentProcessing.update({ where: { id: job.id }, data: { status: 'PROCESSING' } })
    const doc = await prisma.medicalDocument.findUnique({ where: { id: job.documentId } })
    if (!doc) throw new ProcessingError(PROCESSING_FAILED_MESSAGE, `Document record not found for job ${job.id}`)

    let ocr: Awaited<ReturnType<typeof runOCR>>
    try {
      ocr = await runOCR(doc.url)
    } catch (err) {
      throw new ProcessingError(OCR_PROCESSING_FAILED_MESSAGE, String((err && (err as any).message) || err))
    }
    if (!ocr.text || !ocr.text.trim()) throw new ProcessingError(EMPTY_OCR_MESSAGE)

    let extracted: Extraction
    try {
      extracted = await extractMedicalData(ocr.text)
    } catch (err) {
      throw new ProcessingError(EXTRACTION_FAILED_MESSAGE, String((err && (err as any).message) || err))
    }

    const timeline = buildTimelineEntries(doc, extracted)

    // Replace (never append) this document's extraction and timeline records so
    // retrying/reprocessing cannot create duplicate clinical entries. Because
    // verification targets stable document/summary ids, doctor verification data
    // is preserved across reprocessing.
    const tx: any[] = [
      prisma.extractedMedicalData.deleteMany({ where: { documentId: doc.id } }),
      prisma.medicalTimeline.deleteMany({ where: { sourceDocumentId: doc.id } }),
      prisma.extractedMedicalData.create({ data: { documentId: doc.id, extracted } }),
    ]
    if (timeline.length) tx.push(prisma.medicalTimeline.createMany({ data: timeline }))
    await prisma.$transaction(tx)

    await prisma.documentProcessing.update({ where: { id: job.id }, data: { status: 'COMPLETED' } })
  } catch (err: any) {
    const errorField = safeError(err, PROCESSING_FAILED_MESSAGE)
    console.error('document processing job failed:', err)
    try {
      await prisma.documentProcessing.update({ where: { id: job.id }, data: { status: 'FAILED', error: errorField } })
    } catch (markErr: any) {
      console.error('document processing job: failed to mark job FAILED', markErr)
    }
  }
  return true
}

export async function run() {
  while (true) {
    const did = await processOnce()
    if (!did) {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

if (require.main === module) {
  run().catch((err) => { console.error(err); process.exit(1) })
}