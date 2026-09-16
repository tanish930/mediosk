import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    doctor: { findUnique: jest.fn() },
    consultation: { findUnique: jest.fn() },
    consent: { findFirst: jest.fn() },
    doctorVerification: { findFirst: jest.fn(), create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import caseVerifyHandler from '../src/pages/api/doctor/case/[id]/verify'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const DOCTOR_ID = '00000000-0000-0000-0000-000000000200'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000201'
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000210'
const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const DOC_ID = '00000000-0000-0000-0000-000000000120'

const doctorToken = { id: DOCTOR_USER_ID, role: 'DOCTOR' }

async function callHandler(
  method: string,
  query: Record<string, unknown> = {},
  body?: unknown
) {
  const req = createRequest({ method: method as any, query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await caseVerifyHandler(req as any, res as any)
  await new Promise((r) => setImmediate(r))
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue(doctorToken)
  mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
  mockPrisma.consultation.findUnique.mockResolvedValue({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
  })
  mockPrisma.consent.findFirst.mockResolvedValue(null)
})

describe('POST /api/doctor/case/[id]/verify', () => {
  test('creates a DoctorVerification record on first verification', async () => {
    mockPrisma.doctorVerification.findFirst.mockResolvedValue(null)
    const created = {
      id: 'v-1',
      doctorId: DOCTOR_ID,
      targetType: 'DOCUMENT',
      targetId: DOC_ID,
      status: 'REVIEWED',
      note: null,
    }
    mockPrisma.doctorVerification.create.mockResolvedValue(created)

    const res = await callHandler(
      'POST',
      { id: CONSULTATION_ID },
      { targetType: 'DOCUMENT', targetId: DOC_ID, status: 'REVIEWED' }
    )
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockPrisma.doctorVerification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ doctorId: DOCTOR_ID, targetType: 'DOCUMENT', targetId: DOC_ID, status: 'REVIEWED' }),
      })
    )
    expect(mockPrisma.doctorVerification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ doctorId: DOCTOR_ID, targetType: 'DOCUMENT', targetId: DOC_ID, status: 'REVIEWED' }),
      })
    )
  })

  test('repeated identical click returns the existing verification without a duplicate', async () => {
    const existing = {
      id: 'v-1',
      doctorId: DOCTOR_ID,
      targetType: 'DOCUMENT',
      targetId: DOC_ID,
      status: 'REVIEWED',
      note: null,
    }
    mockPrisma.doctorVerification.findFirst.mockResolvedValue(existing)

    const res = await callHandler(
      'POST',
      { id: CONSULTATION_ID },
      { targetType: 'DOCUMENT', targetId: DOC_ID, status: 'REVIEWED' }
    )
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.verification).toEqual(existing)
    expect(mockPrisma.doctorVerification.create).not.toHaveBeenCalled()
  })

  test('escalating from REVIEWED to VERIFIED still creates a new record', async () => {
    mockPrisma.doctorVerification.findFirst.mockResolvedValue(null)
    const created = {
      id: 'v-2',
      doctorId: DOCTOR_ID,
      targetType: 'DOCUMENT',
      targetId: DOC_ID,
      status: 'VERIFIED',
      note: null,
    }
    mockPrisma.doctorVerification.create.mockResolvedValue(created)

    const res = await callHandler(
      'POST',
      { id: CONSULTATION_ID },
      { targetType: 'DOCUMENT', targetId: DOC_ID, status: 'VERIFIED' }
    )

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.doctorVerification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'VERIFIED' }) })
    )
  })

  test('doctor verification note is stored with the record', async () => {
    mockPrisma.doctorVerification.findFirst.mockResolvedValue(null)
    mockPrisma.doctorVerification.create.mockResolvedValue({
      id: 'v-note',
      doctorId: DOCTOR_ID,
      targetType: 'DOCUMENT',
      targetId: DOC_ID,
      status: 'REVIEWED',
      note: 'Values match the printed lab report',
    })

    const res = await callHandler(
      'POST',
      { id: CONSULTATION_ID },
      { targetType: 'DOCUMENT', targetId: DOC_ID, status: 'REVIEWED', note: 'Values match the printed lab report' }
    )

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.doctorVerification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          doctorId: DOCTOR_ID,
          targetType: 'DOCUMENT',
          targetId: DOC_ID,
          status: 'REVIEWED',
          note: 'Values match the printed lab report',
        }),
      })
    )
    expect(res._getJSONData().verification.note).toBe('Values match the printed lab report')
  })

  test('existing verification with a note is returned on repeat click', async () => {
    mockPrisma.doctorVerification.findFirst.mockResolvedValue({
      id: 'v-note',
      doctorId: DOCTOR_ID,
      targetType: 'DOCUMENT',
      targetId: DOC_ID,
      status: 'REVIEWED',
      note: 'Saved earlier',
    })

    const res = await callHandler(
      'POST',
      { id: CONSULTATION_ID },
      { targetType: 'DOCUMENT', targetId: DOC_ID, status: 'REVIEWED', note: 'Saved earlier' }
    )

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.doctorVerification.create).not.toHaveBeenCalled()
    expect(res._getJSONData().verification.note).toBe('Saved earlier')
  })

  test('unauthenticated request returns 401', async () => {
    mockGetToken.mockResolvedValue(null)

    const res = await callHandler('POST', { id: CONSULTATION_ID }, {})

    expect(res.statusCode).toBe(401)
    expect(mockPrisma.doctorVerification.findFirst).not.toHaveBeenCalled()
  })

  test('non-doctor role returns 403', async () => {
    mockGetToken.mockResolvedValue({ id: 'some-user', role: 'PATIENT' })

    const res = await callHandler('POST', { id: CONSULTATION_ID }, {})

    expect(res.statusCode).toBe(403)
  })

  test('doctor with no assignment or consent returns 403', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: CONSULTATION_ID,
      doctorId: 'other-doctor',
      patientId: PATIENT_ID,
    })

    const res = await callHandler(
      'POST',
      { id: CONSULTATION_ID },
      { targetType: 'DOCUMENT', targetId: DOC_ID, status: 'REVIEWED' }
    )

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.doctorVerification.create).not.toHaveBeenCalled()
  })

  test('invalid body returns 400', async () => {
    const res = await callHandler(
      'POST',
      { id: CONSULTATION_ID },
      { targetType: 'DOCUMENT', targetId: DOC_ID, status: 'BOGUS' }
    )

    expect(res.statusCode).toBe(400)
    expect(mockPrisma.doctorVerification.create).not.toHaveBeenCalled()
  })

  test('missing consultation returns 404', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(null)

    const res = await callHandler(
      'POST',
      { id: CONSULTATION_ID },
      { targetType: 'DOCUMENT', targetId: DOC_ID, status: 'REVIEWED' }
    )

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.doctorVerification.create).not.toHaveBeenCalled()
  })
})