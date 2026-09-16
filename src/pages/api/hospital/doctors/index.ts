import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { z } from 'zod'

const BodySchema = z.object({ doctorId: z.string().uuid() })

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const role = token.role as string
  const userId = token.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (role !== 'HOSPITAL') return res.status(403).json({ error: 'Forbidden' })

  const hospital = await prisma.hospital.findUnique({ where: { userId } })
  if (!hospital) return res.status(404).json({ error: 'Hospital not found' })

  if (req.method === 'GET'){
    const links = await prisma.hospitalDoctor.findMany({ where: { hospitalId: hospital.id }, include: { doctor: { include: { user: true, verifications: true } } }, orderBy: { createdAt: 'desc' } })
    return res.json({ doctors: links })
  }

  if (req.method === 'POST'){
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors })
    const { doctorId } = parsed.data
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } })
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' })
    const exists = await prisma.hospitalDoctor.findFirst({ where: { hospitalId: hospital.id, doctorId: doctor.id } })
    if (exists) return res.status(400).json({ error: 'Doctor already linked' })
    const link = await prisma.hospitalDoctor.create({ data: { hospitalId: hospital.id, doctorId: doctor.id } })
    await prisma.accessAudit.create({ data: { actorId: userId, actorRole: role, patientId: '', doctorId: doctor.id, action: 'HOSPITAL_DOCTOR_ADDED', note: '' } })
    return res.json({ link })
  }

  res.setHeader('Allow','GET,POST')
  res.status(405).end('Method Not Allowed')
}
