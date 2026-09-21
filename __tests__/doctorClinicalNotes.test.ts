import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    doctor: { findUnique: jest.fn() },
    consultation: { findUnique: jest.fn() },
    consent: { findFirst: jest.fn() },
    clinicalNote: { create: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import notesHandler from '../src/pages/api/doctor/case/[id]/notes'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const DOCTOR_ID = '00000000-0000-0000-0000-000000000200'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000201'
const OTHER_DOCTOR_ID = '00000000-0000-0000-0000-000000000202'
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000210'
const PATIENT_ID = '00000000-0000-0000-0000-000000000100'

const doctorToken = { id: DOCTOR_USER_ID, role: 'DOCTOR' }

function consultation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    status: 'IN_PROGRESS',
    ...overrides,
  }
}

async function callHandler(method: string, body: unknown, token: Record<string, unknown> | null, query: Record<string, unknown> = { id: CONSULTATION_ID }) {
  mockGetToken.mockResolvedValue(token)
  const req = createRequest({ method: method as any, query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await notesHandler(req as any, res as any)
  await new Promise((r) => setImmediate(r))
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
  mockGetToken.mockResolvedValue(doctorToken)
  mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
  mockPrisma.consultation.findUnique.mockResolvedValue(consultation())
  mockPrisma.consent.findFirst.mockResolvedValue(null)
  mockPrisma.clinicalNote.create.mockImplementation((args: any) =>
    Promise.resolve({ id: 'note-1', ...args.data, createdAt: new Date(), updatedAt: new Date() })
  )
  mockPrisma.accessAudit.create.mockResolvedValue({})
})

describe('POST /api/doctor/case/[id]/notes', () => {
  test('assigned doctor can create a note', async () => {
    const result = await callHandler('POST', { text: 'Patient reports stable.' }, doctorToken)

    expect(result.status).toBe(200)
    expect(result.body.ok).toBe(true)
    expect(mockPrisma.clinicalNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consultationId: CONSULTATION_ID,
          doctorId: DOCTOR_ID,
          text: 'Patient reports stable.',
        }),
      })
    )
    expect(result.body.note.text).toBe('Patient reports stable.')
  })

  test('note text is trimmed before saving', async () => {
    await callHandler('POST', { text: '  Patient stable.  ' }, doctorToken)

    expect(mockPrisma.clinicalNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ text: 'Patient stable.' }),
      })
    )
  })

  test('assigned doctor can create multiple notes', async () => {
    await callHandler('POST', { text: 'First note.' }, doctorToken)
    await callHandler('POST', { text: 'Second note.' }, doctorToken)

    expect(mockPrisma.clinicalNote.create).toHaveBeenCalledTimes(2)
  })

  test('empty note is rejected', async () => {
    const result = await callHandler('POST', { text: '' }, doctorToken)

    expect(result.status).toBe(400)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('whitespace-only note is rejected', async () => {
    const result = await callHandler('POST', { text: '   \n\t  ' }, doctorToken)

    expect(result.status).toBe(400)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('missing text is rejected', async () => {
    const result = await callHandler('POST', {}, doctorToken)

    expect(result.status).toBe(400)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('malformed body is rejected safely', async () => {
    const result = await callHandler('POST', 'not-an-object', doctorToken)

    expect(result.status).toBe(400)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('over-limit note is rejected', async () => {
    const result = await callHandler('POST', { text: 'x'.repeat(5001) }, doctorToken)

    expect(result.status).toBe(400)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('consent-authorized non-assigned doctor cannot create a note', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(consultation({ doctorId: OTHER_DOCTOR_ID }))
    mockPrisma.consent.findFirst.mockResolvedValue({
      id: 'consent-1',
      patientId: PATIENT_ID,
      granteeDoctorId: DOCTOR_ID,
      granted: true,
    })

    const result = await callHandler('POST', { text: 'Should not be written.' }, doctorToken)

    expect(result.status).toBe(403)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('unrelated doctor (no assignment/consent) cannot create a note', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(consultation({ doctorId: OTHER_DOCTOR_ID }))
    mockPrisma.consent.findFirst.mockResolvedValue(null)

    const result = await callHandler('POST', { text: 'Should not be written.' }, doctorToken)

    expect(result.status).toBe(403)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('patient cannot create a note', async () => {
    const result = await callHandler(
      'POST',
      { text: 'Patient written note.' },
      { id: 'patient-user', role: 'PATIENT' }
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('hospital cannot create a note', async () => {
    const result = await callHandler(
      'POST',
      { text: 'Hospital written note.' },
      { id: 'hospital-user', role: 'HOSPITAL' }
    )

    expect(result.status).toBe(403)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('unauthenticated request is rejected', async () => {
    const result = await callHandler('POST', { text: 'Anonymous.' }, null)

    expect(result.status).toBe(401)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })

  test('AccessAudit is created for a saved note', async () => {
    await callHandler('POST', { text: 'Audited note.' }, doctorToken)

    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: DOCTOR_USER_ID,
          actorRole: 'DOCTOR',
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          consultationId: CONSULTATION_ID,
          action: 'CONSULTATION_NOTE_CREATED',
        }),
      })
    )
  })

  test('non-POST requests are rejected', async () => {
    const result = await callHandler('GET', null, doctorToken)

    expect(result.status).toBe(405)
    expect(mockPrisma.clinicalNote.create).not.toHaveBeenCalled()
  })
})