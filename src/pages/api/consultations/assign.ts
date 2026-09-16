import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { z } from 'zod'

const BodySchema = z.object({
  consultationId: z.string().uuid(),
  doctorId: z.string().uuid().optional(),
})

const consultationInclude = {
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
}

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

  if (role !== 'DOCTOR' && role !== 'HOSPITAL') {
    return res.status(403).json({
      error: 'Only doctors or hospitals can assign consultations',
    })
  }

  const parsed = BodySchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid consultationId',
      details: parsed.error.errors,
    })
  }

  const { consultationId, doctorId } = parsed.data

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

  if (role === 'DOCTOR') {
    const doctor = await prisma.doctor.findUnique({
      where: {
        userId,
      },
      include: { hospitalLinks: true },
    })

    if (!doctor) {
      return res.status(404).json({
        error: 'Doctor profile not found',
      })
    }

    if (consultation.hospitalId && !doctor.hospitalLinks.some((l: any) => l.hospitalId === consultation.hospitalId && l.status === 'ACTIVE')) {
      return res.status(403).json({
        error: 'Cannot assign a consultation from a hospital you are not actively linked to',
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
      include: consultationInclude,
    })

    return res.status(200).json({
      consultation: updated,
    })
  }

  if (!doctorId) {
    return res.status(400).json({
      error: 'doctorId is required',
    })
  }

  const hospital = await prisma.hospital.findUnique({
    where: {
      userId,
    },
  })

  if (!hospital) {
    return res.status(404).json({
      error: 'Hospital profile not found',
    })
  }

  if (consultation.hospitalId !== hospital.id) {
    return res.status(403).json({
      error: 'Cannot assign a consultation from another hospital',
    })
  }

  const targetDoctor = await prisma.doctor.findUnique({
    where: {
      id: doctorId,
    },
  })

  if (!targetDoctor) {
    return res.status(404).json({
      error: 'Doctor not found',
    })
  }

  const link = await prisma.hospitalDoctor.findFirst({
    where: {
      hospitalId: hospital.id,
      doctorId: targetDoctor.id,
      status: 'ACTIVE',
    },
  })

  if (!link) {
    return res.status(403).json({
      error: 'Doctor is not active at this hospital',
    })
  }

  const updated = await prisma.consultation.update({
    where: {
      id: consultationId,
    },
    data: {
      doctorId: targetDoctor.id,
      status: 'READY',
      scheduledAt: new Date(),
    },
    include: consultationInclude,
  })

  return res.status(200).json({
    consultation: updated,
  })
}