import { getToken } from 'next-auth/jwt'
import { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { prisma } from '../../../../lib/prisma'

const Body = z.object({ reason: z.string().optional() })

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'unauthenticated' })
  const role = token.role as string
  if (role !== 'PATIENT') return res.status(403).json({ error: 'forbidden' })
  const uid = token.id as string
  if (!uid) return res.status(401).json({ error: 'unauthenticated' })

  const { id } = req.query as any
  const parsed = Body.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid' })

  const consultation = await prisma.consultation.findUnique({ where: { id } })
  if (!consultation) return res.status(404).json({ error: 'not_found' })

  // ensure patient owns it
  const patient = await prisma.patient.findUnique({ where: { userId: uid } })
  if (!patient || patient.id !== consultation.patientId) return res.status(403).json({ error: 'forbidden' })

  const updated = await prisma.consultation.update({ where: { id }, data: { status: 'REQUESTED' } })
  await prisma.accessAudit.create({ data: { actorId: uid, actorRole: role, patientId: patient.id, consultationId: id, action: 'CONSULTATION_REQUESTED', note: parsed.data.reason || null } })
  return res.json({ consultation: updated })
}
