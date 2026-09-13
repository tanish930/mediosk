import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    consultation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    doctor: {
      findUnique: jest.fn(),
    },
    hospital: {
      findUnique: jest.fn(),
    },
    hospitalDoctor: {
      findFirst: jest.fn(),
    },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import handler from '../src/pages/api/consultations/assign'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const CONSULT_ID = '00000000-0000-0000-0000-000000000001'
const HOSPITAL_ID = '00000000-0000-0000-0000-000000000010'
const HOSPITAL_USER_ID = '00000000-0000-0000-0000-000000000011'
const DOCTOR_ID = '00000000-0000-0000-0000-000000000020'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000021'
const OTHER_HOSPITAL_ID = '00000000-0000-0000-0000-000000000030'
const OTHER_DOCTOR_ID = '00000000-0000-0000-0000-000000000040'

function requestedConsultation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSULT_ID,
    doctorId: null,
    hospitalId: HOSPITAL_ID,
    patientId: '00000000-0000-0000-0000-000000000050',
    status: 'REQUESTED',
    sessionId: null,
    scheduledAt: null,
    ...overrides,
  }
}

async function callHandler(body: unknown, token: Record<string, unknown> | null) {
  mockGetToken.mockResolvedValue(token)
  const req = createRequest({ method: 'POST', body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return { status: res.statusCode, body: res._getJSONData() }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('assign.ts - DOCTOR self assignment (unchanged behavior)', () => {
  test('doctor assigns a requested consultation to themselves and ignores doctorId', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(requestedConsultation())
    mockPrisma.doctor.findUnique.mockResolvedValue({
      id: DOCTOR_ID,
      userId: DOCTOR_USER_ID,
      hospitalLinks: [{ hospitalId: HOSPITAL_ID }],
    })
    mockPrisma.consultation.update.mockResolvedValue(
      requestedConsultation({ doctorId: DOCTOR_ID, status: 'READY' })
    )

    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: OTHER_DOCTOR_ID },
      { id: DOCTOR_USER_ID, role: 'DOCTOR' }
    )

    expect(result.status).toBe(200)
    expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ doctorId: DOCTOR_ID, status: 'READY' }),
      })
    )
  })

  test('doctor cannot assign a consultation from a hospital they are not linked to', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      requestedConsultation({ hospitalId: OTHER_HOSPITAL_ID })
    )
    mockPrisma.doctor.findUnique.mockResolvedValue({
      id: DOCTOR_ID,
      userId: DOCTOR_USER_ID,
      hospitalLinks: [{ hospitalId: HOSPITAL_ID }],
    })

    const result = await callHandler(
      { consultationId: CONSULT_ID },
      { id: DOCTOR_USER_ID, role: 'DOCTOR' }
    )

    expect(result.status).toBe(403)
  })
})

describe('assign.ts - HOSPITAL assignment', () => {
  const hospitalToken = { id: HOSPITAL_USER_ID, role: 'HOSPITAL' }

  test('hospital assigns its own requested consultation to an ACTIVE linked doctor', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(requestedConsultation())
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
    mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue({
      id: 'link-1',
      hospitalId: HOSPITAL_ID,
      doctorId: DOCTOR_ID,
      status: 'ACTIVE',
    })
    mockPrisma.consultation.update.mockResolvedValue(
      requestedConsultation({ doctorId: DOCTOR_ID, status: 'READY' })
    )

    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: DOCTOR_ID },
      hospitalToken
    )

    expect(result.status).toBe(200)
    expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ doctorId: DOCTOR_ID, status: 'READY' }),
      })
    )
  })

  test('hospital cannot assign a consultation belonging to another hospital', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      requestedConsultation({ hospitalId: OTHER_HOSPITAL_ID })
    )
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })

    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: DOCTOR_ID },
      hospitalToken
    )

    expect(result.status).toBe(403)
  })

  test('hospital cannot assign to a doctor with no link', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(requestedConsultation())
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
    mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue(null)

    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: DOCTOR_ID },
      hospitalToken
    )

    expect(result.status).toBe(403)
  })

  test('hospital cannot assign to a PENDING linked doctor', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(requestedConsultation())
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
    mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue(null)

    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: DOCTOR_ID },
      hospitalToken
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.hospitalDoctor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hospitalId: HOSPITAL_ID, doctorId: DOCTOR_ID, status: 'ACTIVE' }),
      })
    )
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('hospital cannot assign to a SUSPENDED linked doctor', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(requestedConsultation())
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
    mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue(null)

    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: DOCTOR_ID },
      hospitalToken
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('hospital assignment requires doctorId', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(requestedConsultation())
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })

    const result = await callHandler({ consultationId: CONSULT_ID }, hospitalToken)

    expect(result.status).toBe(400)
  })

  test('hospital cannot assign an already-assigned consultation', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      requestedConsultation({ doctorId: DOCTOR_ID, status: 'READY' })
    )

    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: DOCTOR_ID },
      hospitalToken
    )

    expect(result.status).toBe(409)
  })

  test('hospital cannot assign a non-REQUESTED consultation', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      requestedConsultation({ status: 'IN_PROGRESS' })
    )

    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: DOCTOR_ID },
      hospitalToken
    )

    expect(result.status).toBe(409)
  })

  test('hospital without a profile is rejected', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(requestedConsultation())
    mockPrisma.hospital.findUnique.mockResolvedValue(null)

    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: DOCTOR_ID },
      hospitalToken
    )

    expect(result.status).toBe(404)
  })
})

describe('assign.ts - RBAC and validation', () => {
  test('PATIENT cannot assign', async () => {
    const result = await callHandler(
      { consultationId: CONSULT_ID, doctorId: DOCTOR_ID },
      { id: '00000000-0000-0000-0000-000000000060', role: 'PATIENT' }
    )
    expect(result.status).toBe(403)
  })

  test('unauthenticated request returns 401', async () => {
    const result = await callHandler({ consultationId: CONSULT_ID }, null)
    expect(result.status).toBe(401)
  })

  test('invalid body returns 400', async () => {
    const result = await callHandler(
      { consultationId: 'not-a-uuid' },
      { id: DOCTOR_USER_ID, role: 'DOCTOR' }
    )
    expect(result.status).toBe(400)
  })
})