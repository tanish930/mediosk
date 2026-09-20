import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('next-auth/react', () => ({ getSession: jest.fn() }))
jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    preConsultationSession: { findUnique: jest.fn() },
    patient: { findUnique: jest.fn() },
    consultation: { findFirst: jest.fn() },
    hospital: { findUnique: jest.fn(), findMany: jest.fn() },
    emergencyAlert: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth/next'
import { getSession } from 'next-auth/react'
import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import detectHandler from '../src/pages/api/emergency/detect'
import hospitalEmergencyHandler from '../src/pages/api/hospital/emergency/index'
import acknowledgeHandler from '../src/pages/api/hospital/emergency/[id]/acknowledge'
import resolveHandler from '../src/pages/api/hospital/emergency/[id]/resolve'
import patientEmergencyHandler from '../src/pages/api/patient/emergency/index'

const mockGetServerSession = getServerSession as jest.Mock
const mockGetSession = getSession as jest.Mock
const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000101'
const OTHER_PATIENT_USER_ID = '00000000-0000-0000-0000-000000000102'
const HOSPITAL_USER_ID = '00000000-0000-0000-0000-000000000200'
const HOSPITAL_ID = '00000000-0000-0000-0000-000000000201'
const OTHER_HOSPITAL_ID = '00000000-0000-0000-0000-000000000202'
const SESSION_ID = '00000000-0000-0000-0000-000000000120'
const ALERT_ID = '00000000-0000-0000-0000-000000000130'
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000131'

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    patientId: PATIENT_ID,
    complaint: 'mild cough since two days',
    language: 'en',
    report: null,
    ...overrides,
  }
}

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: ALERT_ID,
    patientId: PATIENT_ID,
    consultationId: null,
    hospitalId: HOSPITAL_ID,
    severity: 'EMERGENCY',
    status: 'OPEN',
    reason: 'chest pain',
    source: 'PRECONSULTATION',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

async function jsonData(res: any) {
  try {
    return res._getJSONData()
  } catch {
    return res._getData()
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/emergency/detect', () => {
  const patientSession = { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }

  function makeReport(overrides: Record<string, unknown> = {}) {
    return { chiefComplaint: '', onsetDuration: '', character: '', redFlags: null, severity: null, ...overrides }
  }

  async function callDetect(body: unknown, token: Record<string, unknown> | null = patientSession) {
    mockGetServerSession.mockResolvedValue(token)
    const req = createRequest({ method: 'POST', body: body as any }) as unknown as NextApiRequest
    const res = createResponse()
    await detectHandler(req as any, res as any)
    return { status: res.statusCode, body: await jsonData(res) }
  }

  beforeEach(() => {
    mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: PATIENT_USER_ID })
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(makeSession({ report: makeReport({ chiefComplaint: 'chest pain since morning' }) }))
    mockPrisma.consultation.findFirst.mockResolvedValue(null)
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID })
  })

  test('401 when unauthenticated', async () => {
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: false }, null)
    expect(out.status).toBe(401)
  })

  test('403 for non-patient roles', async () => {
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: false }, { user: { id: HOSPITAL_USER_ID, role: 'HOSPITAL' } })
    expect(out.status).toBe(403)
    expect(mockPrisma.emergencyAlert.create).not.toHaveBeenCalled()
  })

  test('400 for invalid body', async () => {
    const out = await callDetect({})
    expect(out.status).toBe(400)
  })

  test('404 when session does not exist', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(null)
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: false })
    expect(out.status).toBe(404)
  })

  test("403 when session belongs to another patient (no data leak)", async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(makeSession({ patientId: 'someone-else' }))
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: false })
    expect(out.status).toBe(403)
  })

  test('computes EMERGENCY severity from report keywords without creating an alert when createAlert is false', async () => {
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: false })
    expect(out.status).toBe(200)
    expect(out.body.severity).toBe('EMERGENCY')
    expect(out.body.alert).toBeNull()
    expect(mockPrisma.emergencyAlert.create).not.toHaveBeenCalled()
    expect(mockPrisma.accessAudit.create).not.toHaveBeenCalled()
  })

  test('computes URGENT severity from report keywords', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(makeSession({ report: makeReport({ chiefComplaint: 'high fever since yesterday' }) }))
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: false })
    expect(out.status).toBe(200)
    expect(out.body.severity).toBe('URGENT')
  })

  test('classifies severity >= 9 as EMERGENCY from the persisted report', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(makeSession({ complaint: 'mild headache', report: makeReport({ chiefComplaint: 'mild headache', severity: '9' }) }))
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: true })
    expect(out.status).toBe(200)
    expect(out.body.severity).toBe('EMERGENCY')
  })

  test('creates no alert for NORMAL severity even when createAlert is true', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue(makeSession({ report: makeReport() }))
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: true })
    expect(out.status).toBe(200)
    expect(out.body.severity).toBe('NORMAL')
    expect(out.body.alert).toBeNull()
    expect(mockPrisma.emergencyAlert.create).not.toHaveBeenCalled()
  })

  test('creates an EMERGENCY alert and audit event', async () => {
    mockPrisma.emergencyAlert.create.mockResolvedValue(makeAlert())
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: true })
    expect(out.status).toBe(200)
    expect(out.body.severity).toBe('EMERGENCY')
    expect(out.body.alert).toBeDefined()
    expect(mockPrisma.emergencyAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientId: PATIENT_ID,
        consultationId: null,
        severity: 'EMERGENCY',
        source: 'PRECONSULTATION',
        createdBy: PATIENT_USER_ID,
      }),
    })
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'EMERGENCY_ALERT_CREATED', patientId: PATIENT_ID }),
    })
  })

  test('creates a single alert per detect call (no extra writes)', async () => {
    mockPrisma.emergencyAlert.create.mockResolvedValue(makeAlert())
    await callDetect({ sessionId: SESSION_ID, createAlert: true })
    expect(mockPrisma.emergencyAlert.create).toHaveBeenCalledTimes(1)
  })

  test('rejects an unrecognized hospital id without creating an orphaned alert', async () => {
    mockPrisma.hospital.findUnique.mockResolvedValue(null)
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: true, hospitalId: 'google_place_id_xyz' })
    expect(out.status).toBe(200)
    expect(out.body.severity).toBe('EMERGENCY')
    expect(out.body.alert).toBeNull()
    expect(out.body.routing).toBe('invalid_hospital')
    expect(mockPrisma.emergencyAlert.create).not.toHaveBeenCalled()
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'EMERGENCY_ROUTING_REJECTED', note: 'unrecognized_hospital_id:google_place_id_xyz' }),
    })
  })

  test('routes to a real hospital record only', async () => {
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID })
    mockPrisma.emergencyAlert.create.mockResolvedValue(makeAlert())
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: true, hospitalId: HOSPITAL_ID })
    expect(out.status).toBe(200)
    expect(out.body.alert.hospitalId).toBe(HOSPITAL_ID)
    expect(mockPrisma.hospital.findUnique).toHaveBeenCalledWith({ where: { id: HOSPITAL_ID } })
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'EMERGENCY_ALERT_CREATED', note: expect.stringContaining('routed_to_hospital:' + HOSPITAL_ID) }),
    })
  })

  test('keeps supporting an unassigned alert when no hospital is supplied', async () => {
    mockPrisma.emergencyAlert.create.mockResolvedValue(makeAlert({ hospitalId: null }))
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: true })
    expect(out.status).toBe(200)
    expect(out.body.alert).toBeDefined()
    expect(mockPrisma.emergencyAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ patientId: PATIENT_ID, severity: 'EMERGENCY' }),
    })
    expect((mockPrisma.emergencyAlert.create.mock.calls[0][0].data as any).hospitalId).toBeUndefined()
  })

  test('links the alert to an existing consultation of the session', async () => {
    mockPrisma.consultation.findFirst.mockResolvedValue({ id: CONSULTATION_ID })
    mockPrisma.emergencyAlert.create.mockResolvedValue(makeAlert({ consultationId: CONSULTATION_ID }))
    const out = await callDetect({ sessionId: SESSION_ID, createAlert: true })
    expect(out.status).toBe(200)
    expect(mockPrisma.emergencyAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ consultationId: CONSULTATION_ID }),
    })
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ consultationId: CONSULTATION_ID, action: 'EMERGENCY_ALERT_CREATED' }),
    })
  })
})

describe('GET /api/patient/emergency', () => {
  const patientSession = { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }

  async function callList(token: Record<string, unknown> | null = patientSession) {
    mockGetSession.mockResolvedValue(token)
    const req = createRequest({ method: 'GET' }) as unknown as NextApiRequest
    const res = createResponse()
    await patientEmergencyHandler(req as any, res as any)
    return { status: res.statusCode, body: await jsonData(res) }
  }

  beforeEach(() => {
    mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: PATIENT_USER_ID })
  })

  test('401 when unauthenticated', async () => {
    const out = await callList(null)
    expect(out.status).toBe(401)
  })

  test('403 for non-patient role', async () => {
    const out = await callList({ user: { id: HOSPITAL_USER_ID, role: 'HOSPITAL' } })
    expect(out.status).toBe(403)
  })

  test('lists only the requesting patient alerts', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([makeAlert()])
    const out = await callList()
    expect(out.status).toBe(200)
    expect(out.body.alerts).toHaveLength(1)
    expect(mockPrisma.emergencyAlert.findMany).toHaveBeenCalledWith({
      where: { patientId: PATIENT_ID },
      orderBy: { createdAt: 'desc' },
      include: { consultation: true },
    })
  })

  test('405 for non-GET methods', async () => {
    mockGetSession.mockResolvedValue(patientSession)
    const req = createRequest({ method: 'POST' }) as unknown as NextApiRequest
    const res = createResponse()
    await patientEmergencyHandler(req as any, res as any)
    expect(res.statusCode).toBe(405)
  })
})

describe('GET /api/hospital/emergency', () => {
  const hospitalToken = { id: HOSPITAL_USER_ID, role: 'HOSPITAL' }

  async function callList(token: Record<string, unknown> | null = hospitalToken) {
    mockGetToken.mockResolvedValue(token)
    const req = createRequest({ method: 'GET' }) as unknown as NextApiRequest
    const res = createResponse()
    await hospitalEmergencyHandler(req as any, res as any)
    return { status: res.statusCode, body: await jsonData(res) }
  }

  beforeEach(() => {
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
  })

  test('401 when unauthenticated', async () => {
    const out = await callList(null)
    expect(out.status).toBe(401)
  })

  test('403 for non-hospital role', async () => {
    const out = await callList({ id: PATIENT_USER_ID, role: 'PATIENT' })
    expect(out.status).toBe(403)
  })

  test('lists alerts addressed to the requesting hospital only', async () => {
    mockPrisma.emergencyAlert.findMany.mockResolvedValue([makeAlert()])
    const out = await callList()
    expect(out.status).toBe(200)
    expect(out.body.alerts).toHaveLength(1)
    expect(mockPrisma.emergencyAlert.findMany).toHaveBeenCalledWith({
      where: { hospitalId: HOSPITAL_ID },
      orderBy: { createdAt: 'desc' },
      include: { patient: { include: { user: true } }, consultation: true },
    })
  })
})

async function callHospitalAlertAction(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void,
  body: unknown,
  query: Record<string, unknown> = { id: ALERT_ID },
  token: Record<string, unknown> | null = { id: HOSPITAL_USER_ID, role: 'HOSPITAL' }
) {
  mockGetToken.mockResolvedValue(token)
  const req = createRequest({ method: 'POST', query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return { status: res.statusCode, body: await jsonData(res) }
}

describe('POST /api/hospital/emergency/[id]/acknowledge', () => {
  beforeEach(() => {
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
    mockPrisma.emergencyAlert.findUnique.mockResolvedValue(makeAlert())
    mockPrisma.emergencyAlert.update.mockResolvedValue(makeAlert({ status: 'ACKNOWLEDGED' }))
  })

  test('401 when unauthenticated', async () => {
    const out = await callHospitalAlertAction(acknowledgeHandler, {}, { id: ALERT_ID }, null)
    expect(out.status).toBe(401)
  })

  test('403 for non-hospital role', async () => {
    const out = await callHospitalAlertAction(acknowledgeHandler, {}, { id: ALERT_ID }, { id: PATIENT_USER_ID, role: 'PATIENT' })
    expect(out.status).toBe(403)
  })

  test("403 when the alert belongs to another hospital", async () => {
    mockPrisma.emergencyAlert.findUnique.mockResolvedValue(makeAlert({ hospitalId: OTHER_HOSPITAL_ID }))
    const out = await callHospitalAlertAction(acknowledgeHandler, {})
    expect(out.status).toBe(403)
    expect(mockPrisma.emergencyAlert.update).not.toHaveBeenCalled()
  })

  test('404 when the alert does not exist', async () => {
    mockPrisma.emergencyAlert.findUnique.mockResolvedValue(null)
    const out = await callHospitalAlertAction(acknowledgeHandler, {})
    expect(out.status).toBe(404)
  })

  test('acknowledges the alert and writes an audit event', async () => {
    const out = await callHospitalAlertAction(acknowledgeHandler, {})
    expect(out.status).toBe(200)
    expect(out.body.alert.status).toBe('ACKNOWLEDGED')
    expect(mockPrisma.emergencyAlert.update).toHaveBeenCalledWith({
      where: { id: ALERT_ID },
      data: expect.objectContaining({ status: 'ACKNOWLEDGED', acknowledgedBy: HOSPITAL_USER_ID, acknowledgedAt: expect.any(Date) }),
    })
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'EMERGENCY_ACKNOWLEDGED', patientId: PATIENT_ID }),
    })
  })
})

describe('POST /api/hospital/emergency/[id]/resolve', () => {
  beforeEach(() => {
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
    mockPrisma.emergencyAlert.findUnique.mockResolvedValue(makeAlert({ status: 'ACKNOWLEDGED' }))
    mockPrisma.emergencyAlert.update.mockResolvedValue(makeAlert({ status: 'RESOLVED' }))
  })

  test('401 when unauthenticated', async () => {
    const out = await callHospitalAlertAction(resolveHandler, {}, { id: ALERT_ID }, null)
    expect(out.status).toBe(401)
  })

  test('403 for non-hospital role', async () => {
    const out = await callHospitalAlertAction(resolveHandler, {}, { id: ALERT_ID }, { id: PATIENT_USER_ID, role: 'PATIENT' })
    expect(out.status).toBe(403)
  })

  test('403 when the alert belongs to another hospital', async () => {
    mockPrisma.emergencyAlert.findUnique.mockResolvedValue(makeAlert({ hospitalId: OTHER_HOSPITAL_ID }))
    const out = await callHospitalAlertAction(resolveHandler, {})
    expect(out.status).toBe(403)
    expect(mockPrisma.emergencyAlert.update).not.toHaveBeenCalled()
  })

  test('404 when the alert does not exist', async () => {
    mockPrisma.emergencyAlert.findUnique.mockResolvedValue(null)
    const out = await callHospitalAlertAction(resolveHandler, {})
    expect(out.status).toBe(404)
  })

  test('400 for an invalid action', async () => {
    const out = await callHospitalAlertAction(resolveHandler, { action: 'IGNORE' })
    expect(out.status).toBe(400)
  })

  test('resolves the alert to RESOLVED by default and writes an audit event', async () => {
    const out = await callHospitalAlertAction(resolveHandler, {})
    expect(out.status).toBe(200)
    expect(out.body.alert.status).toBe('RESOLVED')
    expect(mockPrisma.emergencyAlert.update).toHaveBeenCalledWith({
      where: { id: ALERT_ID },
      data: expect.objectContaining({ status: 'RESOLVED', resolvedBy: HOSPITAL_USER_ID, resolvedAt: expect.any(Date) }),
    })
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'EMERGENCY_RESOLVED', patientId: PATIENT_ID }),
    })
  })

  test('cancels the alert to CANCELLED when action is CANCEL', async () => {
    mockPrisma.emergencyAlert.update.mockResolvedValue(makeAlert({ status: 'CANCELLED' }))
    const out = await callHospitalAlertAction(resolveHandler, { action: 'CANCEL' })
    expect(out.status).toBe(200)
    expect(mockPrisma.emergencyAlert.update).toHaveBeenCalledWith({
      where: { id: ALERT_ID },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    })
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'EMERGENCY_CANCELLED' }),
    })
  })
})

describe('EmergencyAlert lifecycle transitions', () => {
  beforeEach(() => {
    mockPrisma.hospital.findUnique.mockResolvedValue({ id: HOSPITAL_ID, userId: HOSPITAL_USER_ID })
  })

  test('OPEN -> ACKNOWLEDGED -> RESOLVED sequence applies the right status', async () => {
    mockPrisma.emergencyAlert.findUnique.mockResolvedValue(makeAlert({ status: 'OPEN' }))
    mockPrisma.emergencyAlert.update.mockResolvedValue(makeAlert({ status: 'ACKNOWLEDGED' }))
    const ack = await callHospitalAlertAction(acknowledgeHandler, {})
    expect(ack.body.alert.status).toBe('ACKNOWLEDGED')

    mockPrisma.emergencyAlert.findUnique.mockResolvedValue(makeAlert({ status: 'ACKNOWLEDGED' }))
    mockPrisma.emergencyAlert.update.mockResolvedValue(makeAlert({ status: 'RESOLVED' }))
    const resolved = await callHospitalAlertAction(resolveHandler, {})
    expect(resolved.body.alert.status).toBe('RESOLVED')
    expect(mockPrisma.emergencyAlert.update).toHaveBeenCalledTimes(2)
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledTimes(2)
  })
})