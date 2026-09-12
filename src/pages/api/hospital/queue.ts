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

  // Fetch doctors linked to this hospital
  const links = await prisma.hospitalDoctor.findMany({ where: { hospitalId: hospital.id } })
  const doctorIds = links.map((l:any)=>l.doctorId)

  // Linked doctors' active consultations plus the unassigned intake pool.
  // A REQUESTED consultation has no doctor yet, so it cannot belong to a different hospital's doctor queue.
  const consultations = await prisma.consultation.findMany({
    where: {
      OR: [
        { doctorId: { in: doctorIds }, status: { in: ['PENDING', 'READY', 'IN_PROGRESS', 'SCHEDULED'] } },
        { doctorId: null, status: 'REQUESTED' },
      ],
    },
    include: { patient: { include: { user: true } }, session: { include: { report: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return res.json({ consultations })
}
