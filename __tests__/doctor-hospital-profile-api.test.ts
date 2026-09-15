import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    doctor: { findUnique: jest.fn(), update: jest.fn() },
    hospital: { findUnique: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import doctorProfileHandler from '../src/pages/api/doctor/profile'
import hospitalProfileHandler from '../src/pages/api/hospital/profile'

const mockGetSession = getSession as jest.Mock
const mockDoctor = prisma.doctor as any
const mockHospital = prisma.hospital as any
const mockUser = prisma.user as any
const mockAudit = prisma.accessAudit as any

const BASE_DOCTOR = {
  id: 'doc1',
  userId: 'u1',
  speciality: 'General Practice',
  user: { id: 'u1', name: 'Dr Test', email: 'doctor@mediosk.demo' },
}

async function callHandler(handler: any, method: string, body?: unknown) {
  const req = createRequest({ method: method as any, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/doctor/profile', () => {
  test('allows only the DOCTOR role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1', role: 'PATIENT' } })
    const res = await callHandler(doctorProfileHandler, 'GET')
    expect(res.statusCode).toBe(403)
  })

  test('returns the doctor profile with the user name', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1', role: 'DOCTOR' } })
    mockDoctor.findUnique.mockResolvedValue(BASE_DOCTOR)
    const res = await callHandler(doctorProfileHandler, 'GET')
    expect(res.statusCode).toBe(200)
    const body = res._getJSONData()
    expect(body.doctor.user.name).toBe('Dr Test')
    expect(body.doctor.speciality).toBe('General Practice')
    expect(JSON.stringify(body)).not.toContain('hashedPassword')
  })

  test('requires authentication', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await callHandler(doctorProfileHandler, 'GET')
    expect(res.statusCode).toBe(401)
  })
})

describe('PUT /api/doctor/profile', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1', role: 'DOCTOR' } })
    mockDoctor.findUnique.mockResolvedValue(BASE_DOCTOR)
    mockDoctor.update.mockResolvedValue(BASE_DOCTOR)
    mockUser.update.mockResolvedValue({})
    mockAudit.create.mockResolvedValue({ id: 'audit-1' })
  })

  test('updates name and speciality', async () => {
    const res = await callHandler(doctorProfileHandler, 'PUT', { name: 'Dr Updated', speciality: 'Cardiology' })
    expect(res.statusCode).toBe(200)
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'Dr Updated' } })
    expect(mockDoctor.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'doc1' }, data: { speciality: 'Cardiology' } }))
  })

  test('rejects a blank name', async () => {
    const res = await callHandler(doctorProfileHandler, 'PUT', { name: '  ', speciality: 'Cardiology' })
    expect(res.statusCode).toBe(400)
    expect(mockUser.update).not.toHaveBeenCalled()
    expect(mockDoctor.update).not.toHaveBeenCalled()
  })

  test('cannot modify role, verification status or hospital links from the body', async () => {
    const res = await callHandler(doctorProfileHandler, 'PUT', {
      name: 'Dr Updated',
      speciality: 'Cardiology',
      role: 'HOSPITAL',
      id: 'u999',
      verifications: [{ status: 'VERIFIED' }],
      hospitalLinks: [{ hospitalId: 'h99', status: 'ACTIVE' }],
    })
    expect(res.statusCode).toBe(200)
    const userUpdate: any = mockUser.update.mock.calls[0][0]
    expect(userUpdate.where.id).toBe('u1')
    expect(userUpdate.data.role).toBeUndefined()
    const docUpdate: any = mockDoctor.update.mock.calls[0][0]
    expect(docUpdate.where.id).toBe('doc1')
    expect(docUpdate.data.verifications).toBeUndefined()
    expect(docUpdate.data.hospitalLinks).toBeUndefined()
  })

  test('writes a DOCTOR_PROFILE_UPDATED audit event', async () => {
    await callHandler(doctorProfileHandler, 'PUT', { name: 'Dr Updated', speciality: 'Cardiology' })
    expect(mockAudit.create).toHaveBeenCalledTimes(1)
    expect(mockAudit.create.mock.calls[0][0].data.action).toBe('DOCTOR_PROFILE_UPDATED')
  })
})

describe('GET /api/hospital/profile', () => {
  test('still works for the HOSPITAL role and does not leak the user hash', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u2', role: 'HOSPITAL' } })
    mockDoctor.findUnique.mockReset()
    mockHospital.findUnique.mockResolvedValue({
      id: 'h1',
      userId: 'u2',
      address: 'Pune',
      user: { id: 'u2', name: 'City Hospital', email: 'hospital@mediosk.demo' },
    })
    const res = await callHandler(hospitalProfileHandler, 'GET')
    expect(res.statusCode).toBe(200)
    const body = res._getJSONData()
    expect(body.hospital.address).toBe('Pune')
    expect(body.hospital.user.name).toBe('City Hospital')
    expect(JSON.stringify(body)).not.toContain('hashedPassword')
    const getArgs: any = mockHospital.findUnique.mock.calls[0][0]
    expect(getArgs.include.user.select.hashedPassword).toBeUndefined()
  })

  test('denies non-hospital roles', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1', role: 'DOCTOR' } })
    const res = await callHandler(hospitalProfileHandler, 'GET')
    expect(res.statusCode).toBe(403)
  })
})