import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'
import { z } from 'zod'
import { assertDoctorCanAccessConsultation } from '../../../../../lib/consultationAccess'

const BodySchema = z.object({ targetType: z.string(), targetId: z.string().uuid(), status: z.enum(['AI_GENERATED','REVIEWED','VERIFIED']), note: z.string().optional() })

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
  const { targetType, targetId, status, note } = parsed.data

  // verify that consultation exists and doctor assigned or consent
  const consultation = await prisma.consultation.findUnique({ where: { id } })
  if (!consultation) return res.status(404).json({ error: 'Consultation not found' })
  const allowed = await assertDoctorCanAccessConsultation({ consultation, doctorId: doctor.id })
  if (!allowed) return res.status(403).json({ error: 'Access denied' })

  // avoid duplicate verification records when the same button is clicked repeatedly
  const existing = await prisma.doctorVerification.findFirst({
    where: { doctorId: doctor.id, targetType, targetId, status },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) return res.json({ ok: true, verification: existing })

  const v = await prisma.doctorVerification.create({ data: { doctorId: doctor.id, targetType, targetId, status, note } })
  return res.json({ ok: true, verification: v })
}
