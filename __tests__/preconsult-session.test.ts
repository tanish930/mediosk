import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    preConsultationSession: { findUnique: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import handler from '../src/pages/api/patient/preconsult/session/[id]'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000101'
const SESSION_ID = '00000000-0000-0000-0000-000000000140'

const sessionRec = {
  id: SESSION_ID,
  patientId: PATIENT_ID,
  complaint: 'headache',
  status: 'IN_PROGRESS',
  questions: [],
  report: null,
}

async function callHandler(method = 'GET', query: Record<string, unknown> = { id: SESSION_ID }) {
  const req = createRequest({ method: method as any, query }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue({ id: PATIENT_USER_ID, role: 'PATIENT' })
  mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: PATIENT_USER_ID })
  mockPrisma.preConsultationSession.findUnique.mockResolvedValue(sessionRec)
})

describe('GET /api/patient/preconsult/session/[id]', () => {
  test('owner can read their own session', async () => {
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(200)
    expect(res._getJSONData().session.id).toBe(SESSION_ID)
  })

  test("another patient's session returns 404 without leaking data", async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({ ...sessionRec, patientId: 'other-patient' })

    const res = await callHandler('GET')

    expect(res.statusCode).toBe(404)
    expect(res._getJSONData().session).toBeUndefined()
  })

  test('missing session returns 404', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(null)
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(404)
  })

  test('unauthenticated request returns 401', async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(401)
  })

  test('non-patient role is forbidden', async () => {
    mockGetToken.mockResolvedValue({ id: 'hospital-user', role: 'HOSPITAL' })
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(403)
  })
})