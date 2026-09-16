import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    hospital: { findUnique: jest.fn() },
    doctor: { findUnique: jest.fn() },
    hospitalDoctor: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import setDoctorStatusHandler from '../src/pages/api/hospital/doctors/[id]'
import doctorsHandler from '../src/pages/api/hospital/doctors/index'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const HOSPITAL_ID = '00000000-0000-0000-0000-000000000010'
const HOSPITAL_USER_ID = '00000000-0000-0000-0000-000000000011'
const LINK_ID = '00000000-0000-0000-0000-000000000012'
const DOCTOR_ID = '00000000-0000-0000-0000-000000000020'

const hospitalToken = { id: HOSPITAL_USER_ID, role: 'HOSPITAL' }

async function callHandler(body: unknown, token: Record<string, unknown> | null, method = 'PATCH') {
  mockGetToken.mockResolvedValue(token)
  const req = createRequest({ method: method as any, query: { id: LINK_ID }, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await setDoctorStatusHandler(req as any, res as any)
  let parsed: any
  try {
    parsed = res._getJSONData()
  } catch {
    parsed = res._getData()
  }
  return { status: res.statusCode, body: parsed }
}

async function callIndexHandler(method: string, body: unknown, token: Record<string, unknown> | null) {
  mockGetToken.mockResolvedValue(token)
  const req = createRequest({ method: method as any, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await doctorsHandler(req as any, res as any)
  let parsed: any
  try {
    parsed = res._getJSONData()
  } catch {
    parsed = res._getData()
  }
  return { status: res.statusCode, body: parsed }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
  mockPrisma.hospitalDoctor.findFirst.mockResolvedValue({
    id: LINK_ID,
    hospitalId: HOSPITAL_ID,
    doctorId: DOCTOR_ID,
    status: 'PENDING',
  })
  mockPrisma.hospitalDoctor.update.mockResolvedValue({
    id: LINK_ID,
    hospitalId: HOSPITAL_ID,
    doctorId: DOCTOR_ID,
    status: 'ACTIVE',
  })
  mockPrisma.accessAudit.create.mockResolvedValue({})
})

describe('PATCH /api/hospital/doctors/[id]', () => {
  test('activates a PENDING doctor link', async () => {
    const result = await callHandler({ action: 'activate' }, hospitalToken)

    expect(result.status).toBe(200)
    expect(result.body.link.status).toBe('ACTIVE')
    expect(mockPrisma.hospitalDoctor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LINK_ID },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      })
    )
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'HOSPITAL_DOCTOR_ACTIVATED', doctorId: DOCTOR_ID }),
      })
    )
  })

  test('deactivates an ACTIVE doctor link back to PENDING', async () => {
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue({
      id: LINK_ID,
      hospitalId: HOSPITAL_ID,
      doctorId: DOCTOR_ID,
      status: 'ACTIVE',
    })
    mockPrisma.hospitalDoctor.update.mockResolvedValue({
      id: LINK_ID,
      hospitalId: HOSPITAL_ID,
      doctorId: DOCTOR_ID,
      status: 'PENDING',
    })

    const result = await callHandler({ action: 'deactivate' }, hospitalToken)

    expect(result.status).toBe(200)
    expect(mockPrisma.hospitalDoctor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) })
    )
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'HOSPITAL_DOCTOR_DEACTIVATED' }),
      })
    )
  })

  test('cannot activate a link that is already ACTIVE', async () => {
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue({
      id: LINK_ID,
      hospitalId: HOSPITAL_ID,
      doctorId: DOCTOR_ID,
      status: 'ACTIVE',
    })

    const result = await callHandler({ action: 'activate' }, hospitalToken)

    expect(result.status).toBe(409)
    expect(mockPrisma.hospitalDoctor.update).not.toHaveBeenCalled()
  })

  test('cannot deactivate a link that is not ACTIVE', async () => {
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue({
      id: LINK_ID,
      hospitalId: HOSPITAL_ID,
      doctorId: DOCTOR_ID,
      status: 'SUSPENDED',
    })

    const result = await callHandler({ action: 'deactivate' }, hospitalToken)

    expect(result.status).toBe(409)
    expect(mockPrisma.hospitalDoctor.update).not.toHaveBeenCalled()
  })

  test('link belonging to another hospital is not found', async () => {
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue(null)

    const result = await callHandler({ action: 'activate' }, hospitalToken)

    expect(result.status).toBe(404)
    expect(mockPrisma.hospitalDoctor.update).not.toHaveBeenCalled()
  })

  test('invalid action returns 400', async () => {
    const result = await callHandler({ action: 'frobnicate' }, hospitalToken)

    expect(result.status).toBe(400)
    expect(mockPrisma.hospitalDoctor.update).not.toHaveBeenCalled()
  })

  test('unauthenticated request returns 401', async () => {
    const result = await callHandler({ action: 'activate' }, null)

    expect(result.status).toBe(401)
  })

  test('non-hospital role returns 403', async () => {
    const result = await callHandler({ action: 'activate' }, { id: 'd1', role: 'DOCTOR' })

    expect(result.status).toBe(403)
  })

  test('hospital without a profile returns 404', async () => {
    mockPrisma.hospital.findUnique.mockResolvedValue(null)

    const result = await callHandler({ action: 'activate' }, hospitalToken)

    expect(result.status).toBe(404)
    expect(mockPrisma.hospitalDoctor.findFirst).not.toHaveBeenCalled()
  })

  test('non-PATCH method returns 405', async () => {
    const result = await callHandler({ action: 'activate' }, hospitalToken, 'GET')

    expect(result.status).toBe(405)
  })
})

describe('GET /api/hospital/doctors', () => {
  test('hospital lists its own linked doctors', async () => {
    const links = [
      { id: LINK_ID, hospitalId: HOSPITAL_ID, doctorId: DOCTOR_ID, status: 'ACTIVE', doctor: { id: DOCTOR_ID, user: { name: 'Demo Doctor' } } },
    ]
    mockPrisma.hospitalDoctor.findMany.mockResolvedValue(links)

    const result = await callIndexHandler('GET', undefined, hospitalToken)

    expect(result.status).toBe(200)
    expect(result.body.doctors).toEqual(links)
    expect(mockPrisma.hospitalDoctor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hospitalId: HOSPITAL_ID } })
    )
  })

  test('unauthenticated GET returns 401', async () => {
    const result = await callIndexHandler('GET', undefined, null)

    expect(result.status).toBe(401)
    expect(mockPrisma.hospitalDoctor.findMany).not.toHaveBeenCalled()
  })

  test('non-hospital GET returns 403', async () => {
    const result = await callIndexHandler('GET', undefined, { id: 'd1', role: 'DOCTOR' })

    expect(result.status).toBe(403)
  })
})

describe('POST /api/hospital/doctors', () => {
  test('hospital adds its own linked doctor', async () => {
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue(null)
    mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: 'doc-user' })
    mockPrisma.hospitalDoctor.create.mockResolvedValue({ id: LINK_ID, hospitalId: HOSPITAL_ID, doctorId: DOCTOR_ID, status: 'PENDING' })

    const result = await callIndexHandler('POST', { doctorId: DOCTOR_ID }, hospitalToken)

    expect(result.status).toBe(200)
    expect(mockPrisma.hospitalDoctor.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hospitalId: HOSPITAL_ID, doctorId: DOCTOR_ID }) })
    )
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'HOSPITAL_DOCTOR_ADDED' }) })
    )
  })

  test('rejects adding a doctor that is already linked', async () => {
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue({ id: LINK_ID, hospitalId: HOSPITAL_ID, doctorId: DOCTOR_ID, status: 'ACTIVE' })

    const result = await callIndexHandler('POST', { doctorId: DOCTOR_ID }, hospitalToken)

    expect(result.status).toBe(400)
    expect(mockPrisma.hospitalDoctor.create).not.toHaveBeenCalled()
  })

  test('rejects adding an unknown doctor', async () => {
    mockPrisma.hospitalDoctor.findFirst.mockResolvedValue(null)
    mockPrisma.doctor.findUnique.mockResolvedValue(null)

    const result = await callIndexHandler('POST', { doctorId: DOCTOR_ID }, hospitalToken)

    expect(result.status).toBe(404)
  })

  test('unauthenticated POST returns 401', async () => {
    const result = await callIndexHandler('POST', { doctorId: DOCTOR_ID }, null)

    expect(result.status).toBe(401)
  })
})