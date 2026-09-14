import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'
import { z } from 'zod'

const BodySchema = z.object({ status: z.enum(['REVIEWED','VERIFIED']), note: z.string().optional() })

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const userId = token.id as string
  const role = token.role as string
  if (role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' })

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors })

  const ayush = await prisma.ayushAssessment.findUnique({ where: { id } })
  if (!ayush) return res.status(404).json({ error: 'AYUSH assessment not found' })

  // verify access based on consultation
  const consultation = ayush.consultationId ? await prisma.consultation.findUnique({ where: { id: ayush.consultationId } }) : null
  const doctor = await prisma.doctor.findUnique({ where: { userId } })
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
  const assigned = consultation ? consultation.doctorId === doctor.id : false
  const consent = consultation ? await prisma.consent.findFirst({ where: { patientId: consultation.patientId, granteeDoctorId: doctor.id }, orderBy: { createdAt: 'desc' } }) : null
  if (!assigned && !(consent && consent.granted === true)) return res.status(403).json({ error: 'Access denied' })

  const { status, note } = parsed.data
  const updated = await prisma.ayushAssessment.update({ where: { id }, data: { status, verifiedBy: doctor.id, verifiedAt: new Date() } })
  await prisma.accessAudit.create({ data: { actorId: userId, actorRole: 'DOCTOR', patientId: ayush.patientId, doctorId: doctor.id, consultationId: ayush.consultationId, action: 'AYUSH_VERIFY', note: note || status } })
  return res.json({ ayush: updated })
}
