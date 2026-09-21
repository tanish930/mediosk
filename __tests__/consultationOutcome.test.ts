import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    consultation: { findUnique: jest.fn(), update: jest.fn() },
    doctor: { findUnique: jest.fn() },
    hospital: { findUnique: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import endHandler from '../src/pages/api/consultations/[id]/end'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const CONSULT_ID = '00000000-0000-0000-0000-000000000001'
const PATIENT_ID = '00000000-0000-0000-0000-000000000002'
const DOCTOR_ID = '00000000-0000-0000-0000-000000000010'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000011'
const OTHER_DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000012'
const HOSPITAL_USER_ID = '00000000-0000-0000-0000-000000000021'

const doctorToken = { id: DOCTOR_USER_ID, role: 'DOCTOR' }
const hospitalToken = { id: HOSPITAL_USER_ID, role: 'HOSPITAL' }

function consultation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSULT_ID,
    doctorId: DOCTOR_ID,
    hospitalId: null,
    patientId: PATIENT_ID,
    sessionId: '00000000-0000-0000-0000-000000000110',
    status: 'IN_PROGRESS',
    ...overrides,
  }
}

async function callHandler(method: string, body: unknown, token: Record<string, unknown> | null, query: Record<string, unknown> = { id: CONSULT_ID }) {
  mockGetToken.mockResolvedValue(token)
  const req = createRequest({ method: method as any, query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await endHandler(req as any, res as any)
  let parsed: any
  try {
    parsed = res._getJSONData()
  } catch {
    parsed = res._getData()
  }
  return { status: res.statusCode, body: parsed }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.consultation.findUnique.mockResolvedValue(consultation())
  mockPrisma.consultation.update.mockImplementation((args: any) =>
    Promise.resolve({ ...consultation(), ...args.data })
  )
  mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
  mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'hospital', userId: HOSPITAL_USER_ID })
  mockPrisma.accessAudit.create.mockResolvedValue({})
})

describe('POST /api/consultations/[id]/end', () => {
  test('assigned doctor can complete with a COMPLETED outcome', async () => {
    const result = await callHandler(
      'POST',
      { outcome: 'COMPLETED' },
      doctorToken
    )

    expect(result.status).toBe(200)
    expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', outcome: 'COMPLETED' }),
      })
    )
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CONSULTATION_ENDED' }) })
    )
    expect(result.body.consultation.outcome).toBe('COMPLETED')
  })

  test('outcome and completedAt are persisted with the consultation', async () => {
    const result = await callHandler(
      'POST',
      { outcome: 'FOLLOW_UP' },
      doctorToken
    )

    expect(result.status).toBe(200)
    expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: 'FOLLOW_UP',
          completedAt: expect.any(Date),
        }),
      })
    )
    expect(result.body.consultation.completedAt).toBeDefined()
  })

  test('optional encounter note is persisted', async () => {
    const result = await callHandler(
      'POST',
      { outcome: 'REFERRED', outcomeNote: 'Referred to cardiology for review.' },
      doctorToken
    )

    expect(result.status).toBe(200)
    expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcomeNote: 'Referred to cardiology for review.' }),
      })
    )
  })

  test('empty encounter note is stored as null', async () => {
    await callHandler('POST', { outcome: 'COMPLETED', outcomeNote: '' }, doctorToken)

    expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcomeNote: null }),
      })
    )
  })

  test('rejects an outcome outside the controlled vocabulary', async () => {
    const result = await callHandler(
      'POST',
      { outcome: 'DIAGNOSIS' },
      doctorToken
    )

    expect(result.status).toBe(400)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('rejects an outcome note longer than allowed', async () => {
    const result = await callHandler(
      'POST',
      { outcome: 'COMPLETED', outcomeNote: 'x'.repeat(2001) },
      doctorToken
    )

    expect(result.status).toBe(400)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('an unrelated doctor cannot complete the consultation', async () => {
    const result = await callHandler(
      'POST',
      { outcome: 'COMPLETED' },
      { id: OTHER_DOCTOR_USER_ID, role: 'DOCTOR' }
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('hospital/ops ending must not supply a clinical outcome', async () => {
    const result = await callHandler(
      'POST',
      { outcome: 'COMPLETED' },
      hospitalToken
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('hospital/ops ending without an outcome still works (existing behavior)', async () => {
    const result = await callHandler('POST', {}, hospitalToken)

    expect(result.status).toBe(200)
    expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
      })
    )
  })

  test('repeated end of an already completed consultation is idempotent', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      consultation({ status: 'COMPLETED', outcome: 'COMPLETED', completedAt: new Date() })
    )

    const result = await callHandler('POST', { outcome: 'COMPLETED' }, doctorToken)

    expect(result.status).toBe(200)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
    expect(result.body.consultation.status).toBe('COMPLETED')
  })

  test('a completed consultation cannot be re-completed with a different outcome', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      consultation({ status: 'COMPLETED', outcome: 'COMPLETED', completedAt: new Date() })
    )

    const result = await callHandler('POST', { outcome: 'NOT_COMPLETED' }, doctorToken)

    expect(result.status).toBe(409)
    expect(result.body.error).toBe('already_completed')
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('unassigned consultation cannot be completed', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(consultation({ doctorId: null }))

    const result = await callHandler('POST', { outcome: 'COMPLETED' }, doctorToken)

    expect(result.status).toBe(409)
    expect(result.body.error).toBe('consultation_unassigned')
  })

  test('unauthenticated request is rejected', async () => {
    const result = await callHandler('POST', { outcome: 'COMPLETED' }, null)

    expect(result.status).toBe(401)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('patient role cannot end a consultation', async () => {
    const result = await callHandler(
      'POST',
      { outcome: 'COMPLETED' },
      { id: 'patient-user', role: 'PATIENT' }
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('non-POST requests are rejected', async () => {
    const result = await callHandler('GET', null, doctorToken)

    expect(result.status).toBe(405)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })
})