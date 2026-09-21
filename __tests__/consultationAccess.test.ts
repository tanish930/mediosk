import { assertDoctorCanAccessConsultation } from '../src/lib/consultationAccess'

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    consent: { findFirst: jest.fn() },
  },
}))

import { prisma } from '../src/lib/prisma'

const mockPrisma = prisma as any

const CONSULTATION_ID = '00000000-0000-0000-0000-000000000210'
const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const ASSIGNED_DOCTOR_ID = '00000000-0000-0000-0000-000000000200'
const REQUESTING_DOCTOR_ID = '00000000-0000-0000-0000-000000000201'

function consultationFor(doctorId: string | null) {
  return { id: CONSULTATION_ID, patientId: PATIENT_ID, doctorId }
}

function consentRecord(granted: boolean) {
  return {
    id: 'consent-1',
    patientId: PATIENT_ID,
    granteeDoctorId: REQUESTING_DOCTOR_ID,
    granted,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('assertDoctorCanAccessConsultation', () => {
  test('assigned doctor is allowed', async () => {
    const allowed = await assertDoctorCanAccessConsultation({
      consultation: consultationFor(REQUESTING_DOCTOR_ID),
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(allowed).toBe(true)
    expect(mockPrisma.consent.findFirst).not.toHaveBeenCalled()
  })

  test('unrelated doctor without consent is denied', async () => {
    mockPrisma.consent.findFirst.mockResolvedValue(null)

    const allowed = await assertDoctorCanAccessConsultation({
      consultation: consultationFor(ASSIGNED_DOCTOR_ID),
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(allowed).toBe(false)
  })

  test('unrelated doctor with granted consent is allowed', async () => {
    mockPrisma.consent.findFirst.mockResolvedValue(consentRecord(true))

    const allowed = await assertDoctorCanAccessConsultation({
      consultation: consultationFor(ASSIGNED_DOCTOR_ID),
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(allowed).toBe(true)
  })

  test('consent granted then revoked denies access (latest consent state wins)', async () => {
    mockPrisma.consent.findFirst.mockResolvedValue(consentRecord(false))

    const allowed = await assertDoctorCanAccessConsultation({
      consultation: consultationFor(ASSIGNED_DOCTOR_ID),
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(allowed).toBe(false)
  })

  test('a later grant restores access after a revoke', async () => {
    mockPrisma.consent.findFirst.mockResolvedValue(consentRecord(true))

    const allowed = await assertDoctorCanAccessConsultation({
      consultation: consultationFor(ASSIGNED_DOCTOR_ID),
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(allowed).toBe(true)
  })

  test('another doctor assigned to the consultation is denied without consent', async () => {
    mockPrisma.consent.findFirst.mockResolvedValue(null)

    const allowed = await assertDoctorCanAccessConsultation({
      consultation: consultationFor(ASSIGNED_DOCTOR_ID),
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(allowed).toBe(false)
  })

  test('same-hospital ACTIVE HospitalDoctor status never grants access by itself', async () => {
    mockPrisma.consent.findFirst.mockResolvedValue(null)

    const allowed = await assertDoctorCanAccessConsultation({
      consultation: consultationFor(ASSIGNED_DOCTOR_ID),
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(allowed).toBe(false)
  })

  test('consent lookup is scoped to the consultation patient (patient mismatch)', async () => {
    mockPrisma.consent.findFirst.mockResolvedValue(consentRecord(true))

    const otherPatientConsultation = {
      id: CONSULTATION_ID,
      patientId: 'patient-B',
      doctorId: ASSIGNED_DOCTOR_ID,
    }

    await assertDoctorCanAccessConsultation({
      consultation: otherPatientConsultation,
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(mockPrisma.consent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: 'patient-B',
          granteeDoctorId: REQUESTING_DOCTOR_ID,
        }),
      })
    )
  })

  test('consent held for a different patient does not grant access', async () => {
    mockPrisma.consent.findFirst.mockResolvedValue(null)

    const allowed = await assertDoctorCanAccessConsultation({
      consultation: {
        id: CONSULTATION_ID,
        patientId: 'patient-B',
        doctorId: ASSIGNED_DOCTOR_ID,
      },
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(allowed).toBe(false)
  })

  test('missing consultation denies access', async () => {
    const allowed = await assertDoctorCanAccessConsultation({
      consultation: null,
      doctorId: REQUESTING_DOCTOR_ID,
    })

    expect(allowed).toBe(false)
  })
})