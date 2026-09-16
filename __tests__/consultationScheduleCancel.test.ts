import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    consultation: { findUnique: jest.fn(), update: jest.fn() },
    doctor: { findUnique: jest.fn() },
    hospital: { findUnique: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import scheduleHandler from '../src/pages/api/consultations/[id]/schedule'
import cancelHandler from '../src/pages/api/consultations/[id]/cancel'

const mockGetSession = getSession as jest.Mock
const mockPrisma = prisma as any

const CONSULT_ID = '00000000-0000-0000-0000-000000000001'
const PATIENT_ID = '00000000-0000-0000-0000-000000000002'
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000003'
const OTHER_PATIENT_USER_ID = '00000000-0000-0000-0000-000000000004'
const DOCTOR_ID = '00000000-0000-0000-0000-000000000010'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000011'
const OTHER_DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000012'
const HOSPITAL_ID = '00000000-0000-0000-0000-000000000020'
const HOSPITAL_USER_ID = '00000000-0000-0000-0000-000000000021'
const OTHER_HOSPITAL_USER_ID = '00000000-0000-0000-0000-000000000022'

function consultation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSULT_ID,
    doctorId: DOCTOR_ID,
    hospitalId: HOSPITAL_ID,
    patientId: PATIENT_ID,
    status: 'REQUESTED',
    patient: { id: PATIENT_ID, userId: PATIENT_USER_ID, user: { id: PATIENT_USER_ID } },
    ...overrides,
  }
}

async function callHandler(handler: any, method: string, body: unknown, token: Record<string, unknown> | null, query: Record<string, unknown> = { id: CONSULT_ID }) {
  mockGetSession.mockResolvedValue(token)
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
  mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
  mockPrisma.accessAudit.create.mockResolvedValue({})
})

describe('PATCH /api/consultations/[id]/schedule', () => {
  test('assigned doctor can schedule the consultation', async () => {
    const result = await callHandler(
      scheduleHandler,
      'PATCH',
      { scheduledAt: '2026-09-20T10:30:00.000Z' },
      { user: { id: DOCTOR_USER_ID, role: 'DOCTOR' } }
    )

    expect(result.status).toBe(200)
    expect(result.body.consultation.status).toBe('SCHEDULED')
    expect(mockPrisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SCHEDULED', scheduledAt: expect.any(Date) }),
      })
    )
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CONSULTATION_SCHEDULED' }) })
    )
  })

  test('owning hospital can schedule the assigned consultation', async () => {
    const result = await callHandler(
      scheduleHandler,
      'PATCH',
      { scheduledAt: '2026-09-20T10:30:00.000Z' },
      { user: { id: HOSPITAL_USER_ID, role: 'HOSPITAL' } }
    )

    expect(result.status).toBe(200)
    expect(result.body.consultation.status).toBe('SCHEDULED')
  })

  test('unassigned doctor cannot schedule', async () => {
    mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'other-doctor', userId: OTHER_DOCTOR_USER_ID })

    const result = await callHandler(
      scheduleHandler,
      'PATCH',
      { scheduledAt: '2026-09-20T10:30:00.000Z' },
      { user: { id: OTHER_DOCTOR_USER_ID, role: 'DOCTOR' } }
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('non-owning hospital cannot schedule', async () => {
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'other-hospital', userId: OTHER_HOSPITAL_USER_ID })

    const result = await callHandler(
      scheduleHandler,
      'PATCH',
      { scheduledAt: '2026-09-20T10:30:00.000Z' },
      { user: { id: OTHER_HOSPITAL_USER_ID, role: 'HOSPITAL' } }
    )

    expect(result.status).toBe(403)
  })

  test('unassigned consultation returns 409', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(consultation({ doctorId: null }))

    const result = await callHandler(
      scheduleHandler,
      'PATCH',
      { scheduledAt: '2026-09-20T10:30:00.000Z' },
      { user: { id: DOCTOR_USER_ID, role: 'DOCTOR' } }
    )

    expect(result.status).toBe(409)
  })

  test('patient role is forbidden', async () => {
    const result = await callHandler(
      scheduleHandler,
      'PATCH',
      { scheduledAt: '2026-09-20T10:30:00.000Z' },
      { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }
    )

    expect(result.status).toBe(403)
  })
})

describe('POST /api/consultations/[id]/cancel', () => {
  test('owning patient can cancel a requested consultation', async () => {
    const result = await callHandler(
      cancelHandler,
      'POST',
      {},
      { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }
    )

    expect(result.status).toBe(200)
    expect(result.body.consultation.status).toBe('CANCELLED')
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CONSULTATION_CANCELLED' }) })
    )
  })

  test('assigned doctor can cancel a ready consultation', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(consultation({ status: 'READY' }))

    const result = await callHandler(
      cancelHandler,
      'POST',
      {},
      { user: { id: DOCTOR_USER_ID, role: 'DOCTOR' } }
    )

    expect(result.status).toBe(200)
    expect(result.body.consultation.status).toBe('CANCELLED')
  })

  test('owning hospital can cancel a scheduled consultation', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(consultation({ status: 'SCHEDULED' }))

    const result = await callHandler(
      cancelHandler,
      'POST',
      {},
      { user: { id: HOSPITAL_USER_ID, role: 'HOSPITAL' } }
    )

    expect(result.status).toBe(200)
    expect(result.body.consultation.status).toBe('CANCELLED')
  })

  test('another patient cannot cancel the consultation', async () => {
    const result = await callHandler(
      cancelHandler,
      'POST',
      {},
      { user: { id: OTHER_PATIENT_USER_ID, role: 'PATIENT' } }
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('unassigned doctor cannot cancel', async () => {
    mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'other-doctor', userId: OTHER_DOCTOR_USER_ID })

    const result = await callHandler(
      cancelHandler,
      'POST',
      {},
      { user: { id: OTHER_DOCTOR_USER_ID, role: 'DOCTOR' } }
    )

    expect(result.status).toBe(403)
  })

  test('non-owning hospital cannot cancel', async () => {
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'other-hospital', userId: OTHER_HOSPITAL_USER_ID })

    const result = await callHandler(
      cancelHandler,
      'POST',
      {},
      { user: { id: OTHER_HOSPITAL_USER_ID, role: 'HOSPITAL' } }
    )

    expect(result.status).toBe(403)
  })

  test('in-progress consultation cannot be cancelled', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(consultation({ status: 'IN_PROGRESS' }))

    const result = await callHandler(
      cancelHandler,
      'POST',
      {},
      { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }
    )

    expect(result.status).toBe(409)
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled()
  })

  test('completed consultation cannot be cancelled', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(consultation({ status: 'COMPLETED' }))

    const result = await callHandler(
      cancelHandler,
      'POST',
      {},
      { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }
    )

    expect(result.status).toBe(409)
  })

  test('missing consultation returns 404', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(null)

    const result = await callHandler(
      cancelHandler,
      'POST',
      {},
      { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }
    )

    expect(result.status).toBe(404)
  })

  test('unauthenticated request returns 401', async () => {
    const result = await callHandler(cancelHandler, 'POST', {}, null)

    expect(result.status).toBe(401)
  })
})