import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import handler from '../src/pages/api/patient/fhir'

const mockGetSession = getSession as jest.Mock
const mockPatient = prisma.patient as any
const mockAudit = prisma.accessAudit as any

const OWN_PATIENT = {
  id: 'pat1',
  userId: 'u1',
  abhaId: '10-1234-5678-9012',
  dob: new Date('1990-01-01'),
  gender: 'female',
  user: { id: 'u1', name: 'Test User', email: 'test@mediosk.demo' },
  documents: [
    {
      id: 'doc1',
      category: 'prescription',
      title: 'Rx',
      documentDate: null,
      uploadedAt: new Date('2026-01-03'),
      url: 'https://storage.example/doc1',
      extractions: [],
      processing: [],
    },
  ],
  timelines: [],
  summaries: [],
  consultations: [],
  ayushAssessments: [],
}

async function callHandler() {
  const req = createRequest({ method: 'GET' }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  return res
}

function findResource(bundle: any, resourceType: string) {
  return bundle.entry.find((e: any) => e.resource.resourceType === resourceType)?.resource
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1', role: 'PATIENT' } })
  mockPatient.findUnique.mockResolvedValue(OWN_PATIENT)
  mockAudit.create.mockResolvedValue({ id: 'audit-1' })
})

describe('GET /api/patient/fhir', () => {
  test('an authenticated patient can export a FHIR bundle of their own record', async () => {
    const res = await callHandler()
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('Content-Type')).toBe('application/fhir+json')

    const bundle = res._getJSONData()
    expect(bundle.resourceType).toBe('Bundle')
    expect(bundle.type).toBe('document')

    const patientRes = findResource(bundle, 'Patient')
    expect(patientRes.id).toBe('pat1')
    expect(patientRes.name).toEqual([{ text: 'Test User' }])
    expect(patientRes.identifier).toEqual([{ system: 'https://abdm.gov.in/abha', value: '10-1234-5678-9012' }])
  })

  test('included resources are scoped to the authenticated patient', async () => {
    const res = await callHandler()
    const bundle = res._getJSONData()
    const docRef = findResource(bundle, 'DocumentReference')
    expect(docRef.id).toBe('doc1')
    expect(docRef.subject).toEqual({ reference: 'Patient/pat1' })
  })

  test('looks the record up only by the authenticated user id', async () => {
    await callHandler()
    expect(mockPatient.findUnique).toHaveBeenCalledTimes(1)
    const arg: any = mockPatient.findUnique.mock.calls[0][0]
    expect(arg.where.userId).toBe('u1')
  })

  test('identity always comes from the session, never from the request', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u2', role: 'PATIENT' } })
    mockPatient.findUnique.mockResolvedValue({ ...OWN_PATIENT, id: 'pat2', userId: 'u2' })
    const res = await callHandler()
    expect(mockPatient.findUnique.mock.calls[0][0].where.userId).toBe('u2')
    const patientRes = findResource(res._getJSONData(), 'Patient')
    expect(patientRes.id).toBe('pat2')
  })

  test('does not expose another patient record even if the request names one', async () => {
    const req = createRequest({ method: 'GET', query: { patientId: 'pat999' } }) as unknown as NextApiRequest
    const res = createResponse()
    await handler(req as any, res as any)
    expect(mockPatient.findUnique.mock.calls[0][0].where.userId).toBe('u1')
    const patientRes = findResource(res._getJSONData(), 'Patient')
    expect(patientRes.id).toBe('pat1')
    expect(patientRes.name).toEqual([{ text: 'Test User' }])
  })

  test('rejects unauthenticated requests', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await callHandler()
    expect(res.statusCode).toBe(401)
    expect(mockPatient.findUnique).not.toHaveBeenCalled()
  })

  test('rejects non-patient roles', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1', role: 'DOCTOR' } })
    const res = await callHandler()
    expect(res.statusCode).toBe(403)
    expect(mockPatient.findUnique).not.toHaveBeenCalled()
  })

  test('writes a single FHIR_EXPORT audit event per export', async () => {
    await callHandler()
    expect(mockAudit.create).toHaveBeenCalledTimes(1)
    const arg: any = mockAudit.create.mock.calls[0][0]
    expect(arg.data.actorId).toBe('u1')
    expect(arg.data.patientId).toBe('pat1')
    expect(arg.data.action).toBe('FHIR_EXPORT')
  })
})