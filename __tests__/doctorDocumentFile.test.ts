import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))

jest.mock('../src/lib/storage', () => ({
  readFile: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    doctor: { findUnique: jest.fn() },
    medicalDocument: { findUnique: jest.fn() },
    consultation: { findFirst: jest.fn() },
    consent: { findFirst: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getToken } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'
import { readFile } from '../src/lib/storage'
import doctorDocumentFileHandler from '../src/pages/api/doctor/documents/[id]/file'

const mockGetToken = getToken as jest.Mock
const mockPrisma = prisma as any
const mockReadFile = readFile as jest.Mock

const DOCTOR_ID = '00000000-0000-0000-0000-000000000200'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000201'
const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const DOC_ID = '00000000-0000-0000-0000-000000000120'

const doctorToken = { id: DOCTOR_USER_ID, role: 'DOCTOR' }

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    patientId: PATIENT_ID,
    title: 'Prescription',
    url: `/uploads/${PATIENT_ID}/abc.pdf`,
    category: null,
    documentDate: null,
    mimeType: 'application/pdf',
    size: 100,
    preConsultationSessionId: null,
    uploadedAt: new Date().toISOString(),
    ...overrides,
  }
}

async function callHandler(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void,
  method: string,
  query: Record<string, unknown> = {},
  body?: unknown
) {
  const req = createRequest({ method: method as any, query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  await new Promise((r) => setImmediate(r))
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue(doctorToken)
  mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
  mockPrisma.consultation.findFirst.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000210' })
  mockPrisma.consent.findFirst.mockResolvedValue(null)
})

describe('GET /api/doctor/documents/[id]/file - secure file serving', () => {
  test('assigned doctor can stream the document with mime type and audit', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc())
    mockReadFile.mockResolvedValue(Buffer.from('%PDF-1.4 mock content'))

    const res = await callHandler(doctorDocumentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.consultation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ patientId: PATIENT_ID, doctorId: DOCTOR_ID }) })
    )
    expect(mockReadFile).toHaveBeenCalledWith(`${PATIENT_ID}/abc.pdf`)
    expect(res.getHeader('Content-Type')).toBe('application/pdf')
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff')
    expect(res._getData().toString()).toContain('mock content')
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'DOCUMENT_VIEW', actorRole: 'DOCTOR', doctorId: DOCTOR_ID, patientId: PATIENT_ID }),
      })
    )
  })

  test('doctor granted consent by the patient can retrieve the document', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc())
    mockPrisma.consultation.findFirst.mockResolvedValue(null)
    mockPrisma.consent.findFirst.mockResolvedValue({ id: 'consent-1', granted: true })
    mockReadFile.mockResolvedValue(Buffer.from('%PDF-1.4 mock content'))

    const res = await callHandler(doctorDocumentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.consent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ patientId: PATIENT_ID, granteeDoctorId: DOCTOR_ID, granted: true }) })
    )
  })

  test('unauthorized doctor cannot retrieve the document (404, no leak)', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc())
    mockPrisma.consultation.findFirst.mockResolvedValue(null)
    mockPrisma.consent.findFirst.mockResolvedValue(null)

    const res = await callHandler(doctorDocumentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(404)
    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockPrisma.accessAudit.create).not.toHaveBeenCalled()
  })

  test('missing document returns 404', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(null)

    const res = await callHandler(doctorDocumentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(404)
    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockPrisma.consultation.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.accessAudit.create).not.toHaveBeenCalled()
  })

  test('missing underlying file returns 404 and never leaks the file', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc())
    mockReadFile.mockRejectedValue(new Error('File not found'))

    const res = await callHandler(doctorDocumentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.accessAudit.create).not.toHaveBeenCalled()
  })

  test('unauthenticated request returns 401', async () => {
    mockGetToken.mockResolvedValue(null)

    const res = await callHandler(doctorDocumentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(401)
    expect(mockPrisma.medicalDocument.findUnique).not.toHaveBeenCalled()
  })

  test('non-doctor role is rejected with 403', async () => {
    mockGetToken.mockResolvedValue({ id: 'some-user', role: 'PATIENT' })

    const res = await callHandler(doctorDocumentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.medicalDocument.findUnique).not.toHaveBeenCalled()
  })

  test('unsafe stored mimeTypes are downgraded to octet-stream', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(
      makeDoc({ mimeType: 'text/html', url: `/uploads/${PATIENT_ID}/note.bin` })
    )
    mockReadFile.mockResolvedValue(Buffer.from('<script>alert(1)</script>'))

    const res = await callHandler(doctorDocumentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(200)
    expect(res.getHeader('Content-Type')).toBe('application/octet-stream')
  })

  test('non-GET method is rejected with 405', async () => {
    const res = await callHandler(doctorDocumentFileHandler, 'POST', { id: DOC_ID })

    expect(res.statusCode).toBe(405)
    expect(mockGetToken).not.toHaveBeenCalled()
  })
})