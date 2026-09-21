import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    consultation: { findUnique: jest.fn(), update: jest.fn() },
    doctor: { findUnique: jest.fn() },
    patient: { findUnique: jest.fn() },
    consent: { findFirst: jest.fn() },
    accessAudit: { findFirst: jest.fn(), create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import getHandler from '../src/pages/api/consultations/[id]'
import requestHandler from '../src/pages/api/consultations/[id]/request'
import startHandler from '../src/pages/api/consultations/[id]/start'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const CONSULT_ID = '00000000-0000-0000-0000-000000000001'
const PATIENT_ID = '00000000-0000-0000-0000-000000000002'
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000003'
const OTHER_PATIENT_USER_ID = '00000000-0000-0000-0000-000000000004'
const DOCTOR_ID = '00000000-0000-0000-0000-000000000010'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000011'
const OTHER_DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000012'
const HOSPITAL_USER_ID = '00000000-0000-0000-0000-000000000021'

const doctorToken = { id: DOCTOR_USER_ID, role: 'DOCTOR' }
const patientToken = { id: PATIENT_USER_ID, role: 'PATIENT' }
const hospitalToken = { id: HOSPITAL_USER_ID, role: 'HOSPITAL' }

function consultation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSULT_ID,
    doctorId: DOCTOR_ID,
    hospitalId: null,
    patientId: PATIENT_ID,
    status: 'REQUESTED',
    ...overrides,
  }
}

async function callHandler(handler: any, method: string, body: unknown, token: Record<string, unknown> | null, query: Record<string, unknown> = { id: CONSULT_ID }) {
  mockGetToken.mockResolvedValue(token)
  const req = createRequest({ method: method as any, query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
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
  mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: PATIENT_USER_ID })
  mockPrisma.consent.findFirst.mockResolvedValue(null)
  mockPrisma.accessAudit.findFirst.mockResolvedValue(null)
  mockPrisma.accessAudit.create.mockResolvedValue({})
})

describe('GET /api/consultations/[id]', () => {
  test('assigned doctor can view the consultation', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      consultation({
        doctor: { id: DOCTOR_ID, userId: DOCTOR_USER_ID },
        patient: { id: PATIENT_ID, userId: PATIENT_USER_ID },
      })
    )

    const result = await callHandler(getHandler, 'GET', null, doctorToken)

    expect(result.status).toBe(200)
    expect(result.body.consultation.id).toBe(CONSULT_ID)
  })

  test('owning patient can view the consultation', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      consultation({
        doctor: { id: DOCTOR_ID, userId: DOCTOR_USER_ID },
        patient: { id: PATIENT_ID, userId: PATIENT_USER_ID },
      })
    )

    const result = await callHandler(getHandler, 'GET', null, patientToken)

    expect(result.status).toBe(200)
  })

  test('hospital with a join authorization audit can view', async () => {
    mockPrisma.consent.findFirst.mockResolvedValue(null)
    mockPrisma.accessAudit.findFirst.mockResolvedValue({
      id: 'audit-1',
      actorId: HOSPITAL_USER_ID,
      consultationId: CONSULT_ID,
      action: 'CONSULTATION_JOIN_ALLOWED',
    })
    mockPrisma.consultation.findUnique.mockResolvedValue(
      consultation({
        doctor: { id: DOCTOR_ID, userId: DOCTOR_USER_ID },
        patient: { id: PATIENT_ID, userId: PATIENT_USER_ID },
      })
    )

    const result = await callHandler(getHandler, 'GET', null, hospitalToken)

    expect(result.status).toBe(200)
    expect(mockPrisma.accessAudit.findFirst).toHaveBeenCalled()
  })

  test('unauthenticated request returns 401', async () => {
    const result = await callHandler(getHandler, 'GET', null, null)

    expect(result.status).toBe(401)
  })

  test('missing user id returns 401', async () => {
    const result = await callHandler(getHandler, 'GET', null, { role: 'DOCTOR' })

    expect(result.status).toBe(401)
  })

  test('another patient cannot view the consultation', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      consultation({
        doctor: { id: DOCTOR_ID, userId: DOCTOR_USER_ID },
        patient: { id: PATIENT_ID, userId: PATIENT_USER_ID },
      })
    )

    const result = await callHandler(
      getHandler,
      'GET',
      null,
      { id: OTHER_PATIENT_USER_ID, role: 'PATIENT' }
    )

    expect(result.status).toBe(403)
  })

  test('unrelated doctor without consent cannot view', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      consultation({
        doctor: { id: DOCTOR_ID, userId: DOCTOR_USER_ID },
        patient: { id: PATIENT_ID, userId: PATIENT_USER_ID },
      })
    )
    mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'other-doctor', userId: OTHER_DOCTOR_USER_ID })
    mockPrisma.consent.findFirst.mockResolvedValue(null)

    const result = await callHandler(
      getHandler,
      'GET',
      null,
      { id: OTHER_DOCTOR_USER_ID, role: 'DOCTOR' }
    )

    expect(result.status).toBe(403)
  })

  test('hospital without a join authorization audit cannot view', async () => {
    mockPrisma.accessAudit.findFirst.mockResolvedValue(null)
    mockPrisma.consultation.findUnique.mockResolvedValue(
      consultation({
        doctor: { id: DOCTOR_ID, userId: DOCTOR_USER_ID },
        patient: { id: PATIENT_ID, userId: PATIENT_USER_ID },
      })
    )

    const result = await callHandler(getHandler, 'GET', null, hospitalToken)

    expect(result.status).toBe(403)
  })

  test('missing consultation returns 404', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(null)

    const result = await callHandler(getHandler, 'GET', null, doctorToken)

    expect(result.status).toBe(404)
  })
})

describe('POST /api/consultations/[id]/request', () => {
  test('owning patient can request the consultation', async () => {
    const result = await callHandler(
      requestHandler,
      'POST',
      { reason: 'Fever for three days' },
      patientToken
    )

    expect(result.status).toBe(200)
    expect(result.body.consultation.status).toBe('REQUESTED')
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CONSULTATION_REQUESTED',
          actorId: PATIENT_USER_ID,
          actorRole: 'PATIENT',
        }),
      })
    )
  })

  test('unauthenticated request returns 401', async () => {
    const result = await callHandler(requestHandler, 'POST', { reason: 'x' }, null)

    expect(result.status).toBe(401)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('non-patient role is forbidden', async () => {
    const result = await callHandler(requestHandler, 'POST', { reason: 'x' }, doctorToken)

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('patient without ownership cannot request the consultation', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({ id: 'other-patient', userId: OTHER_PATIENT_USER_ID })

    const result = await callHandler(
      requestHandler,
      'POST',
      { reason: 'x' },
      { id: OTHER_PATIENT_USER_ID, role: 'PATIENT' }
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('invalid body is rejected', async () => {
    const result = await callHandler(requestHandler, 'POST', { reason: 12345 }, patientToken)

    expect(result.status).toBe(400)
    expect(result.body.error).toBe('invalid')
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('missing consultation returns 404', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(null)

    const result = await callHandler(requestHandler, 'POST', { reason: 'x' }, patientToken)

    expect(result.status).toBe(404)
  })

  test('non-POST requests are rejected', async () => {
    const result = await callHandler(requestHandler, 'GET', null, patientToken)

    expect(result.status).toBe(405)
  })
})

describe('POST /api/consultations/[id]/start', () => {
  test('assigned doctor can start the consultation', async () => {
    const result = await callHandler(startHandler, 'POST', null, doctorToken)

    expect(result.status).toBe(200)
    expect(result.body.consultation.status).toBe('IN_PROGRESS')
    expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      })
    )
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CONSULTATION_STARTED',
          actorId: DOCTOR_USER_ID,
          actorRole: 'DOCTOR',
        }),
      })
    )
  })

  test('hospital/ops can start an assigned consultation (existing behavior)', async () => {
    const result = await callHandler(startHandler, 'POST', null, hospitalToken)

    expect(result.status).toBe(200)
    expect(result.body.consultation.status).toBe('IN_PROGRESS')
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: HOSPITAL_USER_ID, actorRole: 'HOSPITAL' }),
      })
    )
  })

  test('unauthenticated request returns 401', async () => {
    const result = await callHandler(startHandler, 'POST', null, null)

    expect(result.status).toBe(401)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('missing user id returns 401', async () => {
    const result = await callHandler(startHandler, 'POST', null, { role: 'DOCTOR' })

    expect(result.status).toBe(401)
  })

  test('patient role cannot start a consultation', async () => {
    const result = await callHandler(startHandler, 'POST', null, patientToken)

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('non-assigned doctor cannot start', async () => {
    const result = await callHandler(
      startHandler,
      'POST',
      null,
      { id: OTHER_DOCTOR_USER_ID, role: 'DOCTOR' }
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('unassigned consultation returns 409', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(consultation({ doctorId: null }))

    const result = await callHandler(startHandler, 'POST', null, doctorToken)

    expect(result.status).toBe(409)
    expect(result.body.error).toBe('consultation_unassigned')
  })
})