import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const userId = token.id as string
  const userRole = token.role as string

  if (userRole !== 'DOCTOR') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId },
  })

  if (!doctor) {
    return res.status(404).json({ error: 'Doctor profile not found' })
  }

  const consultations = await prisma.consultation.findMany({
    where: {
      OR: [
        {
          doctorId: doctor.id,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        {
          doctorId: null,
          status: 'REQUESTED',
        },
      ],
    },
    include: {
      patient: {
        include: {
          user: true,
        },
      },
      session: {
        include: {
          report: true,
        },
      },
      doctor: {
        include: {
          user: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  return res.json({ consultations })
}