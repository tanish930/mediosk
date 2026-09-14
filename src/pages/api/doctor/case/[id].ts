import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'

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

  // Access control: allow if assigned to doctor or patient consent granted to this doctor
  const assigned = consultation.doctorId === doctor.id
  const consent = await prisma.consent.findFirst({ where: { patientId: consultation.patientId, granteeDoctorId: doctor.id }, orderBy: { createdAt: 'desc' } })
  if (!assigned && !(consent && consent.granted === true)) return res.status(403).json({ error: 'Access denied' })

  // Gather AI/extracted items and latest summary
  const summaries = await prisma.medicalSummary.findMany({ where: { patientId: consultation.patientId }, orderBy: { createdAt: 'desc' }, take: 5 })
  const documents = consultation.sessionId
    ? await prisma.medicalDocument.findMany({ where: { patientId: consultation.patientId, preConsultationSessionId: consultation.sessionId }, include: { extractions: true } })
    : []
  const timelines = await prisma.medicalTimeline.findMany({ where: { patientId: consultation.patientId }, orderBy: { date: 'desc' } })

  return res.json({ consultation, summaries, documents, timelines })
}
