import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { create: jest.fn() },
  },
}))

import { prisma } from '../src/lib/prisma'
import handler from '../src/pages/api/register'
import { hashPassword, verifyPassword } from '../src/lib/password'

const mockPrisma = prisma as any

async function callHandler(method: string, body?: unknown) {
  const req = createRequest({ method: method as any, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.user.create.mockResolvedValue({ id: 'new-user' })
})

describe('POST /api/register', () => {
  const validBody = {
    name: '  Test User  ',
    email: 'TEST@mediosk.demo',
    password: 'Patient@123',
    confirmPassword: 'Patient@123',
  }

  test('creates a PATIENT account with a linked patient profile', async () => {
    const res = await callHandler('POST', validBody)
    const body = res._getJSONData()

    expect(res.statusCode).toBe(201)
    expect(body).toEqual({ ok: true })

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1)
    const createArgs = mockPrisma.user.create.mock.calls[0][0]
    expect(createArgs.data.role).toBe('PATIENT')
    expect(createArgs.data.name).toBe('Test User')
    expect(createArgs.data.email).toBe('test@mediosk.demo')
    expect(createArgs.data.patient).toEqual({ create: {} })
  })

  test('password is hashed and never stored or returned as plaintext', async () => {
    const res = await callHandler('POST', validBody)

    const createArgs = mockPrisma.user.create.mock.calls[0][0]
    const storedHash = createArgs.data.hashedPassword

    expect(storedHash).toBeDefined()
    expect(storedHash).not.toBe('Patient@123')
    expect(storedHash.startsWith('$2')).toBe(true)
    expect(await verifyPassword('Patient@123', storedHash)).toBe(true)

    // The response never carries the hash or the password.
    const body = res._getJSONData()
    expect(body).not.toHaveProperty('hashedPassword')
    expect(body).not.toHaveProperty('password')
  })

  test('missing name returns a name error', async () => {
    const res = await callHandler('POST', { ...validBody, name: '   ' })
    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().errors.name).toBe('Full name is required.')
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })

  test('invalid email returns an email error', async () => {
    const res = await callHandler('POST', { ...validBody, email: 'not-an-email' })
    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().errors.email).toBe('Please enter a valid email address.')
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })

  test('weak password returns a password error', async () => {
    const res = await callHandler('POST', { ...validBody, password: 'weakpass' })
    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().errors.password).toBeDefined()
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })

  test('password mismatch returns an error', async () => {
    const res = await callHandler('POST', { ...validBody, confirmPassword: 'Patient@1234' })
    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().errors.confirmPassword).toBe('Passwords do not match.')
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })

  test('duplicate email is handled safely and never reveals account existence', async () => {
    mockPrisma.user.create.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } })

    const res = await callHandler('POST', validBody)

    expect(res.statusCode).toBe(409)
    expect(res._getJSONData()).toEqual({ error: 'DUPLICATE_EMAIL' })
  })

  test('a role field in the body cannot turn the account into a doctor or hospital', async () => {
    await callHandler('POST', { ...validBody, role: 'DOCTOR' })
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.user.create.mock.calls[0][0].data.role).toBe('PATIENT')

    mockPrisma.user.create.mockReset().mockResolvedValue({ id: 'new-user' })
    await callHandler('POST', { ...validBody, role: 'HOSPITAL' })
    expect(mockPrisma.user.create.mock.calls[0][0].data.role).toBe('PATIENT')
  })

  test('unexpected database errors return a generic error and nothing sensitive', async () => {
    mockPrisma.user.create.mockRejectedValue(new Error('connection refused'))

    const res = await callHandler('POST', validBody)

    expect(res.statusCode).toBe(500)
    expect(res._getJSONData().error).toBe('REGISTRATION_FAILED')
  })

  test('non-POST method returns 405', async () => {
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(405)
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })
})

describe('hash + verify parity with NextAuth login', () => {
  test('a hash produced by the register API verifies with the shared helper', async () => {
    const hashed = await hashPassword('Patient@123')
    expect(await verifyPassword('Patient@123', hashed)).toBe(true)
    expect(await verifyPassword('Wrong', hashed)).toBe(false)
  })
})