import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'
import { z } from 'zod'
import { assertDoctorCanAccessConsultation } from '../../../../../lib/consultationAccess'

const BodySchema = z.object({
  text: z.string().trim().min(1, 'Note text is required.').max(5000, 'Note text must be under 5000 characters.'),
})

const NOTE_SELECT = { id: true, doctorId: true, text: true, createdAt: true, updatedAt: true } as const

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const userId = token.id as string
  const role = token.role as string
  if (role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' })

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

  const doctor = await prisma.doctor.findUnique({ where: { userId } })
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' })

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors })

  const consultation = await prisma.consultation.findUnique({ where: { id } })
  if (!consultation) return res.status(404).json({ error: 'Consultation not found' })

  // CASE ACCESS: assigned doctor OR current valid patient consent.
  const allowed = await assertDoctorCanAccessConsultation({ consultation, doctorId: doctor.id })
  if (!allowed) return res.status(403).json({ error: 'Access denied' })

  // NOTE WRITE: assigned doctor only. A consent-authorized (non-assigned)
  // doctor may read the case but must not write clinical documentation.
  if (consultation.doctorId !== doctor.id) return res.status(403).json({ error: 'Forbidden' })

  const note = await prisma.clinicalNote.create({
    data: { consultationId: consultation.id, doctorId: doctor.id, text: parsed.data.text },
    select: NOTE_SELECT,
  })
  await prisma.accessAudit.create({ data: { actorId: userId, actorRole: role, patientId: consultation.patientId, doctorId: doctor.id, consultationId: consultation.id, action: 'CONSULTATION_NOTE_CREATED', note: 'Doctor clinical note' } })
  return res.json({ ok: true, note })
}