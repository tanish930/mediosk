import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/react', () => ({ getSession: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    consultation: { findMany: jest.fn() },
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import handler from '../src/pages/api/patient/consultations'

const mockGetSession = getSession as jest.Mock
const mockPrisma = prisma as any

const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000101'

const session = { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }

function makeConsultation(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000210',
    status: 'REQUESTED',
    scheduledAt: null,
    createdAt: new Date().toISOString(),
    doctor: { user: { name: 'Dr. A', email: 'a@example.com' } },
    hospital: { user: { name: 'City Hospital' }, address: 'Street 1' },
    ...overrides,
  }
}

async function callHandler(method = 'GET', query: Record<string, unknown> = {}) {
  const req = createRequest({ method: method as any, query }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue(session)
  mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: PATIENT_USER_ID })
})

describe('GET /api/patient/consultations', () => {
  test('returns all consultation statuses so the dashboard can show history', async () => {
    const consultations = [
      makeConsultation({ id: 'a', status: 'COMPLETED' }),
      makeConsultation({ id: 'b', status: 'CANCELLED' }),
      makeConsultation({ id: 'c', status: 'PENDING' }),
      makeConsultation({ id: 'd', status: 'IN_PROGRESS' }),
      makeConsultation({ id: 'e', status: 'READY' }),
      makeConsultation({ id: 'f', status: 'REQUESTED' }),
      makeConsultation({ id: 'g', status: 'SCHEDULED' }),
    ]
    mockPrisma.consultation.findMany.mockResolvedValue(consultations)

    const res = await callHandler()
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.consultations).toHaveLength(7)
    expect(mockPrisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: PATIENT_ID },
        orderBy: { createdAt: 'desc' },
        include: expect.objectContaining({
          doctor: expect.objectContaining({ include: expect.objectContaining({ user: true }) }),
          hospital: expect.objectContaining({ include: expect.objectContaining({ user: true }) }),
        }),
      })
    )
  })

  test('defaults to an empty list when nothing is returned', async () => {
    mockPrisma.consultation.findMany.mockResolvedValue([])
    const res = await callHandler()
    expect(res._getJSONData().consultations).toEqual([])
  })

  test('unauthenticated request returns 401', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await callHandler()
    expect(res.statusCode).toBe(401)
  })

  test('non-patient role is forbidden', async () => {
    mockGetSession.mockResolvedValue({ user: { id: PATIENT_USER_ID, role: 'DOCTOR' } })
    const res = await callHandler()
    expect(res.statusCode).toBe(403)
  })

  test('patient without a profile returns 404', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null)
    const res = await callHandler()
    expect(res.statusCode).toBe(404)
  })

  test('non-GET method is rejected with 405', async () => {
    const res = await callHandler('POST')
    expect(res.statusCode).toBe(405)
  })
})