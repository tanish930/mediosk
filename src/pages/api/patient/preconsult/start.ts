import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { detectDomainFromComplaint } from '../../../../lib/domain'
import { getNextAdaptiveQuestion } from '../../../../lib/adaptiveQuestioning'
import { z } from 'zod'

const BodySchema = z.object({ complaint: z.string().min(3) })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const token = await getToken({
  req,
  secret: process.env.NEXTAUTH_SECRET
})

if (!token) {
  return res.status(401).json({ error: 'Unauthorized' })
}

const userId = token.id as string

if (!userId) {
  return res.status(401).json({ error: 'Unauthorized: missing user id' })
}

if (token.role !== 'PATIENT') {
  return res.status(403).json({ error: 'Forbidden' })
}

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors })
  const { complaint } = parsed.data

  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  // Business rule: do not allow a patient to start a new consultation while a
  // live consultation is already in progress. Enforced server-side, not on the
  // frontend. Completed, cancelled, or scheduled consultations do not block.
  const activeConsultation = await prisma.consultation.findFirst({
    where: { patientId: patient.id, status: 'IN_PROGRESS' },
  })
  if (activeConsultation) {
    return res.status(409).json({ error: 'ACTIVE_CONSULTATION_IN_PROGRESS' })
  }

  const domain = detectDomainFromComplaint(complaint)

  const sessionRec = await prisma.preConsultationSession.create({ data: { patientId: patient.id, complaint, domain } })

  // Initialize with the first adaptive question
  const nextQ = getNextAdaptiveQuestion(domain, [], complaint)
  if (nextQ) {
    await prisma.sessionQuestion.create({ 
      data: { 
        sessionId: sessionRec.id, 
        text: nextQ.text, 
        type: nextQ.type, 
        key: nextQ.key, // Pass the key
        order: 0 
      } 
    })
  }

  return res.json({ sessionId: sessionRec.id, domain })
}
