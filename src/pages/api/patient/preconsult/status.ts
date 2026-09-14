import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await getSession({ req })
  if (!session) return res.status(401).json({ error: 'unauthenticated' })
  if ((session as any).user.role !== 'PATIENT') return res.status(403).json({ error: 'forbidden' })

  const patient = await prisma.patient.findUnique({ where: { userId: (session as any).user.id } })
  if (!patient) return res.status(404).json({ error: 'patient_not_found' })

  const activeSession = await prisma.preConsultationSession.findFirst({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'desc' },
    include: {
      report: true,
      consultation: { select: { id: true, status: true, scheduledAt: true } },
      _count: { select: { questions: true } },
      questions: { where: { answered: true }, select: { id: true } },
      documents: {
        select: {
          id: true,
          title: true,
          processing: { select: { status: true } },
        },
      },
    },
  })

  if (!activeSession) return res.json({ session: null })

  return res.json({
    session: {
      id: activeSession.id,
      status: activeSession.status,
      complaint: activeSession.complaint,
      domain: activeSession.domain,
      createdAt: activeSession.createdAt,
      progress: {
        total: activeSession._count.questions,
        answered: activeSession.questions.length,
      },
      hasReport: !!activeSession.report,
      documents: activeSession.documents,
      consultation: activeSession.consultation,
    },
  })
}
