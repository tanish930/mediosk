import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { z } from 'zod'

const PutSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required.').max(100, 'Full name must be under 100 characters.').optional(),
  speciality: z.string().trim().max(120, 'Specialty must be under 120 characters.').optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req })
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  const role = (session as any).user?.role
  const userId = (session as any).user?.id
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' })

  const doctor = await prisma.doctor.findUnique({
    where: { userId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' })

  if (req.method === 'GET') {
    return res.json({ doctor })
  }

  if (req.method === 'PUT') {
    const parsed = PutSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', errors: parsed.error.flatten().fieldErrors })

    const data: { speciality?: string } = {}
    if (parsed.data.speciality !== undefined) data.speciality = parsed.data.speciality
    if (parsed.data.name !== undefined) await prisma.user.update({ where: { id: userId }, data: { name: parsed.data.name } })

    const updated = await prisma.doctor.update({
      where: { id: doctor.id },
      data,
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    await prisma.accessAudit.create({ data: { actorId: userId, actorRole: role, patientId: '', action: 'DOCTOR_PROFILE_UPDATED', note: 'Doctor profile updated' } })
    return res.json({ doctor: updated })
  }

  res.setHeader('Allow', 'GET,PUT')
  res.status(405).end('Method Not Allowed')
}