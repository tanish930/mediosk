import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'
import { encode } from 'next-auth/jwt'

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { prisma } from '../src/lib/prisma'
import accountHandler from '../src/pages/api/account/index'
import passwordHandler from '../src/pages/api/account/password'
import { hashPassword } from '../src/lib/password'

const SECRET = 'account-auth-mechanism-test-secret-0123456789'
const COOKIE_NAME = 'next-auth.session-token'

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

async function signToken(token: Record<string, unknown>) {
  return encode({ token, secret: SECRET })
}

async function callHandler(
  handler: (req: NextApiRequest, res: NextApiResponse) => unknown,
  method: string,
  body: unknown,
  jwt: string | null
) {
  const cookies: Record<string, string> = {}
  if (jwt !== null) cookies[COOKIE_NAME] = jwt
  const req = createRequest({
    method: method as any,
    body: body as any,
    cookies,
  }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return { status: res.statusCode, body: res._getJSONData() }
}

describe('account auth mechanism (real JWT decode, no mocks)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXTAUTH_SECRET = SECRET
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    mockUser.findUnique.mockResolvedValue({ ...BASE_USER })
    mockUser.update.mockResolvedValue({ ...BASE_USER })
    mockAudit.create.mockResolvedValue({ id: 'audit-1' })
  })

  test('authenticated PUT /api/account/password reaches validation instead of 401', async () => {
    const jwt = await signToken({ id: 'u1', role: 'PATIENT', name: 'Test User', email: 'test@mediosk.demo' })
    const result = await callHandler(passwordHandler, 'PUT', { newPassword: 'NewPass@123' }, jwt)
    expect(result.status).toBe(400)
    expect(result.body.error).toBe('Invalid body')
    expect(result.body.errors.currentPassword).toBeDefined()
  })

  test('authenticated PUT /api/account/password can change the password end to end', async () => {
    const currentHash = await hashPassword('OldPass@123')
    mockUser.findUnique.mockResolvedValue({ ...BASE_USER, hashedPassword: currentHash })
    mockUser.update.mockImplementation((args: any) =>
      Promise.resolve({ ...BASE_USER, hashedPassword: args.data.hashedPassword })
    )

    const jwt = await signToken({ id: 'u1', role: 'PATIENT' })
    const result = await callHandler(
      passwordHandler,
      'PUT',
      { currentPassword: 'OldPass@123', newPassword: 'NewPass@123', confirmPassword: 'NewPass@123' },
      jwt
    )
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true })
  })

  test('authenticated PUT /api/account updates the account', async () => {
    mockUser.update.mockResolvedValue({ ...BASE_USER, name: 'Updated Name' })
    const jwt = await signToken({ id: 'u1', role: 'PATIENT' })
    const result = await callHandler(accountHandler, 'PUT', { name: 'Updated Name' }, jwt)
    expect(result.status).toBe(200)
    expect(result.body.account.name).toBe('Updated Name')
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'Updated Name' } })
  })

  test('authenticated GET /api/account still works', async () => {
    const jwt = await signToken({ id: 'u1', role: 'PATIENT' })
    const result = await callHandler(accountHandler, 'GET', undefined, jwt)
    expect(result.status).toBe(200)
    expect(result.body.account.id).toBe('u1')
  })

  test('a body cannot redirect identity to another user or role', async () => {
    const jwt = await signToken({ id: 'u1', role: 'PATIENT' })
    const result = await callHandler(
      accountHandler,
      'PUT',
      { name: 'Updated Name', id: 'u999', email: 'hacker@mediosk.demo', role: 'HOSPITAL' },
      jwt
    )
    expect(result.status).toBe(200)
    const arg: any = mockUser.update.mock.calls[0][0]
    expect(arg.where.id).toBe('u1')
    expect(arg.data.email).toBeUndefined()
    expect(arg.data.role).toBeUndefined()
  })

  test('missing session cookie stays 401', async () => {
    const result = await callHandler(passwordHandler, 'PUT', { newPassword: 'NewPass@123' }, null)
    expect(result.status).toBe(401)
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('a token signed with the wrong secret stays 401', async () => {
    const wrongJwt = await encode({
      token: { id: 'u1', role: 'PATIENT' },
      secret: 'a-completely-different-secret-value-9876543210',
    })
    const result = await callHandler(accountHandler, 'PUT', { name: 'Updated' }, wrongJwt)
    expect(result.status).toBe(401)
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('a corrupted token stays 401', async () => {
    const result = await callHandler(accountHandler, 'PUT', { name: 'Updated' }, 'not-a-real-jwt')
    expect(result.status).toBe(401)
    expect(mockUser.update).not.toHaveBeenCalled()
  })
})