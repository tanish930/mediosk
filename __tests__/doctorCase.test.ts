import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    doctor: { findUnique: jest.fn() },
    consultation: { findUnique: jest.fn() },
    consent: { findFirst: jest.fn() },
    medicalSummary: { findMany: jest.fn() },
    medicalDocument: { findMany: jest.fn() },
    medicalTimeline: { findMany: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import doctorCaseHandler from '../src/pages/api/doctor/case/[id]'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const DOCTOR_ID = '00000000-0000-0000-0000-000000000200'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000201'
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000210'
const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const SESSION_ID = '00000000-0000-0000-0000-000000000110'
const OTHER_SESSION_ID = '00000000-0000-0000-0000-000000000111'

const doctorToken = { id: DOCTOR_USER_ID, role: 'DOCTOR' }

async function callHandler(method: string, query: Record<string, unknown> = {}) {
  const req = createRequest({ method: method as any, query }) as unknown as NextApiRequest
  const res = createResponse()
  await doctorCaseHandler(req as any, res as any)
  await new Promise((r) => setImmediate(r))
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue(doctorToken)
  mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
  mockPrisma.medicalSummary.findMany.mockResolvedValue([])
  mockPrisma.medicalDocument.findMany.mockResolvedValue([])
  mockPrisma.medicalTimeline.findMany.mockResolvedValue([])
  mockPrisma.consent.findFirst.mockResolvedValue(null)
})

function mockConsultation(sessionId: string | null) {
  const consultation = {
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    sessionId,
    status: 'PENDING',
    patient: { user: { name: 'Test', email: 'test@test.com' }, dob: null, gender: null, summaries: [], timelines: [] },
    session: null,
  }
  mockPrisma.consultation.findUnique.mockResolvedValue(consultation)
  return consultation
}

describe('GET /api/doctor/case/[id]', () => {
  test('returns only the current consultation session documents', async () => {
    mockConsultation(SESSION_ID)
    const currentDoc = { id: 'doc-current', title: 'Current Session Doc', extractions: [] }
    mockPrisma.medicalDocument.findMany.mockResolvedValue([currentDoc])

    const res = await callHandler('GET', { id: CONSULTATION_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.medicalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patientId: PATIENT_ID, preConsultationSessionId: SESSION_ID }),
      })
    )
    expect(body.documents).toEqual([currentDoc])
  })

  test('previous session documents are not included', async () => {
    mockConsultation(OTHER_SESSION_ID)
    const previousDoc = { id: 'doc-old', title: 'Old Session Doc', extractions: [] }
    mockPrisma.medicalDocument.findMany.mockResolvedValue([previousDoc])

    const res = await callHandler('GET', { id: CONSULTATION_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.medicalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patientId: PATIENT_ID, preConsultationSessionId: OTHER_SESSION_ID }),
      })
    )
    expect(body.documents).toEqual([previousDoc])
    expect(body.documents.every((d: any) => d.id !== 'doc-current')).toBe(true)
  })

  test('consultation without a pre-consultation session returns empty documents', async () => {
    mockConsultation(null)

    const res = await callHandler('GET', { id: CONSULTATION_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.medicalDocument.findMany).not.toHaveBeenCalled()
    expect(body.documents).toEqual([])
  })

  test('consultation response does not leak the full patient documents array', async () => {
    mockConsultation(SESSION_ID)

    const res = await callHandler('GET', { id: CONSULTATION_ID })
    const body = res._getJSONData()

    expect(body.consultation?.patient?.documents).toBeUndefined()
  })

  test('unauthenticated request returns 401', async () => {
    mockGetToken.mockResolvedValue(null)

    const res = await callHandler('GET', { id: CONSULTATION_ID })

    expect(res.statusCode).toBe(401)
  })

  test('non-doctor role returns 403', async () => {
    mockGetToken.mockResolvedValue({ id: 'u-1', role: 'PATIENT' })

    const res = await callHandler('GET', { id: CONSULTATION_ID })

    expect(res.statusCode).toBe(403)
  })

  test('unauthorized doctor (no assignment/consent) returns 403', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue({
      ...mockConsultation(SESSION_ID),
      doctorId: 'other-doctor',
    })
    mockPrisma.consent.findFirst.mockResolvedValue(null)

    const res = await callHandler('GET', { id: CONSULTATION_ID })

    expect(res.statusCode).toBe(403)
  })
})