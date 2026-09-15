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
import handler from '../src/pages/api/account/password'
import { hashPassword, verifyPassword } from '../src/lib/password'

const mockGetToken = getToken as jest.Mock
const mockUser = prisma.user as any
const mockAudit = prisma.accessAudit as any

async function callHandler(body?: unknown) {
  const req = createRequest({ method: 'PUT', body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

let CURRENT_HASH: string

beforeEach(async () => {
  jest.clearAllMocks()
  CURRENT_HASH = await hashPassword('OldPass@123')
  mockGetToken.mockResolvedValue({ id: 'u1', role: 'PATIENT', name: 'Test User', email: 'test@mediosk.demo' })
  mockUser.findUnique.mockResolvedValue({ id: 'u1', hashedPassword: CURRENT_HASH, role: 'PATIENT' })
  mockUser.update.mockResolvedValue({ id: 'u1', hashedPassword: 'new' })
  mockAudit.create.mockResolvedValue({ id: 'audit-1' })
})

describe('PUT /api/account/password', () => {
  test('requires authentication', async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await callHandler({ currentPassword: 'OldPass@123', newPassword: 'NewPass@123', confirmPassword: 'NewPass@123' })
    expect(res.statusCode).toBe(401)
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('current password is required', async () => {
    const res = await callHandler({ newPassword: 'NewPass@123', confirmPassword: 'NewPass@123' })
    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().errors.currentPassword).toBeDefined()
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('wrong current password is rejected', async () => {
    const res = await callHandler({ currentPassword: 'WrongPass@1', newPassword: 'NewPass@123', confirmPassword: 'NewPass@123' })
    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().errors.currentPassword).toBeDefined()
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('weak new password is rejected against the password policy', async () => {
    const res = await callHandler({ currentPassword: 'OldPass@123', newPassword: 'weakpass', confirmPassword: 'weakpass' })
    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().errors.newPassword).toBeDefined()
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('mismatched confirmation is rejected', async () => {
    const res = await callHandler({ currentPassword: 'OldPass@123', newPassword: 'NewPass@123', confirmPassword: 'Different@123' })
    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().errors.confirmPassword).toBeDefined()
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('reusing the current password is rejected', async () => {
    const res = await callHandler({ currentPassword: 'OldPass@123', newPassword: 'OldPass@123', confirmPassword: 'OldPass@123' })
    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().errors.newPassword).toBeDefined()
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  test('successful change hashes the new password and stores it', async () => {
    let storedHash = 'not-set'
    mockUser.update.mockImplementation((args: any) => {
      storedHash = args.data.hashedPassword
      return Promise.resolve({ id: 'u1', hashedPassword: storedHash })
    })

    const res = await callHandler({ currentPassword: 'OldPass@123', newPassword: 'NewPass@123', confirmPassword: 'NewPass@123' })
    expect(res.statusCode).toBe(200)
    expect(res._getJSONData()).toEqual({ ok: true })

    const updateArg: any = mockUser.update.mock.calls[0][0]
    expect(updateArg.where.id).toBe('u1')
    storedHash = updateArg.data.hashedPassword
    expect(storedHash).not.toBe('OldPass@123')
    expect(storedHash).not.toBe('NewPass@123')
    expect(storedHash.startsWith('$2')).toBe(true)
    expect(await verifyPassword('NewPass@123', storedHash)).toBe(true)
    expect(await verifyPassword('OldPass@123', storedHash)).toBe(false)
  })

  test('the hash is never returned in the response', async () => {
    const res = await callHandler({ currentPassword: 'OldPass@123', newPassword: 'NewPass@123', confirmPassword: 'NewPass@123' })
    const body = res._getJSONData()
    expect(body).not.toHaveProperty('hashedPassword')
    expect(JSON.stringify(body)).not.toContain('$2')
  })

  test('writes a PASSWORD_CHANGED audit event', async () => {
    await callHandler({ currentPassword: 'OldPass@123', newPassword: 'NewPass@123', confirmPassword: 'NewPass@123' })
    expect(mockAudit.create).toHaveBeenCalledTimes(1)
    const arg: any = mockAudit.create.mock.calls[0][0]
    expect(arg.data.actorId).toBe('u1')
    expect(arg.data.action).toBe('PASSWORD_CHANGED')
  })

  test('errors are generic and never leak whether the account exists', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    const res = await callHandler({ currentPassword: 'OldPass@123', newPassword: 'NewPass@123', confirmPassword: 'NewPass@123' })
    expect([400, 401, 404]).toContain(res.statusCode)
    expect(JSON.stringify(res._getJSONData())).not.toContain('OldPass@123')
    expect(JSON.stringify(res._getJSONData())).not.toContain('NewPass@123')
  })

  test('rejects non-PUT methods', async () => {
    const req = createRequest({ method: 'GET' }) as unknown as NextApiRequest
    const res = createResponse()
    await handler(req as any, res as any)
    expect(res.statusCode).toBe(405)
  })
})