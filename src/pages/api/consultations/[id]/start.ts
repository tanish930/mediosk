import { getToken } from 'next-auth/jwt'
import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'unauthenticated' })
  const role = token.role as string
  if (role !== 'DOCTOR' && role !== 'HOSPITAL') return res.status(403).json({ error: 'forbidden' })
  const uid = token.id as string
  if (!uid) return res.status(401).json({ error: 'unauthenticated' })

  const { id } = req.query as any
  const consultation = await prisma.consultation.findUnique({ where: { id } })
  if (!consultation) return res.status(404).json({ error: 'not_found' })
  // only assigned doctor can start
  if (!consultation.doctorId) return res.status(409).json({ error: 'consultation_unassigned' })
  const doctor = await prisma.doctor.findUnique({ where: { id: consultation.doctorId } })
  if (!doctor) return res.status(404).json({ error: 'doctor_not_found' })
  if (role === 'DOCTOR' && uid !== doctor.userId) return res.status(403).json({ error: 'forbidden' })

  const updated = await prisma.consultation.update({ where: { id }, data: { status: 'IN_PROGRESS' } })
  await prisma.accessAudit.create({ data: { actorId: uid, actorRole: role, patientId: consultation.patientId, doctorId: consultation.doctorId, consultationId: id, action: 'CONSULTATION_STARTED' } })
  return res.json({ consultation: updated })
}
