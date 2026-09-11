import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  const session = await getSession({ req })
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  const role = (session as any).user?.role
  if (role !== 'HOSPITAL') return res.status(403).json({ error: 'Forbidden' })

  const hospital = await prisma.hospital.findUnique({ where: { userId: (session as any).user.id } })
  if (!hospital) return res.status(404).json({ error: 'Hospital not found' })

  // Linked doctors' active consultations plus the hospital's unassigned intake pool.
  const consultations = await prisma.consultation.findMany({
    where: {
      OR: [
        { doctor: { hospitalLinks: { some: { hospitalId: hospital.id } } }, status: { in: ['PENDING', 'READY', 'IN_PROGRESS', 'SCHEDULED'] } },
        { hospitalId: hospital.id, status: 'REQUESTED' },
      ],
    },
    include: { patient: { include: { user: true } }, session: { include: { report: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return res.json({ consultations })
}
