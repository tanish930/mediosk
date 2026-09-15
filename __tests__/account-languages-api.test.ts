import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
}))

import { getSession } from 'next-auth/react'
import languagesHandler from '../src/pages/api/account/languages'
import activityHandler from '../src/pages/api/account/activity'
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, isValidLanguage, getLanguageLabel } from '../src/lib/languages'

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    accessAudit: { findMany: jest.fn() },
  },
}))

import { prisma } from '../src/lib/prisma'

const mockGetSession = getSession as jest.Mock
const mockAudit = prisma.accessAudit as any

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1', role: 'PATIENT' } })
  mockAudit.findMany.mockResolvedValue([
    { action: 'PASSWORD_CHANGED', note: 'Password updated', createdAt: new Date('2026-09-01T00:00:00Z') },
    { action: 'ACCOUNT_UPDATED', note: 'Account profile updated', createdAt: new Date('2026-09-02T00:00:00Z') },
  ])
})

describe('GET /api/account/languages', () => {
  test('returns the supported language list', async () => {
    const req = createRequest({ method: 'GET' }) as unknown as NextApiRequest
    const res = createResponse()
    await languagesHandler(req as any, res as any)
    expect(res.statusCode).toBe(200)
    const body = res._getJSONData()
    expect(body.languages).toEqual(SUPPORTED_LANGUAGES)
    expect(body.default).toBe(DEFAULT_LANGUAGE)
    expect(body.languages.map((l: any) => l.code)).toEqual(['en', 'mr', 'hi'])
  })

  test('rejects unauthenticated requests', async () => {
    mockGetSession.mockResolvedValue(null)
    const req = createRequest({ method: 'GET' }) as unknown as NextApiRequest
    const res = createResponse()
    await languagesHandler(req as any, res as any)
    expect(res.statusCode).toBe(401)
  })

  test('the API list is the single source of truth used by validation helpers', () => {
    for (const l of SUPPORTED_LANGUAGES) expect(isValidLanguage(l.code)).toBe(true)
    expect(isValidLanguage('xx')).toBe(false)
    expect(isValidLanguage('')).toBe(false)
    expect(getLanguageLabel('mr')).toBe('Marathi')
    expect(getLanguageLabel('fr')).toBeNull()
  })
})

describe('GET /api/account/activity', () => {
  test('returns only the authenticated user own recent records, limited to 50, safe fields only', async () => {
    const req = createRequest({ method: 'GET' }) as unknown as NextApiRequest
    const res = createResponse()
    await activityHandler(req as any, res as any)
    expect(res.statusCode).toBe(200)
    const body = res._getJSONData()
    expect(body.activities).toHaveLength(2)
    const safe = JSON.stringify(body)
    expect(safe).not.toContain('hashedPassword')
    expect(mockAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actorId: 'u1' }, take: 50, orderBy: { createdAt: 'desc' } })
    )
  })

  test('rejects unauthenticated requests', async () => {
    mockGetSession.mockResolvedValue(null)
    const req = createRequest({ method: 'GET' }) as unknown as NextApiRequest
    const res = createResponse()
    await activityHandler(req as any, res as any)
    expect(res.statusCode).toBe(401)
    expect(mockAudit.findMany).not.toHaveBeenCalled()
  })
})