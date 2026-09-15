import { z } from 'zod'
import { getToken } from 'next-auth/jwt'
import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

const PutSchema = z.object({ abhaId: z.string().min(1).optional().nullable() })

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'unauthenticated' })
  const role = token.role as string
  if (role !== 'PATIENT') return res.status(403).json({ error: 'forbidden' })

  const userId = token.id as string
  if (!userId) return res.status(401).json({ error: 'unauthenticated' })
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) return res.status(404).json({ error: 'patient_not_found' })

  if (req.method === 'GET'){
    return res.json({ abhaId: patient.abhaId || null, abhaLinkedAt: patient.abhaLinkedAt || null })
  }

  if (req.method === 'PUT' || req.method === 'POST'){
    const parsed = PutSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_payload', details: parsed.error.errors })
    const { abhaId } = parsed.data
    const data:any = {}
    if (abhaId) { data.abhaId = abhaId; data.abhaLinkedAt = new Date() }
    else { data.abhaId = null; data.abhaLinkedAt = null }
    const updated = await prisma.patient.update({ where: { id: patient.id }, data })
    await prisma.accessAudit.create({ data: { actorId: userId, actorRole: 'PATIENT', patientId: patient.id, action: 'ABHA_UPDATED', note: abhaId ? `Set ABHA ${abhaId}` : 'Cleared ABHA' } })
    return res.json({ abhaId: updated.abhaId || null, abhaLinkedAt: updated.abhaLinkedAt || null })
  }

  res.setHeader('Allow','GET,PUT,POST')
  return res.status(405).end()
}
