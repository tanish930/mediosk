import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'
import { encode } from 'next-auth/jwt'

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { prisma } from '../src/lib/prisma'
import profileHandler from '../src/pages/api/patient/profile'
import abhaHandler from '../src/pages/api/patient/abha'

const SECRET = 'patient-auth-mechanism-test-secret-1234567890'
const COOKIE_NAME = 'next-auth.session-token'

const mockPatient = prisma.patient as any
const mockUser = prisma.user as any
const mockAudit = prisma.accessAudit as any

const BASE_PATIENT = {
  id: 'pat1',
  userId: 'u1',
  abhaId: null,
  abhaLinkedAt: null,
  dob: new Date('1990-01-01'),
  gender: 'female',
  preferredLanguage: 'en',
  user: { id: 'u1', name: 'Test User', email: 'test@mediosk.demo', preferredLanguage: 'en' },
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

describe('patient APIs authenticated by real JWT decode (no mocks)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXTAUTH_SECRET = SECRET
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    mockPatient.findUnique.mockResolvedValue({ ...BASE_PATIENT })
    mockPatient.update.mockResolvedValue({ ...BASE_PATIENT })
    mockUser.findUnique.mockResolvedValue({ id: 'u1', name: 'Test User', email: 'test@mediosk.demo', role: 'PATIENT' })
    mockUser.update.mockResolvedValue({})
    mockAudit.create.mockResolvedValue({ id: 'audit-1' })
  })

  test('authenticated PUT /api/patient/profile reaches validation instead of 401', async () => {
    const jwt = await encode({ token: { id: 'u1', role: 'PATIENT' }, secret: SECRET })
    const result = await callHandler(
      profileHandler,
      'PUT',
      { name: 'New Name', dob: '1992-05-20', gender: 'martian', preferredLanguage: 'en' },
      jwt
    )
    expect(result.status).toBe(400)
    expect(result.body.error).toBe('Invalid body')
  })

  test('authenticated PUT /api/patient/profile updates the patient record', async () => {
    const jwt = await encode({ token: { id: 'u1', role: 'PATIENT' }, secret: SECRET })
    const result = await callHandler(
      profileHandler,
      'PUT',
      { name: 'New Name', dob: '1992-05-20', gender: 'male', preferredLanguage: 'hi' },
      jwt
    )
    expect(result.status).toBe(200)
    expect(result.body.patient.id).toBe('pat1')
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'New Name' } })
    const patUpdate: any = mockPatient.update.mock.calls[0][0]
    expect(patUpdate.where.id).toBe('pat1')
  })

  test('authenticated GET /api/patient/profile still works', async () => {
    const jwt = await encode({ token: { id: 'u1', role: 'PATIENT' }, secret: SECRET })
    const result = await callHandler(profileHandler, 'GET', undefined, jwt)
    expect(result.status).toBe(200)
    expect(result.body.patient.id).toBe('pat1')
    expect(JSON.stringify(result.body)).not.toContain('hashedPassword')
  })

  test('authenticated PUT /api/patient/abha sets the identifier', async () => {
    mockPatient.update.mockResolvedValue({
      id: 'pat1',
      userId: 'u1',
      abhaId: '10-1234-5678-9012',
      abhaLinkedAt: new Date('2026-01-02'),
    })
    const jwt = await encode({ token: { id: 'u1', role: 'PATIENT' }, secret: SECRET })
    const result = await callHandler(abhaHandler, 'PUT', { abhaId: '10-1234-5678-9012' }, jwt)
    expect(result.status).toBe(200)
    expect(result.body.abhaId).toBe('10-1234-5678-9012')
  })

  test('a patient token cannot mutate another user record from the body', async () => {
    const jwt = await encode({ token: { id: 'u1', role: 'PATIENT' }, secret: SECRET })
    await callHandler(
      profileHandler,
      'PUT',
      { name: 'Hacked', id: 'u999', userId: 'u999', role: 'HOSPITAL' },
      jwt
    )
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'Hacked' } })
    const patUpdate: any = mockPatient.update.mock.calls[0][0]
    expect(patUpdate.where.id).toBe('pat1')
  })

  test('missing session cookie stays 401 for profile and abha', async () => {
    const profileRes = await callHandler(profileHandler, 'PUT', { name: 'X', dob: '', gender: '', preferredLanguage: '' }, null)
    expect(profileRes.status).toBe(401)
    const abhaRes = await callHandler(abhaHandler, 'PUT', { abhaId: '10-1234-5678-9012' }, null)
    expect(abhaRes.status).toBe(401)
    expect(mockPatient.findUnique).not.toHaveBeenCalled()
  })

  test('a token signed with the wrong secret stays 401', async () => {
    const wrongJwt = await encode({ token: { id: 'u1', role: 'PATIENT' }, secret: 'a-different-secret-1234567890123456' })
    const profileRes = await callHandler(profileHandler, 'PUT', { name: 'X', dob: '', gender: '', preferredLanguage: '' }, wrongJwt)
    expect(profileRes.status).toBe(401)
    const abhaRes = await callHandler(abhaHandler, 'PUT', { abhaId: '10-1234-5678-9012' }, wrongJwt)
    expect(abhaRes.status).toBe(401)
  })

  test('a corrupted token stays 401', async () => {
    const res = await callHandler(abhaHandler, 'PUT', { abhaId: '10-1234-5678-9012' }, 'garbage-token')
    expect(res.status).toBe(401)
  })
})