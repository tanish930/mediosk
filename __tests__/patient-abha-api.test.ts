import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn(), update: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import handler from '../src/pages/api/patient/abha'

const mockGetToken = getToken as jest.Mock
const mockPatient = prisma.patient as any
const mockAudit = prisma.accessAudit as any

const BASE_PATIENT = {
  id: 'pat1',
  userId: 'u1',
  abhaId: null,
  abhaLinkedAt: null,
}

async function callHandler(method: string, body?: unknown) {
  const req = createRequest({ method: method as any, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue({ id: 'u1', role: 'PATIENT' })
  mockPatient.findUnique.mockResolvedValue({ ...BASE_PATIENT })
  mockPatient.update.mockResolvedValue({ id: 'pat1', userId: 'u1', abhaId: '10-1234-5678-9012', abhaLinkedAt: new Date('2026-01-02') })
  mockAudit.create.mockResolvedValue({ id: 'audit-1' })
})

describe('GET /api/patient/abha', () => {
  test('returns the authenticated patient ABHA details', async () => {
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(200)
    expect(res._getJSONData()).toEqual({ abhaId: null, abhaLinkedAt: null })
  })

  test('rejects unauthenticated requests before any database access', async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(401)
    expect(mockPatient.findUnique).not.toHaveBeenCalled()
  })

  test('rejects non-patient roles', async () => {
    mockGetToken.mockResolvedValue({ id: 'u1', role: 'DOCTOR' })
    const res = await callHandler('GET')
    expect(res.statusCode).toBe(403)
    expect(mockPatient.findUnique).not.toHaveBeenCalled()
  })
})

describe('PUT /api/patient/abha', () => {
  test('sets the ABHA identifier and records the link time', async () => {
    const res = await callHandler('PUT', { abhaId: '10-1234-5678-9012' })
    expect(res.statusCode).toBe(200)
    expect(res._getJSONData().abhaId).toBe('10-1234-5678-9012')
    const upd: any = mockPatient.update.mock.calls[0][0]
    expect(upd.where.id).toBe('pat1')
    expect(upd.data.abhaId).toBe('10-1234-5678-9012')
    expect(upd.data.abhaLinkedAt).toBeInstanceOf(Date)
  })

  test('clears the ABHA identifier', async () => {
    mockPatient.update.mockResolvedValue({ id: 'pat1', userId: 'u1', abhaId: null, abhaLinkedAt: null })
    const res = await callHandler('PUT', { abhaId: null })
    expect(res.statusCode).toBe(200)
    const upd: any = mockPatient.update.mock.calls[0][0]
    expect(upd.data.abhaId).toBeNull()
    expect(upd.data.abhaLinkedAt).toBeNull()
  })

  test('rejects an invalid payload', async () => {
    const res = await callHandler('PUT', { abhaId: 12345 })
    expect(res.statusCode).toBe(400)
    expect(mockPatient.update).not.toHaveBeenCalled()
  })

  test('writes an ABHA_UPDATED audit event from the token identity', async () => {
    await callHandler('PUT', { abhaId: '10-1234-5678-9012' })
    expect(mockAudit.create).toHaveBeenCalledTimes(1)
    const arg: any = mockAudit.create.mock.calls[0][0]
    expect(arg.data.actorId).toBe('u1')
    expect(arg.data.action).toBe('ABHA_UPDATED')
  })

  test('a body cannot redirect which patient record is updated', async () => {
    await callHandler('PUT', { abhaId: '10-1234-5678-9012', id: 'pat999', userId: 'u999' })
    const upd: any = mockPatient.update.mock.calls[0][0]
    expect(upd.where.id).toBe('pat1')
  })
})