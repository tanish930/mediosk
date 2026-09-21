import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'

// Consultation states that can still be cancelled before the visit begins.
const CANCELLABLE = new Set(['PENDING', 'REQUESTED', 'READY', 'SCHEDULED'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const userId = token.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  const role = token.role as string

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid consultation id' })

  const consultation = await prisma.consultation.findUnique({
    where: { id },
    include: { patient: { include: { user: true } } },
  })
  if (!consultation) return res.status(404).json({ error: 'Consultation not found' })

  if (!CANCELLABLE.has(consultation.status)) {
    return res.status(409).json({ error: `Consultation cannot be cancelled in status ${consultation.status}` })
  }

  // Authorization: the owning patient, the assigned doctor, or the owning hospital
  if (role === 'PATIENT') {
    if (consultation.patient?.userId !== userId) {
      return res.status(403).json({ error: 'Not allowed to cancel this consultation' })
    }
  } else if (role === 'DOCTOR') {
    const doctor = await prisma.doctor.findUnique({ where: { userId } })
    if (!doctor || consultation.doctorId !== doctor.id) {
      return res.status(403).json({ error: 'Only the assigned doctor can cancel this consultation' })
    }
  } else if (role === 'HOSPITAL') {
    const hospital = await prisma.hospital.findUnique({ where: { userId } })
    if (!hospital || consultation.hospitalId !== hospital.id) {
      return res.status(403).json({ error: 'Only the owning hospital can cancel this consultation' })
    }
  } else {
    return res.status(403).json({ error: 'Not authorized to cancel consultations' })
  }

  const updated = await prisma.consultation.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })
  await prisma.accessAudit.create({
    data: {
      actorId: userId,
      actorRole: role,
      patientId: consultation.patientId,
      doctorId: consultation.doctorId,
      consultationId: id,
      action: 'CONSULTATION_CANCELLED',
      note: '',
    },
  })
  return res.json({ consultation: updated })
}