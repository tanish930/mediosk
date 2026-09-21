import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    doctor: { findUnique: jest.fn() },
    consultation: { findUnique: jest.fn() },
    consent: { findFirst: jest.fn() },
    emergencyAlert: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    medicalSummary: { findMany: jest.fn() },
    medicalDocument: { findMany: jest.fn() },
    medicalTimeline: { findMany: jest.fn() },
    doctorVerification: { findMany: jest.fn() },
    clinicalNote: { findMany: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import doctorCaseHandler from '../src/pages/api/doctor/case/[id]'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const DOCTOR_ID = '00000000-0000-0000-0000-000000000200'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000201'
const OTHER_DOCTOR_ID = '00000000-0000-0000-0000-000000000202'
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000210'
const OTHER_CONSULTATION_ID = '00000000-0000-0000-0000-000000000211'
const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const OTHER_PATIENT_ID = '00000000-0000-0000-0000-000000000101'
const ALERT_ID = '00000000-0000-0000-0000-000000000130'

const doctorToken = { id: DOCTOR_USER_ID, role: 'DOCTOR' }

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: ALERT_ID,
    severity: 'EMERGENCY',
    status: 'OPEN',
    source: 'PRECONSULTATION',
    createdAt: new Date('2026-01-01T10:00:00.000Z').toISOString(),
    acknowledgedAt: null,
    resolvedAt: null,
    consultationId: CONSULTATION_ID,
    hospitalId: null,
    ...overrides,
  }
}

function mockConsultation(doctorId: string) {
  const consultation = {
    id: CONSULTATION_ID,
    doctorId,
    patientId: PATIENT_ID,
    sessionId: null,
    status: 'PENDING',
    patient: {
      user: { name: 'Test', email: 'test@test.com' },
      dob: null,
      gender: null,
      summaries: [],
      timelines: [],
    },
    session: null,
  }
  mockPrisma.consultation.findUnique.mockResolvedValue(consultation)
  return consultation
}

async function callHandler(method: string, query: Record<string, unknown> = {}) {
  const req = createRequest({ method: method as any, query }) as unknown as NextApiRequest
  const res = createResponse()
  await doctorCaseHandler(req as any, res as any)
  await new Promise((r) => setImmediate(r))
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue(doctorToken)
  mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
  mockConsultation(DOCTOR_ID)
  mockPrisma.consent.findFirst.mockResolvedValue(null)
  mockPrisma.emergencyAlert.findMany.mockResolvedValue([])
  mockPrisma.medicalSummary.findMany.mockResolvedValue([])
  mockPrisma.medicalDocument.findMany.mockResolvedValue([])
  mockPrisma.medicalTimeline.findMany.mockResolvedValue([])
  mockPrisma.doctorVerification.findMany.mockResolvedValue([])
  mockPrisma.clinicalNote.findMany.mockResolvedValue([])
})

describe('doctor emergency visibility: GET /api/doctor/case/[id]', () => {
  test('assigned doctor can receive the relevant emergency alert', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([makeAlert()])

    const res = await callHandler('GET', { id: CONSULTATION_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.emergencyAlerts).toHaveLength(1)
    expect(body.emergencyAlerts[0]).toEqual(expect.objectContaining({ id: ALERT_ID, severity: 'EMERGENCY', status: 'OPEN' }))
  })

  test('consent-authorized doctor can receive the relevant emergency alert', async () => {
    mockConsultation(OTHER_DOCTOR_ID)
    mockPrisma.consent.findFirst.mockResolvedValue({
      id: 'consent-1',
      patientId: PATIENT_ID,
      granteeDoctorId: DOCTOR_ID,
      granted: true,
    })
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([makeAlert()])

    const res = await callHandler('GET', { id: CONSULTATION_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.emergencyAlerts).toHaveLength(1)
  })

  test('unauthorized doctor cannot reach alert data', async () => {
    mockConsultation(OTHER_DOCTOR_ID)
    mockPrisma.consent.findFirst.mockResolvedValue(null)

    const res = await callHandler('GET', { id: CONSULTATION_ID })

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.emergencyAlert.findMany).not.toHaveBeenCalled()
    expect(res._getJSONData().emergencyAlerts).toBeUndefined()
  })

  test('alerts are fetched scoped to the current consultation only', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([makeAlert()])

    await callHandler('GET', { id: CONSULTATION_ID })

    expect(mockPrisma.emergencyAlert.findMany).toHaveBeenCalledWith({
      where: { consultationId: CONSULTATION_ID, patientId: PATIENT_ID },
      orderBy: { createdAt: 'desc' },
      select: expect.objectContaining({
        id: true,
        severity: true,
        status: true,
        source: true,
        createdAt: true,
        acknowledgedAt: true,
        resolvedAt: true,
        consultationId: true,
        hospitalId: true,
      }),
    })
  })

  test('alert for another consultation is not returned', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([])

    const res = await callHandler('GET', { id: CONSULTATION_ID })

    expect(res.statusCode).toBe(200)
    expect(res._getJSONData().emergencyAlerts).toEqual([])
    const where = (mockPrisma.emergencyAlert.findMany.mock.calls[0][0]).where
    expect(where.consultationId).toBe(CONSULTATION_ID)
    expect(where.consultationId).not.toBe(OTHER_CONSULTATION_ID)
  })

  test('alert for another patient is not returned (query stays patient-scoped)', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([makeAlert({ patientId: OTHER_PATIENT_ID })])

    const res = await callHandler('GET', { id: CONSULTATION_ID })

    expect(res.statusCode).toBe(200)
    const where = (mockPrisma.emergencyAlert.findMany.mock.calls[0][0]).where
    expect(where.patientId).toBe(PATIENT_ID)
    expect(where.patientId).not.toBe(OTHER_PATIENT_ID)
  })

  test('zero alerts returns an empty array', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([])

    const res = await callHandler('GET', { id: CONSULTATION_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.emergencyAlerts).toEqual([])
  })

  test('existing case response remains compatible (additive field only)', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([makeAlert()])

    const res = await callHandler('GET', { id: CONSULTATION_ID })
    const body = res._getJSONData()

    expect(body.consultation?.id).toBe(CONSULTATION_ID)
    expect(Array.isArray(body.summaries)).toBe(true)
    expect(Array.isArray(body.documents)).toBe(true)
    expect(Array.isArray(body.timelines)).toBe(true)
    expect(Array.isArray(body.verifications)).toBe(true)
    expect(Array.isArray(body.emergencyAlerts)).toBe(true)
  })

  test('returned alert payload is minimal and includes no internal fields', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([makeAlert()])

    const res = await callHandler('GET', { id: CONSULTATION_ID })
    const alert = res._getJSONData().emergencyAlerts[0]

    expect(alert).not.toHaveProperty('patientId')
    expect(alert).not.toHaveProperty('createdBy')
    expect(alert).not.toHaveProperty('reason')
    expect(alert).not.toHaveProperty('acknowledgedBy')
    expect(alert).not.toHaveProperty('resolvedBy')
  })

  test('doctor case endpoint is read-only: no alert mutation', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([makeAlert()])

    const res = await callHandler('GET', { id: CONSULTATION_ID })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.emergencyAlert.findMany).toHaveBeenCalled()
    expect(mockPrisma.emergencyAlert.create).not.toHaveBeenCalled()
    expect(mockPrisma.emergencyAlert.update).not.toHaveBeenCalled()
  })
})