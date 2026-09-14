import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'

jest.mock('next-auth/react', () => ({ getSession: jest.fn() }))

jest.mock('../src/lib/storage', () => ({
  deleteFile: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    medicalDocument: { findUnique: jest.fn(), delete: jest.fn() },
    documentProcessing: { deleteMany: jest.fn() },
    extractedMedicalData: { deleteMany: jest.fn() },
    medicalTimeline: { updateMany: jest.fn() },
    accessAudit: { create: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import { deleteFile } from '../src/lib/storage'
import handler from '../src/pages/api/patient/documents/[id]'

const mockGetSession = getSession as jest.Mock
const mockPrisma = prisma as any
const mockDeleteFile = deleteFile as jest.Mock

const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000101'
const DOC_ID = '00000000-0000-0000-0000-000000000120'

const session = { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }

const doc = {
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
}

async function callHandler(method = 'DELETE', query: Record<string, unknown> = { id: DOC_ID }) {
  const req = createRequest({ method: method as any, query }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  await new Promise((r) => setImmediate(r))
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue(session)
  mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: PATIENT_USER_ID })
  mockPrisma.medicalDocument.findUnique.mockResolvedValue(doc)
  mockPrisma.documentProcessing.deleteMany.mockResolvedValue({ count: 2 })
  mockPrisma.extractedMedicalData.deleteMany.mockResolvedValue({ count: 1 })
  mockPrisma.medicalTimeline.updateMany.mockResolvedValue({ count: 0 })
  mockPrisma.medicalDocument.delete.mockResolvedValue(doc)
  mockPrisma.accessAudit.create.mockResolvedValue({})
  mockDeleteFile.mockResolvedValue(undefined)
})

describe('DELETE /api/patient/documents/[id]', () => {
  test('cleans up dependent rows in a transaction before deleting the document and file', async () => {
    const res = await callHandler()

    expect(res.statusCode).toBe(200)
    expect(res._getJSONData()).toEqual({ ok: true })

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    const ops = mockPrisma.$transaction.mock.calls[0][0]
    expect(ops).toHaveLength(4)
    expect(mockPrisma.documentProcessing.deleteMany).toHaveBeenCalledWith({ where: { documentId: DOC_ID } })
    expect(mockPrisma.extractedMedicalData.deleteMany).toHaveBeenCalledWith({ where: { documentId: DOC_ID } })
    expect(mockPrisma.medicalTimeline.updateMany).toHaveBeenCalledWith({
      where: { sourceDocumentId: DOC_ID },
      data: { sourceDocumentId: null },
    })
    expect(mockPrisma.medicalDocument.delete).toHaveBeenCalledWith({ where: { id: DOC_ID } })
    expect(mockDeleteFile).toHaveBeenCalledWith(`${PATIENT_ID}/abc.pdf`)
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'DOCUMENT_DELETE' }) })
    )
  })

  test("another patient's document is not deleted (404, no leak)", async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue({ ...doc, patientId: 'other-patient' })

    const res = await callHandler()

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockDeleteFile).not.toHaveBeenCalled()
    expect(mockPrisma.accessAudit.create).not.toHaveBeenCalled()
  })

  test('missing document returns 404 without touching storage', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(null)

    const res = await callHandler()

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockDeleteFile).not.toHaveBeenCalled()
  })

  test('unauthenticated request returns 401', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await callHandler()
    expect(res.statusCode).toBe(401)
    expect(mockPrisma.medicalDocument.findUnique).not.toHaveBeenCalled()
  })

  test('file cleanup failure still reports a successful delete (no orphaned DB row)', async () => {
    mockDeleteFile.mockRejectedValue(new Error('storage unavailable'))

    const res = await callHandler()

    expect(res.statusCode).toBe(200)
    expect(res._getJSONData()).toEqual({ ok: true })
  })

  test('non-DELETE method is rejected with 405', async () => {
    const res = await callHandler('PUT')
    expect(res.statusCode).toBe(405)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})