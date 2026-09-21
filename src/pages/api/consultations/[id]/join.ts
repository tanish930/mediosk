import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { assertDoctorCanAccessConsultation } from '../../../../lib/consultationAccess'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      error: 'invalid_id',
    })
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  if (!token) {
    return res.status(401).json({
      error: 'unauthenticated',
    })
  }

  const role = token.role as string
  const uid = token.id as string

  if (!uid) {
    return res.status(401).json({
      error: 'missing_user_id',
    })
  }

  const consultation = await prisma.consultation.findUnique({
    where: {
      id,
    },
  })

  if (!consultation) {
    return res.status(404).json({
      error: 'not_found',
    })
  }

  // Allow joining a consultation that is ready, scheduled,
  // or already in progress.
  if (
    consultation.status !== 'READY' &&
    consultation.status !== 'SCHEDULED' &&
    consultation.status !== 'IN_PROGRESS'
  ) {
    return res.status(403).json({
      error: 'invalid_status',
    })
  }

  if (role === 'PATIENT') {
    const patient = await prisma.patient.findUnique({
      where: {
        userId: uid,
      },
    })

    if (!patient || patient.id !== consultation.patientId) {
      return res.status(403).json({
        error: 'forbidden',
      })
    }

    // If a consent record exists and the latest one is not granted,
    // deny access.
    if (consultation.doctorId) {
      const consent = await prisma.consent.findFirst({
        where: {
          patientId: patient.id,
          granteeDoctorId: consultation.doctorId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (consent && !consent.granted) {
        return res.status(403).json({
          error: 'consent_required',
        })
      }
    }
  } else if (role === 'DOCTOR') {
    const doctor = await prisma.doctor.findUnique({
      where: {
        userId: uid,
      },
    })

    if (!doctor) {
      return res.status(403).json({
        error: 'doctor_profile_not_found',
      })
    }

    // Doctor must be assigned to this consultation, or hold a granted
    // patient consent for the consultation's patient.
    const doctorAllowed = await assertDoctorCanAccessConsultation({
      consultation,
      doctorId: doctor.id,
    })

    if (!doctorAllowed) {
      return res.status(403).json({
        error: 'forbidden',
      })
    }
  } else if (role === 'HOSPITAL') {
    // Hospital users must have an explicit join authorization.
    const audit = await prisma.accessAudit.findFirst({
      where: {
        actorId: uid,
        consultationId: id,
        action: {
          in: [
            'CONSULTATION_JOIN_ALLOWED',
            'CONSULTATION_JOIN_AUTHORIZED',
          ],
        },
      },
    })

    if (!audit) {
      return res.status(403).json({
        error: 'forbidden',
      })
    }
  } else {
    return res.status(403).json({
      error: 'forbidden',
    })
  }

  // When a READY/SCHEDULED consultation is joined,
  // move it into the active consultation state.
  let updatedConsultation = consultation

  if (
    consultation.status === 'READY' ||
    consultation.status === 'SCHEDULED'
  ) {
    updatedConsultation = await prisma.consultation.update({
      where: {
        id,
      },
      data: {
        status: 'IN_PROGRESS',
      },
    })
  }

  // Record the successful join.
  await prisma.accessAudit.create({
    data: {
      actorId: uid,
      actorRole: role,
      patientId: consultation.patientId,
      doctorId: consultation.doctorId,
      consultationId: id,
      action: 'CONSULTATION_JOINED',
    },
  })

  return res.status(200).json({
    ok: true,
    consultation: updatedConsultation,
  })
}