import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    preConsultationSession: { findUnique: jest.fn() },
    preConsultationReport: { create: jest.fn() },
    $transaction: jest.fn(),
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

describe('Emergency unification (severity >= 9) in /api/patient/preconsult/session/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue({ id: PATIENT_USER_ID, role: 'PATIENT' })
    mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: PATIENT_USER_ID })
  })

  function answeredQuestions(severityValue: unknown) {
    return [
      { id: 'q-sev', key: 'severity', answered: true, answer: { value: severityValue } },
      { id: 'q-cc', key: 'chief_complaint', answered: true, answer: { value: 'mild headache' } },
    ]
  }

  test('GET surfaces EMERGENCY for a severity >= 9 answer', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      patientId: PATIENT_ID,
      complaint: 'mild headache',
      status: 'IN_PROGRESS',
      language: 'en',
      questions: answeredQuestions(9),
      report: null,
    })
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(200)
    expect(res._getJSONData().redFlag.severity).toBe('EMERGENCY')
  })

  test('GET does not escalate a severity below 9', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      patientId: PATIENT_ID,
      complaint: 'mild headache',
      status: 'IN_PROGRESS',
      language: 'en',
      questions: answeredQuestions(5),
      report: null,
    })
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(200)
    expect(res._getJSONData().redFlag).toBeNull()
  })

  test('GET keeps keyword-based multilingual red flags intact', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      patientId: PATIENT_ID,
      complaint: '',
      status: 'IN_PROGRESS',
      language: 'hi',
      questions: [
        { id: 'q-cc', key: 'chief_complaint', answered: true, answer: { value: 'मुझे सीने में दर्द नहीं है' } },
      ],
      report: null,
    })
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(200)
    expect(res._getJSONData().redFlag).toBeNull()
  })

  test('PUT persists a severity >= 9 result as an emergency red flag', async () => {
    const current = {
      id: SESSION_ID,
      patientId: PATIENT_ID,
      complaint: 'mild headache',
      language: 'en',
      mode: 'GENERAL',
      status: 'IN_PROGRESS',
      report: null,
      questions: answeredQuestions(9),
    }
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(current)
    const createdReport = {
      id: 'report-1',
      sessionId: SESSION_ID,
      chiefComplaint: 'mild headache',
      severity: '9',
      redFlags: ['severity 9 or higher'],
    }
    mockPrisma.preConsultationReport.create.mockResolvedValue(createdReport)
    const txFindUnique = jest.fn().mockResolvedValue(current)
    mockPrisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        preConsultationSession: {
          findUnique: txFindUnique,
          update: jest.fn().mockResolvedValue({ ...current, status: 'COMPLETED' }),
        },
        preConsultationReport: { create: mockPrisma.preConsultationReport.create },
      })
    )

    const res = await callHandler('PUT')
    expect(res.statusCode).toBe(200)
    const body = res._getJSONData()
    expect(body.ok).toBe(true)
    expect(mockPrisma.preConsultationReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: SESSION_ID,
        severity: '9',
        redFlags: expect.arrayContaining(['severity 9 or higher']),
      }),
    })
  })

  test('PUT stores keyword matches as red flags when keywords match', async () => {
    const current = {
      id: SESSION_ID,
      patientId: PATIENT_ID,
      complaint: 'chest pain since morning',
      language: 'en',
      mode: 'GENERAL',
      status: 'IN_PROGRESS',
      report: null,
      questions: [
        { id: 'q-skip', key: 'severity', answered: false, answer: null },
      ],
    }
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(current)
    const createdReport = {
      id: 'report-1',
      sessionId: SESSION_ID,
      chiefComplaint: 'chest pain since morning',
      redFlags: ['chest pain'],
    }
    mockPrisma.preConsultationReport.create.mockResolvedValue(createdReport)
    mockPrisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        preConsultationSession: {
          findUnique: jest.fn().mockResolvedValue(current),
          update: jest.fn().mockResolvedValue({ ...current, status: 'COMPLETED' }),
        },
        preConsultationReport: { create: mockPrisma.preConsultationReport.create },
      })
    )

    const res = await callHandler('PUT')
    expect(res.statusCode).toBe(200)
    expect(mockPrisma.preConsultationReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: SESSION_ID,
        redFlags: expect.arrayContaining(['chest pain']),
      }),
    })
  })
})