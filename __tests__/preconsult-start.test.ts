import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    consultation: { findFirst: jest.fn(), create: jest.fn() },
    preConsultationSession: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    sessionQuestion: { create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import handler from '../src/pages/api/patient/preconsult/start'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000101'
const NEW_SESSION_ID = '00000000-0000-0000-0000-000000000140'

function makeSession(overrides: Record<string, unknown> = {}) {
  return { id: NEW_SESSION_ID, patientId: PATIENT_ID, complaint: 'I have a headache for 3 days', domain: 'neurology', ...overrides }
}

async function callHandler(method = 'POST', body?: unknown) {
  const req = createRequest({ method: method as any, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue({ id: PATIENT_USER_ID, role: 'PATIENT' })
  mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: PATIENT_USER_ID })
  mockPrisma.consultation.findFirst.mockResolvedValue(null)
  mockPrisma.preConsultationSession.create.mockResolvedValue(makeSession())
  mockPrisma.sessionQuestion.create.mockResolvedValue({})
})

describe('POST /api/patient/preconsult/start', () => {
  test('creates a brand-new session owned by the authenticated patient', async () => {
    const res = await callHandler('POST', { complaint: 'I have a headache for 3 days' })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.sessionId).toBe(NEW_SESSION_ID)
    expect(body.domain).toBe('neurology')
    expect(mockPrisma.preConsultationSession.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.preConsultationSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ patientId: PATIENT_ID, complaint: 'I have a headache for 3 days', domain: 'neurology' }),
      })
    )
  })

  test('never reuses or mutates an existing session', async () => {
    const res = await callHandler('POST', { complaint: 'I have a headache for 3 days' })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.preConsultationSession.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.preConsultationSession.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.preConsultationSession.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.preConsultationSession.update).not.toHaveBeenCalled()
    expect(mockPrisma.consultation.create).not.toHaveBeenCalled()
  })

  test('multiple sessions can coexist (existing consultations do not block)', async () => {
    // Patient already has completed/cancelled consultations, none in progress
    const res = await callHandler('POST', { complaint: 'I have a headache for 3 days' })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.preConsultationSession.create).toHaveBeenCalledTimes(1)
  })

  test('blocks a new session while a consultation is IN_PROGRESS, server-side', async () => {
    mockPrisma.consultation.findFirst.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000200',
      status: 'IN_PROGRESS',
      patientId: PATIENT_ID,
    })

    const res = await callHandler('POST', { complaint: 'I have a headache for 3 days' })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(409)
    expect(body.error).toBe('ACTIVE_CONSULTATION_IN_PROGRESS')
    expect(mockPrisma.preConsultationSession.create).not.toHaveBeenCalled()
    expect(mockPrisma.sessionQuestion.create).not.toHaveBeenCalled()
    expect(mockPrisma.consultation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: PATIENT_ID, status: 'IN_PROGRESS' } })
    )
  })

  test('compaint shorter than 3 characters is rejected', async () => {
    const res = await callHandler('POST', { complaint: 'hi' })

    expect(res.statusCode).toBe(400)
    expect(mockPrisma.preConsultationSession.create).not.toHaveBeenCalled()
  })

  test('unauthenticated request returns 401', async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await callHandler('POST', { complaint: 'I have a headache for 3 days' })
    expect(res.statusCode).toBe(401)
    expect(mockPrisma.preConsultationSession.create).not.toHaveBeenCalled()
  })

  test('non-patient role is forbidden', async () => {
    mockGetToken.mockResolvedValue({ id: 'doctor-user', role: 'DOCTOR' })
    const res = await callHandler('POST', { complaint: 'I have a headache for 3 days' })
    expect(res.statusCode).toBe(403)
    expect(mockPrisma.preConsultationSession.create).not.toHaveBeenCalled()
  })

  test('patient without a profile returns 404', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null)
    const res = await callHandler('POST', { complaint: 'I have a headache for 3 days' })
    expect(res.statusCode).toBe(404)
  })

  test('non-POST method is rejected with 405', async () => {
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(405)
  })
})