import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    doctor: { findUnique: jest.fn() },
    consultation: { findUnique: jest.fn() },
    consent: { findFirst: jest.fn() },
    ayushAssessment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import ayushHandler from '../src/pages/api/doctor/ayush/[consultationId]'

const mockGetSession = getSession as jest.Mock
const mockPrisma = prisma as any

const DOCTOR_ID = '00000000-0000-0000-0000-000000000200'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000201'
const OTHER_DOCTOR_ID = '00000000-0000-0000-0000-000000000202'
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000210'
const PATIENT_ID = '00000000-0000-0000-0000-000000000100'

const doctorSession = { user: { id: DOCTOR_USER_ID, role: 'DOCTOR' } }

async function callHandler(method: string, query: Record<string, unknown> = {}, body?: unknown) {
  const req = createRequest({ method: method as any, query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await ayushHandler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue(doctorSession)
  mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
  mockPrisma.consultation.findUnique.mockResolvedValue({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
  })
  mockPrisma.consent.findFirst.mockResolvedValue(null)
})

describe('GET /api/doctor/ayush/[consultationId]', () => {
  test('assigned doctor can access without a consent record', async () => {
    mockPrisma.ayushAssessment.findFirst.mockResolvedValue(null)

    const res = await callHandler('GET', { consultationId: CONSULTATION_ID })

    expect(res.statusCode).toBe(200)
    expect(res._getJSONData().ayush).toBeNull()
  })

  test('unassigned doctor without consent is denied', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: CONSULTATION_ID,
      doctorId: OTHER_DOCTOR_ID,
      patientId: PATIENT_ID,
    })

    const res = await callHandler('GET', { consultationId: CONSULTATION_ID })

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.ayushAssessment.findFirst).not.toHaveBeenCalled()
  })

  test('unassigned doctor with granted consent can access', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: CONSULTATION_ID,
      doctorId: OTHER_DOCTOR_ID,
      patientId: PATIENT_ID,
    })
    mockPrisma.consent.findFirst.mockResolvedValue({
      id: 'consent-1',
      patientId: PATIENT_ID,
      granteeDoctorId: DOCTOR_ID,
      granted: true,
    })
    mockPrisma.ayushAssessment.findFirst.mockResolvedValue(null)

    const res = await callHandler('GET', { consultationId: CONSULTATION_ID })

    expect(res.statusCode).toBe(200)
  })

  test('unassigned doctor with a denied consent record is still denied', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: CONSULTATION_ID,
      doctorId: OTHER_DOCTOR_ID,
      patientId: PATIENT_ID,
    })
    mockPrisma.consent.findFirst.mockResolvedValue({
      id: 'consent-1',
      patientId: PATIENT_ID,
      granteeDoctorId: DOCTOR_ID,
      granted: false,
    })

    const res = await callHandler('GET', { consultationId: CONSULTATION_ID })

    expect(res.statusCode).toBe(403)
  })

  test('unauthenticated request returns 401', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await callHandler('GET', { consultationId: CONSULTATION_ID })

    expect(res.statusCode).toBe(401)
  })

  test('non-doctor role returns 403', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'patient-user', role: 'PATIENT' } })

    const res = await callHandler('GET', { consultationId: CONSULTATION_ID })

    expect(res.statusCode).toBe(403)
  })

  test('missing consultation returns 404', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(null)

    const res = await callHandler('GET', { consultationId: CONSULTATION_ID })

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/doctor/ayush/[consultationId]', () => {
  test('assigned doctor can save an assessment', async () => {
    mockPrisma.ayushAssessment.findFirst.mockResolvedValue(null)
    mockPrisma.ayushAssessment.create.mockResolvedValue({
      id: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      prakriti: 'Vata-Pitta',
    })

    const res = await callHandler(
      'POST',
      { consultationId: CONSULTATION_ID },
      { prakriti: 'Vata-Pitta' }
    )

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.ayushAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ patientId: PATIENT_ID, doctorId: DOCTOR_ID }),
      })
    )
  })

  test('consent-only doctor can save an assessment', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: CONSULTATION_ID,
      doctorId: OTHER_DOCTOR_ID,
      patientId: PATIENT_ID,
    })
    mockPrisma.consent.findFirst.mockResolvedValue({
      id: 'consent-1',
      patientId: PATIENT_ID,
      granteeDoctorId: DOCTOR_ID,
      granted: true,
    })
    mockPrisma.ayushAssessment.findFirst.mockResolvedValue(null)
    mockPrisma.ayushAssessment.create.mockResolvedValue({
      id: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
    })

    const res = await callHandler('POST', { consultationId: CONSULTATION_ID }, { agni: 'Manda' })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.ayushAssessment.create).toHaveBeenCalled()
  })
})