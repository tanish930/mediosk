import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import handler from '../src/pages/api/patient/profile'

const mockGetToken = getToken as jest.Mock
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
  preferredLanguage: 'marathi',
  user: { id: 'u1', name: 'Test User', email: 'test@mediosk.demo', preferredLanguage: 'en' },
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
  mockPatient.findUnique.mockResolvedValue(BASE_PATIENT)
  mockUser.update.mockResolvedValue({})
  mockPatient.update.mockResolvedValue(BASE_PATIENT)
  mockAudit.create.mockResolvedValue({ id: 'audit-1' })
})

describe('GET /api/patient/profile', () => {
  test('returns the patient joined with the related user so the name loads correctly', async () => {
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(200)
    const body = res._getJSONData()
    expect(body.patient.user.name).toBe('Test User')
    const getArgs: any = mockPatient.findUnique.mock.calls[mockPatient.findUnique.mock.calls.length - 1][0]
    expect(getArgs.include.user.select.name).toBe(true)
    expect(getArgs.include.user.select.hashedPassword).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('hashedPassword')
  })

  test('rejects unauthenticated requests before any database access', async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(401)
    expect(mockPatient.findUnique).not.toHaveBeenCalled()
  })
})

describe('PUT /api/patient/profile', () => {
  test('updates patient fields and the user name together', async () => {
    const res = await callHandler('PUT', {
      name: 'New Name',
      dob: '1992-05-20',
      gender: 'male',
      preferredLanguage: 'hi',
    })
    expect(res.statusCode).toBe(200)
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'New Name' } })
    const patUpdate: any = mockPatient.update.mock.calls[0][0]
    expect(patUpdate.where.id).toBe('pat1')
    expect(patUpdate.data.dob).toEqual(new Date('1992-05-20'))
    expect(patUpdate.data.gender).toBe('male')
    expect(patUpdate.data.preferredLanguage).toBe('hi')
  })

  test('clinical language is stored on Patient, never as the UI language on User', async () => {
    await callHandler('PUT', { name: 'New Name', dob: '1992-05-20', gender: 'male', preferredLanguage: 'hi' })
    expect(mockUser.update).toHaveBeenCalledTimes(1)
    const userUpdate: any = mockUser.update.mock.calls[0][0]
    expect(userUpdate.data.preferredLanguage).toBeUndefined()
    const patUpdate: any = mockPatient.update.mock.calls[0][0]
    expect(patUpdate.data.preferredLanguage).toBe('hi')
  })

  test('rejects an invalid date of birth', async () => {
    const res = await callHandler('PUT', { name: 'New Name', dob: 'not-a-date', gender: 'female', preferredLanguage: 'en' })
    expect(res.statusCode).toBe(400)
    expect(mockPatient.update).not.toHaveBeenCalled()
  })

  test('rejects an invalid gender', async () => {
    const res = await callHandler('PUT', { name: 'New Name', dob: '1992-05-20', gender: 'martian', preferredLanguage: 'en' })
    expect(res.statusCode).toBe(400)
    expect(mockPatient.update).not.toHaveBeenCalled()
  })

  test('rejects an unsupported clinical language', async () => {
    const res = await callHandler('PUT', { name: 'New Name', dob: '1992-05-20', gender: 'female', preferredLanguage: 'xx' })
    expect(res.statusCode).toBe(400)
    expect(mockPatient.update).not.toHaveBeenCalled()
  })

  test('rejects a blank name', async () => {
    const res = await callHandler('PUT', { name: '   ', dob: '1992-05-20', gender: 'female', preferredLanguage: 'en' })
    expect(res.statusCode).toBe(400)
    expect(mockPatient.update).not.toHaveBeenCalled()
  })

  test('an empty dob and gender clear those fields', async () => {
    await callHandler('PUT', { name: 'New Name', dob: '', gender: '', preferredLanguage: '' })
    const patUpdate: any = mockPatient.update.mock.calls[0][0]
    expect(patUpdate.data.dob).toBeNull()
    expect(patUpdate.data.gender).toBeNull()
    expect(patUpdate.data.preferredLanguage).toBeNull()
  })

  test('writes a PROFILE_UPDATED audit entry', async () => {
    await callHandler('PUT', { name: 'New Name', dob: '1992-05-20', gender: 'male', preferredLanguage: 'en' })
    expect(mockAudit.create).toHaveBeenCalledTimes(1)
    expect(mockAudit.create.mock.calls[0][0].data.action).toBe('PROFILE_UPDATED')
  })

  test('unknown fields in the body are ignored', async () => {
    await callHandler('PUT', { name: 'New Name', id: 'u999', userId: 'u999', role: 'HOSPITAL' })
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'New Name' } })
    const patUpdate: any = mockPatient.update.mock.calls[0][0]
    expect(patUpdate.where.id).toBe('pat1')
    expect(patUpdate.data.role).toBeUndefined()
  })
})