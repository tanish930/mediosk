import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { z } from 'zod'

const BodySchema = z.object({
  address: z.string().trim().max(500, 'Address must be under 500 characters.').optional(),
  name: z.string().trim().min(1, 'Full name is required.').max(100, 'Full name must be under 100 characters.').optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const role = token.role as string
  const userId = token.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (role !== 'HOSPITAL') return res.status(403).json({ error: 'Forbidden' })

  const hospital = await prisma.hospital.findUnique({
    where: { userId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!hospital) return res.status(404).json({ error: 'Hospital not found' })

  if (req.method === 'GET') {
    return res.json({ hospital })
  }

  if (req.method === 'PUT') {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', errors: parsed.error.flatten().fieldErrors })
    const data: { address?: string } = {}
    if (parsed.data.address !== undefined) data.address = parsed.data.address
    if (parsed.data.name !== undefined) await prisma.user.update({ where: { id: hospital.userId }, data: { name: parsed.data.name } })
    const updated = await prisma.hospital.update({
      where: { id: hospital.id },
      data,
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    await prisma.accessAudit.create({ data: { actorId: userId, actorRole: role, patientId: '', action: 'HOSPITAL_PROFILE_UPDATED', note: 'Profile updated' } })
    return res.json({ hospital: updated })
  }

  res.setHeader('Allow', 'GET,PUT')
  res.status(405).end('Method Not Allowed')
}