import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'
import { normalizeSummariesPayload, mergeCreatedSummary, SummaryLike } from '../src/lib/summaries'

jest.mock('next-auth/react', () => ({ getSession: jest.fn() }))
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    medicalSummary: { findMany: jest.fn(), create: jest.fn() },
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import summaryHandler from '../src/pages/api/patient/summary/index'

const mockGetSession = getSession as jest.Mock
const mockPrisma = prisma as any

const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const USER_ID = '00000000-0000-0000-0000-000000000101'

async function callHandler(method: string) {
  const req = createRequest({ method: method as any }) as unknown as NextApiRequest
  const res = createResponse()
  await summaryHandler(req as any, res as any)
  await new Promise((r) => setImmediate(r))
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: USER_ID, role: 'PATIENT' } })
  mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: USER_ID })
})

describe('GET /api/patient/summary', () => {
  test('returns an empty summaries array for a patient with no summaries', async () => {
    mockPrisma.medicalSummary.findMany.mockResolvedValue([])

    const res = await callHandler('GET')
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.summaries).toEqual([])
    expect(mockPrisma.medicalSummary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: PATIENT_ID } })
    )
  })

  test('returns all summaries for a patient with multiple summaries', async () => {
    const summaries = [
      { id: 'sum-1', status: 'COMPLETED', createdAt: new Date().toISOString() },
      { id: 'sum-2', status: 'PENDING', createdAt: new Date().toISOString() },
    ]
    mockPrisma.medicalSummary.findMany.mockResolvedValue(summaries)

    const res = await callHandler('GET')
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.summaries).toHaveLength(2)
  })

  test('unauthenticated request returns 401', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await callHandler('GET')

    expect(res.statusCode).toBe(401)
    expect(mockPrisma.medicalSummary.findMany).not.toHaveBeenCalled()
  })

  test('patient without a profile record returns 404', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null)

    const res = await callHandler('GET')

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/patient/summary', () => {
  test('creates a PENDING summary and returns it wrapped in { summary }', async () => {
    const created = { id: 'sum-new', status: 'PENDING' }
    mockPrisma.medicalSummary.create.mockResolvedValue(created)

    const res = await callHandler('POST')
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.summary).toEqual(created)
    expect(mockPrisma.medicalSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ patientId: PATIENT_ID, status: 'PENDING' }) })
    )
  })
})

describe('summary list contract (root cause regression)', () => {
  test('a payload without a summaries array must yield an empty list, not undefined', () => {
    const items = normalizeSummariesPayload({ error: 'Internal Server Error' })
    expect(items).toEqual([])
    expect(Array.isArray(items)).toBe(true)
  })

  test('undefined payload must yield an empty list', () => {
    expect(normalizeSummariesPayload(undefined)).toEqual([])
  })

  test('undefined/null entries are dropped so map() never dereferences undefined', () => {
    const payload = {
      summaries: [undefined, null, { id: 'ok', status: 'COMPLETED' }],
    }
    const items = normalizeSummariesPayload(payload)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('ok')
    // previously: for (const s of items) { s.status } threw
    // Cannot read properties of undefined (reading 'status')
    for (const s of items) {
      expect(typeof s.status).toBe('string')
    }
  })

  test('a failed create (payload without summary) must not prepend undefined', () => {
    const existing: SummaryLike[] = [{ id: 'a', status: 'PENDING' }]
    const next = mergeCreatedSummary(existing, undefined)
    expect(next).toEqual(existing)
    expect(next.every((s) => !!s && typeof s === 'object')).toBe(true)

    const nextError = mergeCreatedSummary(existing, { error: 'db down' })
    expect(nextError).toEqual(existing)
  })

  test('simulated page pipeline with an error response does not crash', () => {
    const items = normalizeSummariesPayload({ error: 'Patient not found' })
    const statuses = items.map((s) => s.status)
    expect(statuses).toEqual([])
  })
})