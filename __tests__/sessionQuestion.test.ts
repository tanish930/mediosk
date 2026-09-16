import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    preConsultationSession: { findUnique: jest.fn() },
    sessionQuestion: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), createMany: jest.fn() },
    sessionAnswer: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import sessionHandler from '../src/pages/api/patient/preconsult/session/[id]'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const USER_ID = '00000000-0000-0000-0000-000000000201'
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000202'
const PATIENT_ID = '00000000-0000-0000-0000-000000000211'
const SID = '00000000-0000-0000-0000-000000000220'
const QID = '00000000-0000-0000-0000-000000000221'

type StoredRow = { sessionId: string; key: string; order: number }
let rows: StoredRow[] = []
let sessOverrides: Record<string, unknown> = {}
let refetchedQuestions: Array<Record<string, unknown>> | null = null

async function callHandler(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void, method: string, query: Record<string, unknown> = {}, body?: unknown) {
  const req = createRequest({ method: method as any, query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  rows = []
  sessOverrides = {}
  refetchedQuestions = null
  mockGetToken.mockResolvedValue({ id: USER_ID, role: 'PATIENT' })
  mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: USER_ID })

  const chiefQ = { id: QID, sessionId: SID, key: 'chief_complaint', text: 'CC', type: 'TEXT', answered: false, answer: null, order: 0 }
  // initial session lookup (has ordered questions + report): used for status/ownership
  // the POST re-fetch (questions include answer, no orderBy) returns the answered question
  mockPrisma.preConsultationSession.findUnique.mockImplementation((args: any) => {
    const inc = args.include
    if (inc && inc.questions && !inc.questions.orderBy) {
      return Promise.resolve({
        id: SID,
        patientId: PATIENT_ID,
        status: 'IN_PROGRESS',
        domain: sessOverrides.domain ?? 'respiratory',
        mode: sessOverrides.mode ?? 'GENERAL',
        complaint: sessOverrides.complaint ?? 'I have a cough',
        questions: refetchedQuestions ?? [{ ...chiefQ, answered: true, answer: { id: 'a1', value: 'cough since 2 days' } }],
      })
    }
    return Promise.resolve({
      id: SID,
      patientId: PATIENT_ID,
      status: 'IN_PROGRESS',
      domain: sessOverrides.domain ?? 'respiratory',
      mode: sessOverrides.mode ?? 'GENERAL',
      complaint: sessOverrides.complaint ?? 'I have a cough',
      questions: [chiefQ],
      report: null,
    })
  })

  mockPrisma.sessionQuestion.findUnique.mockResolvedValue({ id: QID, sessionId: SID })
  mockPrisma.sessionAnswer.upsert.mockResolvedValue({ id: 'a1' })
  mockPrisma.sessionQuestion.update.mockResolvedValue({ id: QID, answered: true })

  const tx = {
    sessionAnswer: { upsert: mockPrisma.sessionAnswer.upsert },
    sessionQuestion: { update: mockPrisma.sessionQuestion.update },
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx))

  // Mimic the unique (sessionId, key) constraint exactly as the DB does now.
  mockPrisma.sessionQuestion.createMany.mockImplementation(({ data, skipDuplicates }: any) => {
    let count = 0
    for (const row of data) {
      const dup = rows.find((r) => r.sessionId === row.sessionId && r.key === row.key)
      if (dup) continue
      rows.push({ sessionId: row.sessionId, key: row.key, order: row.order })
      count += 1
    }
    return Promise.resolve({ count })
  })
})

describe('POST /api/patient/preconsult/session/[id] - adaptive next-question concurrency', () => {
  test('concurrent answers for the same question create only ONE next-question row per session/key', async () => {
    const payload = { questionId: QID, value: 'I have a cough since 2 days' }

    const [r1, r2] = await Promise.all([
      callHandler(sessionHandler, 'POST', { id: SID }, payload),
      callHandler(sessionHandler, 'POST', { id: SID }, payload),
    ])

    expect(r1.statusCode).toBe(200)
    expect(r2.statusCode).toBe(200)
    expect(r1._getJSONData()).toEqual({ ok: true, redFlag: null })
    expect(r2._getJSONData()).toEqual({ ok: true, redFlag: null })

    expect(mockPrisma.sessionQuestion.createMany).toHaveBeenCalledTimes(2)
    for (const call of mockPrisma.sessionQuestion.createMany.mock.calls) {
      expect(call[0].skipDuplicates).toBe(true)
      expect(call[0].data).toHaveLength(1)
      expect(call[0].data[0]).toMatchObject({ sessionId: SID, key: 'onset' })
    }

    const onsetRows = rows.filter((r) => r.sessionId === SID && r.key === 'onset')
    expect(onsetRows).toHaveLength(1)
    expect(mockPrisma.sessionQuestion.create).not.toHaveBeenCalled()
  })

  test('a single answer still creates the intended follow-up question exactly once', async () => {
    const res = await callHandler(sessionHandler, 'POST', { id: SID }, { questionId: QID, value: 'I have a cough since 2 days' })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.sessionQuestion.createMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.sessionQuestion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [expect.objectContaining({ sessionId: SID, key: 'onset', order: 1 })],
      })
    )
    expect(rows.filter((r) => r.sessionId === SID && r.key === 'onset')).toHaveLength(1)
    expect(mockPrisma.sessionQuestion.create).not.toHaveBeenCalled()
  })

  test('unauthenticated answer is rejected', async () => {
    mockGetToken.mockResolvedValue(null)

    const res = await callHandler(sessionHandler, 'POST', { id: SID }, { questionId: QID, value: 'x' })

    expect(res.statusCode).toBe(401)
    expect(mockPrisma.sessionQuestion.createMany).not.toHaveBeenCalled()
  })

  test('non-patient role is rejected', async () => {
    mockGetToken.mockResolvedValue({ id: OTHER_USER_ID, role: 'DOCTOR' })

    const res = await callHandler(sessionHandler, 'POST', { id: SID }, { questionId: QID, value: 'x' })

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.sessionQuestion.createMany).not.toHaveBeenCalled()
  })

  test("another patient's session is not reachable", async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(null)

    const res = await callHandler(sessionHandler, 'POST', { id: SID }, { questionId: QID, value: 'x' })

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.sessionQuestion.createMany).not.toHaveBeenCalled()
  })

  test('AYURVEDA sessions flow into patient-reported Ayurvedic history after the general core', async () => {
    sessOverrides = { domain: 'gastrointestinal', mode: 'AYURVEDA', complaint: 'Stomach pain' }
    const core = [
      'chief_complaint',
      'onset',
      'duration',
      'location',
      'severity',
      'character',
      'nausea_vomiting',
      'diarrhea',
      'associated_symptoms',
      'aggravating',
      'relieving',
    ].map((key, i) => ({
      id: `${QID}-${i}`,
      sessionId: SID,
      key,
      text: key,
      type: 'TEXT',
      answered: true,
      answer: { id: `a${i}`, value: 'skip' },
      order: i,
    }))
    refetchedQuestions = core

    const res = await callHandler(sessionHandler, 'POST', { id: SID }, { questionId: QID, value: 'pain since 2 days' })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.sessionQuestion.createMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.sessionQuestion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [expect.objectContaining({ sessionId: SID, key: 'ayush_nidana' })],
      })
    )
  })

  test('GENERAL sessions never receive Ayurvedic history questions', async () => {
    sessOverrides = { domain: 'gastrointestinal', mode: 'GENERAL', complaint: 'Stomach pain' }
    const core = [
      'chief_complaint',
      'onset',
      'duration',
      'location',
      'severity',
      'character',
      'nausea_vomiting',
      'diarrhea',
      'associated_symptoms',
      'aggravating',
      'relieving',
    ].map((key, i) => ({
      id: `${QID}-${i}`,
      sessionId: SID,
      key,
      text: key,
      type: 'TEXT',
      answered: true,
      answer: { id: `a${i}`, value: 'skip' },
      order: i,
    }))
    refetchedQuestions = core

    const res = await callHandler(sessionHandler, 'POST', { id: SID }, { questionId: QID, value: 'pain since 2 days' })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.sessionQuestion.createMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.sessionQuestion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ key: 'past_medical_history' })],
      })
    )
  })
})