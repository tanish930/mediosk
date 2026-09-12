import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const session = await getSession({ req })
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  if ((session as any).user?.role !== 'PATIENT') return res.status(403).json({ error: 'Forbidden' })
  const userId = (session as any).user?.id
  const { id } = req.query
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid session id' })

  try {
    const consultation = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUnique({ where: { userId } })
      if (!patient) throw new Error('PATIENT_NOT_FOUND')

      const preConsultation = await tx.preConsultationSession.findUnique({
        where: { id },
        include: { report: true, consultation: true },
      })
      if (!preConsultation || preConsultation.patientId !== patient.id) throw new Error('SESSION_NOT_FOUND')
      if (preConsultation.status !== 'COMPLETED') throw new Error('SESSION_NOT_COMPLETED')
      if (!preConsultation.report) throw new Error('REPORT_NOT_FOUND')
      if (preConsultation.consultation) throw new Error('ALREADY_SUBMITTED')

      const created = await tx.consultation.create({
        data: { patientId: patient.id, sessionId: preConsultation.id, status: 'REQUESTED' },
      })
      await tx.accessAudit.create({
        data: {
          actorId: userId,
          actorRole: 'PATIENT',
          patientId: patient.id,
          consultationId: created.id,
          action: 'CONSULTATION_SUBMITTED',
          note: `Submitted pre-consultation session ${preConsultation.id}`,
        },
      })
      return created
    })
    return res.status(201).json({ consultation })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'ALREADY_SUBMITTED' })
    }
    const code = error instanceof Error ? error.message : 'SUBMISSION_FAILED'
    if (code === 'PATIENT_NOT_FOUND' || code === 'SESSION_NOT_FOUND') return res.status(404).json({ error: code })
    if (code === 'SESSION_NOT_COMPLETED' || code === 'REPORT_NOT_FOUND' || code === 'ALREADY_SUBMITTED') {
      return res.status(409).json({ error: code })
    }
    console.error('pre-consultation submission error', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
