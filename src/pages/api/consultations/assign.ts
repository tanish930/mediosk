import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { z } from 'zod'

const BodySchema = z.object({
  consultationId: z.string().uuid(),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    })
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
    })
  }

  const userId = token.id as string
  const role = token.role as string

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized: missing user id',
    })
  }

  if (role !== 'DOCTOR') {
    return res.status(403).json({
      error: 'Only doctors can assign consultations',
    })
  }

  const parsed = BodySchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid consultationId',
      details: parsed.error.errors,
    })
  }

  const { consultationId } = parsed.data

  const doctor = await prisma.doctor.findUnique({
    where: {
      userId,
    },
  })

  if (!doctor) {
    return res.status(404).json({
      error: 'Doctor profile not found',
    })
  }

  const consultation = await prisma.consultation.findUnique({
    where: {
      id: consultationId,
    },
  })

  if (!consultation) {
    return res.status(404).json({
      error: 'Consultation not found',
    })
  }

  if (consultation.status !== 'REQUESTED') {
    return res.status(409).json({
      error: 'Consultation is no longer available for assignment',
    })
  }

  if (consultation.doctorId) {
    return res.status(409).json({
      error: 'Consultation is already assigned',
    })
  }

  const updated = await prisma.consultation.update({
    where: {
      id: consultationId,
    },
    data: {
      doctorId: doctor.id,
      status: 'READY',
      scheduledAt: new Date(),
    },
    include: {
      patient: {
        include: {
          user: true,
        },
      },
      doctor: {
        include: {
          user: true,
        },
      },
      session: {
        include: {
          report: true,
        },
      },
    },
  })

  return res.status(200).json({
    consultation: updated,
  })
}