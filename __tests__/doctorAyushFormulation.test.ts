import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    ayushFormulationSuggestion: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    doctor: { findUnique: jest.fn() },
    consultation: { findUnique: jest.fn() },
    consent: { findFirst: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import formulationHandler from '../src/pages/api/doctor/ayush/formulation/[id]'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any

const DOCTOR_ID = '00000000-0000-0000-0000-000000000200'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000201'
const OTHER_DOCTOR_ID = '00000000-0000-0000-0000-000000000202'
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000210'
const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const SUGGESTION_ID = '00000000-0000-0000-0000-000000000220'

const doctorToken = { id: DOCTOR_USER_ID, role: 'DOCTOR' }

const suggestion = {
  id: SUGGESTION_ID,
  patientId: PATIENT_ID,
  consultationId: CONSULTATION_ID,
  formularyId: 'demo-trikatu',
  formulationName: 'Trikatu (demo)',
  category: 'Digestive support',
  rationale: 'Requires doctor review.',
  matchedDoshas: ['vata'],
  status: 'SUGGESTED',
  active: true,
}

async function callHandler(method: string, query: Record<string, unknown> = {}, body?: unknown) {
  const req = createRequest({ method: method as any, query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await formulationHandler(req as any, res as any)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue(doctorToken)
  mockPrisma.ayushFormulationSuggestion.findUnique.mockResolvedValue(suggestion)
  mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
  mockPrisma.consultation.findUnique.mockResolvedValue({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
  })
  mockPrisma.consent.findFirst.mockResolvedValue(null)
  mockPrisma.ayushFormulationSuggestion.update.mockImplementation((args: any) =>
    Promise.resolve({ ...suggestion, ...args.data, reviewedById: DOCTOR_ID, reviewedAt: new Date() })
  )
  mockPrisma.accessAudit.create.mockResolvedValue({ id: 'audit-1' })
})

describe('POST /api/doctor/ayush/formulation/[id]', () => {
  test('assigned doctor can approve a suggestion and an audit entry is written', async () => {
    const res = await callHandler('POST', { id: SUGGESTION_ID }, { status: 'APPROVED', note: 'Appropriate for this case' })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.suggestion.status).toBe('APPROVED')
    expect(mockPrisma.ayushFormulationSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SUGGESTION_ID },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewerNote: 'Appropriate for this case',
          reviewedById: DOCTOR_ID,
          reviewedAt: expect.any(Date),
        }),
      })
    )
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: DOCTOR_USER_ID,
          actorRole: 'DOCTOR',
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          consultationId: CONSULTATION_ID,
          action: 'AYUSH_FORMULATION_APPROVED',
        }),
      })
    )
  })

  test('assigned doctor can reject a suggestion with an audit entry', async () => {
    const res = await callHandler('POST', { id: SUGGESTION_ID }, { status: 'REJECTED' })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.suggestion.status).toBe('REJECTED')
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'AYUSH_FORMULATION_REJECTED' }) })
    )
  })

  test('a repeat of the same review decision is idempotent but refreshes the note', async () => {
    await callHandler('POST', { id: SUGGESTION_ID }, { status: 'APPROVED', note: 'First note' })
    await callHandler('POST', { id: SUGGESTION_ID }, { status: 'APPROVED', note: 'Updated note' })

    expect(mockPrisma.ayushFormulationSuggestion.update).toHaveBeenCalledTimes(2)
    expect(mockPrisma.ayushFormulationSuggestion.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewerNote: 'Updated note' }) })
    )
  })

  test('unauthorized doctor (no assignment, no consent) is denied', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: CONSULTATION_ID,
      doctorId: OTHER_DOCTOR_ID,
      patientId: PATIENT_ID,
    })

    const res = await callHandler('POST', { id: SUGGESTION_ID }, { status: 'APPROVED' })

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.ayushFormulationSuggestion.update).not.toHaveBeenCalled()
    expect(mockPrisma.accessAudit.create).not.toHaveBeenCalled()
  })

  test('doctor with granted patient consent can review', async () => {
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

    const res = await callHandler('POST', { id: SUGGESTION_ID }, { status: 'APPROVED' })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.ayushFormulationSuggestion.update).toHaveBeenCalled()
  })

  test('unauthenticated request returns 401', async () => {
    mockGetToken.mockResolvedValue(null)
    const res = await callHandler('POST', { id: SUGGESTION_ID }, { status: 'APPROVED' })
    expect(res.statusCode).toBe(401)
    expect(mockPrisma.ayushFormulationSuggestion.update).not.toHaveBeenCalled()
  })

  test('non-doctor role returns 403', async () => {
    mockGetToken.mockResolvedValue({ id: 'patient-user', role: 'PATIENT' })
    const res = await callHandler('POST', { id: SUGGESTION_ID }, { status: 'APPROVED' })
    expect(res.statusCode).toBe(403)
  })

  test('invalid status returns 400', async () => {
    const res = await callHandler('POST', { id: SUGGESTION_ID }, { status: 'MAYBE' })
    expect(res.statusCode).toBe(400)
    expect(mockPrisma.ayushFormulationSuggestion.update).not.toHaveBeenCalled()
  })

  test('missing suggestion returns 404', async () => {
    mockPrisma.ayushFormulationSuggestion.findUnique.mockResolvedValue(null)
    const res = await callHandler('POST', { id: SUGGESTION_ID }, { status: 'APPROVED' })
    expect(res.statusCode).toBe(404)
  })

  test('non-POST method returns 405', async () => {
    const res = await callHandler('GET', { id: SUGGESTION_ID })
    expect(res.statusCode).toBe(405)
  })
})