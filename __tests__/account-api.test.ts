import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import handler from '../src/pages/api/account/index'

const mockGetToken = getToken as jest.Mock
const mockUser = prisma.user as any
const mockAudit = prisma.accessAudit as any

const BASE_USER = {
  id: 'u1',
  name: 'Test User',
  email: 'test@mediosk.demo',
  role: 'PATIENT',
  preferredLanguage: 'en',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  deactivatedAt: null,
}

async function callHandler(method: string, body?: unknown) {
  const req = createRequest({ method: method as any, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue({ id: 'u1', role: 'PATIENT', name: 'Test User', email: 'test@mediosk.demo' })
  mockUser.findUnique.mockResolvedValue(BASE_USER)
  mockUser.update.mockResolvedValue(BASE_USER)
  mockAudit.create.mockResolvedValue({ id: 'audit-1' })
})

describe('GET /api/account', () => {
  test('returns the authenticated account with safe fields only', async () => {
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(200)
    const body = res._getJSONData()
    expect(body.account.id).toBe('u1')
    expect(body.account.name).toBe('Test User')
    expect(body.account.email).toBe('test@mediosk.demo')
    expect(body.account.role).toBe('PATIENT')
    expect(body.account.preferredLanguage).toBe('en')
    expect(body.account.createdAt).toBeDefined()
    expect(body.account.deactivatedAt).toBeNull()
    expect(body.account).not.toHaveProperty('hashedPassword')
    expect(body.account).not.toHaveProperty('password')
    expect(JSON.stringify(body)).not.toContain('hashedPassword')
  })

  test('rejects unauthenticated requests', async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(401)
    expect(mockUser.findUnique).not.toHaveBeenCalled()
  })
})

describe('PUT /api/account', () => {
  test('updates the account name', async () => {
    mockUser.update.mockResolvedValue({ ...BASE_USER, name: 'Updated Name' })
    const res = await callHandler('PUT', { name: 'Updated Name' })
    expect(res.statusCode).toBe(200)
    expect(res._getJSONData().account.name).toBe('Updated Name')
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'Updated Name' } })
  })

  test('updates the app language', async () => {
    mockUser.update.mockResolvedValue({ ...BASE_USER, preferredLanguage: 'mr' })
    const res = await callHandler('PUT', { preferredLanguage: 'mr' })
    expect(res.statusCode).toBe(200)
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { preferredLanguage: 'mr' } })
  })

  test('rejects unsupported languages', async () => {
    const res = await callHandler('PUT', { preferredLanguage: 'xx' })
    expect(res.statusCode).toBe(400)
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('rejects blank names', async () => {
    const res = await callHandler('PUT', { name: '   ' })
    expect(res.statusCode).toBe(400)
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('email from the body is never honoured', async () => {
    const res = await callHandler('PUT', { name: 'Updated Name', email: 'hacker@mediosk.demo', role: 'HOSPITAL', id: 'u999' })
    expect(res.statusCode).toBe(200)
    expect(mockUser.update).toHaveBeenCalledTimes(1)
    const arg: any = mockUser.update.mock.calls[0][0]
    expect(arg.where.id).toBe('u1')
    expect(arg.data.name).toBe('Updated Name')
    expect(arg.data.email).toBeUndefined()
    expect(arg.data.role).toBeUndefined()
  })

  test('writes an access audit record on every successful update', async () => {
    await callHandler('PUT', { preferredLanguage: 'hi' })
    expect(mockAudit.create).toHaveBeenCalledTimes(1)
    const arg: any = mockAudit.create.mock.calls[0][0]
    expect(arg.data.actorId).toBe('u1')
    expect(arg.data.action).toBe('ACCOUNT_UPDATED')
  })

  test('no audit record is written when validation fails', async () => {
    await callHandler('PUT', { preferredLanguage: 'xx' })
    expect(mockAudit.create).not.toHaveBeenCalled()
  })
})