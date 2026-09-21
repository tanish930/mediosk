import { prisma } from './prisma'

export interface ConsultationAccessInput {
  consultation: {
    id: string
    patientId: string
    doctorId: string | null
  } | null
  doctorId: string
}

/**
 * Centralized doctor authorization for a consultation. Preserves the existing
 * endpoint semantics:
 * - the assigned doctor is allowed;
 * - an unrelated doctor is allowed only while the LATEST consent record for
 *   (patientId, granteeDoctorId) is granted, so a later revoke denies access;
 * - hospital membership or HospitalDoctor status never grants access by itself;
 * - consent is scoped to the consultation's patient, so a consent held for a
 *   different patient never grants access.
 * Returns true when access is allowed, false otherwise.
 */
export async function assertDoctorCanAccessConsultation({
  consultation,
  doctorId,
}: ConsultationAccessInput): Promise<boolean> {
  if (!consultation) return false
  if (consultation.doctorId === doctorId) return true
  const consent = await prisma.consent.findFirst({
    where: {
      patientId: consultation.patientId,
      granteeDoctorId: doctorId,
    },
    orderBy: { createdAt: 'desc' },
  })
  return Boolean(consent && consent.granted === true)
}