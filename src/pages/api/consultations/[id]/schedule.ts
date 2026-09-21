import { getToken } from 'next-auth/jwt'
import { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { prisma } from '../../../../lib/prisma'

const Body = z.object({ scheduledAt: z.string().optional() })

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if (req.method !== 'PATCH') return res.status(405).end()
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'unauthenticated' })
  const role = token.role as string
  const uid = token.id as string
  if (!uid) return res.status(401).json({ error: 'unauthenticated' })
  if (role !== 'DOCTOR' && role !== 'HOSPITAL') return res.status(403).json({ error: 'forbidden' })

const { id } = req.query as any
  const parsed = Body.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid' })

  const consultation = await prisma.consultation.findUnique({ where: { id } })
  if (!consultation) return res.status(404).json({ error: 'not_found' })
  if (!consultation.doctorId) return res.status(409).json({ error: 'consultation_unassigned' })

  // Authorization: only the assigned doctor or the owning hospital may schedule
  if (role === 'DOCTOR') {
    const doctor = await prisma.doctor.findUnique({ where: { userId: uid } })
    if (!doctor || consultation.doctorId !== doctor.id) return res.status(403).json({ error: 'forbidden' })
  } else {
    const hospital = await prisma.hospital.findUnique({ where: { userId: uid } })
    if (!hospital || consultation.hospitalId !== hospital.id) return res.status(403).json({ error: 'forbidden' })
  }

  const data:any = {}
  if (parsed.data.scheduledAt) data.scheduledAt = new Date(parsed.data.scheduledAt)
  data.status = 'SCHEDULED'

  const updated = await prisma.consultation.update({ where: { id }, data })
  await prisma.accessAudit.create({ data: { actorId: uid, actorRole: role, patientId: consultation.patientId, doctorId: consultation.doctorId, consultationId: id, action: 'CONSULTATION_SCHEDULED', note: parsed.data.scheduledAt || null } })
  return res.json({ consultation: updated })
}
