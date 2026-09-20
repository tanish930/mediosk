import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'
import { z } from 'zod'

const BodySchema = z.object({ action: z.enum(['RESOLVE','CANCEL']).optional() })

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const role = token.role as string
  const userId = token.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (role !== 'HOSPITAL') return res.status(403).json({ error: 'Forbidden' })

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

  const parsed = BodySchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid body' })
  const action = parsed.data.action || 'RESOLVE'

  const hospital = await prisma.hospital.findUnique({ where: { userId } })
  if (!hospital) return res.status(404).json({ error: 'Hospital not found' })

  const alert = await prisma.emergencyAlert.findUnique({ where: { id } })
  if (!alert) return res.status(404).json({ error: 'Alert not found' })
  if (alert.hospitalId !== hospital.id) return res.status(403).json({ error: 'Access denied' })

  if (req.method === 'POST'){
    const data:any = { status: action === 'CANCEL' ? 'CANCELLED' : 'RESOLVED', resolvedBy: userId, resolvedAt: new Date() }
    const updated = await prisma.emergencyAlert.update({ where: { id }, data })
    await prisma.accessAudit.create({ data: { actorId: userId, actorRole: role, patientId: alert.patientId, consultationId: alert.consultationId || null, action: action === 'CANCEL' ? 'EMERGENCY_CANCELLED' : 'EMERGENCY_RESOLVED', note: id } })
    return res.json({ alert: updated })
  }

  res.setHeader('Allow','POST')
  res.status(405).end('Method Not Allowed')
}
