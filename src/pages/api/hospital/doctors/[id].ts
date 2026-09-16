import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { z } from 'zod'

const BodySchema = z.object({ action: z.enum(['activate', 'deactivate']) })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    return res.status(405).end('Method Not Allowed')
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const role = token.role as string
  const userId = token.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (role !== 'HOSPITAL') return res.status(403).json({ error: 'Forbidden' })

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid link id' })

  const hospital = await prisma.hospital.findUnique({ where: { userId } })
  if (!hospital) return res.status(404).json({ error: 'Hospital not found' })

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors })
  const { action } = parsed.data

  const link = await prisma.hospitalDoctor.findFirst({ where: { id, hospitalId: hospital.id } })
  if (!link) return res.status(404).json({ error: 'Link not found' })

  let status: 'PENDING' | 'ACTIVE'
  if (action === 'activate') {
    if (link.status !== 'PENDING') {
      return res.status(409).json({ error: 'Only pending doctors can be activated here' })
    }
    status = 'ACTIVE'
  } else {
    if (link.status !== 'ACTIVE') {
      return res.status(409).json({ error: 'Only active doctors can be deactivated' })
    }
    status = 'PENDING'
  }

  const updated = await prisma.hospitalDoctor.update({ where: { id: link.id }, data: { status } })
  await prisma.accessAudit.create({
    data: {
      actorId: userId,
      actorRole: role,
      patientId: '',
      doctorId: link.doctorId,
      action: status === 'ACTIVE' ? 'HOSPITAL_DOCTOR_ACTIVATED' : 'HOSPITAL_DOCTOR_DEACTIVATED',
      note: '',
    },
  })
  return res.json({ link: updated })
}