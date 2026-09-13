import { prisma } from '../lib/prisma'
import { runOCR } from '../lib/ocr'
import { extractMedicalData } from '../lib/llm'
import { assessAbnormalValue } from '../lib/abnormal'

async function processOnce() {
  const job = await prisma.documentProcessing.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } })
  if (!job) return false
  try {
    await prisma.documentProcessing.update({ where: { id: job.id }, data: { status: 'PROCESSING' } })
    const doc = await prisma.medicalDocument.findUnique({ where: { id: job.documentId } })
    if (!doc) throw new Error('Document not found')
    const ocr = await runOCR(doc.url)
    const extracted = await extractMedicalData(ocr.text || '')
    // store extraction
    await prisma.extractedMedicalData.create({ data: { documentId: doc.id, extracted } })

    // create timeline entries conservatively
    if (extracted.diagnoses) {
      for (const diag of extracted.diagnoses) {
        await prisma.medicalTimeline.create({ data: { patientId: doc.patientId, title: diag, details: 'AI/OCR Generated — diagnosis', entryType: 'DIAGNOSIS', date: new Date(), sourceDocumentId: doc.id } })
      }
    }
    if (extracted.procedures) {
      for (const p of extracted.procedures) {
        await prisma.medicalTimeline.create({ data: { patientId: doc.patientId, title: p.name, details: 'AI/OCR Generated — procedure', entryType: 'PROCEDURE', date: p.date? new Date(p.date): new Date(), sourceDocumentId: doc.id } })
      }
    }
    if (extracted.investigations) {
      for (const inv of extracted.investigations) {
        const title = `${inv.name}${inv.value? ': '+inv.value + (inv.unit? ' '+inv.unit : '') : ''}`
        const abnormal = assessAbnormalValue(inv.value, inv.referenceRange)
        const statusDetails = abnormal.status === 'UNKNOWN'
          ? 'AI/OCR Generated — investigation'
          : `AI/OCR Generated — investigation — ${abnormal.status}`

        await prisma.medicalTimeline.create({
          data: {
            patientId: doc.patientId,
            title,
            details: statusDetails,
            entryType: 'INVESTIGATION',
            date: new Date(),
            sourceDocumentId: doc.id
          }
        })
      }
    }
    if (extracted.medicines) {
      for (const m of extracted.medicines) {
        const title = m.name + (m.dosage? ' ' + m.dosage : '')
        await prisma.medicalTimeline.create({ data: { patientId: doc.patientId, title, details: 'AI/OCR Generated — medicine', entryType: 'MEDICINE', date: new Date(), sourceDocumentId: doc.id } })
      }
    }

    await prisma.documentProcessing.update({ where: { id: job.id }, data: { status: 'COMPLETED' } })
  } catch (err:any) {
    await prisma.documentProcessing.update({ where: { id: job.id }, data: { status: 'FAILED', error: String(err?.message || err) } })
  }
  return true
}

async function run() {
  while (true) {
    const did = await processOnce()
    if (!did) {
      await new Promise(r=>setTimeout(r, 3000))
    }
  }
}

run().catch(err=>{ console.error(err); process.exit(1) })
