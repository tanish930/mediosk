import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { assessInvestigations } from '../../../../lib/abnormal'
import { assertDoctorCanAccessConsultation } from '../../../../lib/consultationAccess'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  const token = await getToken({
  req,
  secret: process.env.NEXTAUTH_SECRET,
})

if (!token) {
  return res.status(401).json({ error: 'Unauthorized' })
}

const userId = token.id as string
const role = token.role as string

if (role !== 'DOCTOR') {
  return res.status(403).json({ error: 'Forbidden' })
}

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

  const doctor = await prisma.doctor.findUnique({ where: { userId } })
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' })

  const consultation = await prisma.consultation.findUnique({ where: { id }, include: { patient: { include: { user: true, summaries: true, timelines: true } }, session: { include: { questions: { include: { answer: true } }, report: true } } } })

  if (!consultation) return res.status(404).json({ error: 'Consultation not found' })

  const allowed = await assertDoctorCanAccessConsultation({ consultation, doctorId: doctor.id })
  if (!allowed) return res.status(403).json({ error: 'Access denied' })

  // Gather AI/extracted items and latest summary
  const summaries = await prisma.medicalSummary.findMany({ where: { patientId: consultation.patientId }, orderBy: { createdAt: 'desc' }, take: 5 })
  const documents = consultation.sessionId
    ? await prisma.medicalDocument.findMany({ where: { patientId: consultation.patientId, preConsultationSessionId: consultation.sessionId }, include: { extractions: true } })
    : []

  // Enrich each document with structured abnormal-investigation flags so the
  // case sheet can show doctor-friendly value/range/status without inventing
  // data. Original extracted values and reference ranges are preserved.
  const documentsWithAbnormalities = documents.map((doc) => {
    const investigations = (doc.extractions ?? [])
      .filter((e: any) => e && typeof e.extracted === 'object' && e.extracted !== null)
      .flatMap((e: any) => (e.extracted as any)?.investigations ?? [])
    return { ...doc, abnormalities: assessInvestigations(investigations) }
  })

  const timelines = await prisma.medicalTimeline.findMany({ where: { patientId: consultation.patientId }, orderBy: { date: 'desc' } })

  // Existing verification records for this doctor on the displayed targets so
  // the case sheet can reflect current status and any saved notes.
  const verificationTargetIds = [
    consultation.session?.report?.id,
    ...summaries.map((s) => s.id),
    ...documents.map((d) => d.id),
  ].filter((t): t is string => Boolean(t))
  const verifications = verificationTargetIds.length
    ? await prisma.doctorVerification.findMany({ where: { doctorId: doctor.id, targetId: { in: verificationTargetIds } }, orderBy: { createdAt: 'asc' } })
    : []

  return res.json({ consultation, summaries, documents: documentsWithAbnormalities, timelines, verifications })
}
