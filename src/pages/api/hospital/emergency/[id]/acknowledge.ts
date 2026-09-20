import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const role = token.role as string
  const userId = token.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (role !== 'HOSPITAL') return res.status(403).json({ error: 'Forbidden' })

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

  const hospital = await prisma.hospital.findUnique({ where: { userId } })
  if (!hospital) return res.status(404).json({ error: 'Hospital not found' })

  const alert = await prisma.emergencyAlert.findUnique({ where: { id } })
  if (!alert) return res.status(404).json({ error: 'Alert not found' })
  if (alert.hospitalId !== hospital.id) return res.status(403).json({ error: 'Access denied' })

  if (req.method === 'POST'){
    const updated = await prisma.emergencyAlert.update({ where: { id }, data: { status: 'ACKNOWLEDGED', acknowledgedBy: userId, acknowledgedAt: new Date() } })
    await prisma.accessAudit.create({ data: { actorId: userId, actorRole: role, patientId: alert.patientId, consultationId: alert.consultationId || null, action: 'EMERGENCY_ACKNOWLEDGED', note: id } })
    return res.json({ alert: updated })
  }

  res.setHeader('Allow','POST')
  res.status(405).end('Method Not Allowed')
}
