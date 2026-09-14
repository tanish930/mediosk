import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'
import fs from 'fs'
import os from 'os'
import path from 'path'

jest.mock('next-auth/react', () => ({ getSession: jest.fn() }))

jest.mock('../src/lib/storage', () => ({
  uploadFile: jest.fn(),
  readFile: jest.fn(),
}))

jest.mock('formidable', () => {
  class IncomingForm {
    parse(_req: any, cb: (err: unknown, fields: any, files: any) => void) {
      const g = global as any
      cb(null, g.__docFields || {}, g.__docFiles || {})
    }
  }
  return { IncomingForm }
})

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    preConsultationSession: { findUnique: jest.fn() },
    medicalDocument: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    documentProcessing: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    accessAudit: { create: jest.fn() },
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import { uploadFile, readFile } from '../src/lib/storage'
import documentsIndexHandler from '../src/pages/api/patient/documents/index'
import documentFileHandler from '../src/pages/api/patient/documents/[id]/file'
import documentRetryHandler from '../src/pages/api/patient/documents/[id]/retry'

const mockGetSession = getSession as jest.Mock
const mockPrisma = prisma as any
const mockUploadFile = uploadFile as jest.Mock
const mockReadFile = readFile as jest.Mock

const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000101'
const OTHER_PATIENT_USER_ID = '00000000-0000-0000-0000-000000000102'
const SESSION_ID = '00000000-0000-0000-0000-000000000110'
const DOC_ID = '00000000-0000-0000-0000-000000000120'
const PROCESSING_ID = '00000000-0000-0000-0000-000000000130'

const session = { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }

function tempPdf(name = 'rx.pdf') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediosk-doc-'))
  const filepath = path.join(dir, name)
  const data = Buffer.from('%PDF-1.4 mock content')
  fs.writeFileSync(filepath, data)
  return { dir, filepath, data }
}

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

async function callHandler(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void, method: string, query: Record<string, unknown> = {}, body?: unknown) {
  const req = createRequest({ method: method as any, query, body: body as any }) as unknown as NextApiRequest
  const res = createResponse()
  await handler(req as any, res as any)
  await new Promise((r) => setImmediate(r))
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue(session)
  mockPrisma.patient.findUnique.mockResolvedValue({ id: PATIENT_ID, userId: PATIENT_USER_ID })
})

describe('GET /api/patient/documents - processing status', () => {
  test('document list includes the latest processing status', async () => {
    mockPrisma.medicalDocument.findMany.mockResolvedValue([
      makeDoc({ processing: [{ id: PROCESSING_ID, status: 'COMPLETED', error: null }, { id: 'old', status: 'PENDING', error: null }] }),
    ])

    const res = await callHandler(documentsIndexHandler, 'GET')
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.documents).toHaveLength(1)
    expect(body.documents[0].processing.status).toBe('COMPLETED')
    expect(mockPrisma.medicalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patientId: PATIENT_ID }),
        include: expect.objectContaining({ processing: expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 1 }) }),
      })
    )
  })

  test('documents without a job expose null processing', async () => {
    mockPrisma.medicalDocument.findMany.mockResolvedValue([makeDoc({ processing: [] })])

    const res = await callHandler(documentsIndexHandler, 'GET')
    const body = res._getJSONData()

    expect(body.documents[0].processing).toBeNull()
  })

  test('GET with foreign sessionId is rejected', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({ id: SESSION_ID, patientId: 'other-patient' })

    const res = await callHandler(documentsIndexHandler, 'GET', { sessionId: SESSION_ID })

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.medicalDocument.findMany).not.toHaveBeenCalled()
  })

  test('GET filters by owned sessionId', async () => {
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({ id: SESSION_ID, patientId: PATIENT_ID })
    mockPrisma.medicalDocument.findMany.mockResolvedValue([makeDoc({ processing: [{ status: 'COMPLETED', error: null }] })])

    const res = await callHandler(documentsIndexHandler, 'GET', { sessionId: SESSION_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.medicalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patientId: PATIENT_ID, preConsultationSessionId: SESSION_ID }),
      })
    )
    expect(body.documents).toHaveLength(1)
  })
})

describe('POST /api/patient/documents - session linkage', () => {
  test('upload with valid sessionId links the document to the session', async () => {
    const pdf = tempPdf()
    ;(global as any).__docFields = { title: ['My prescription'], sessionId: [SESSION_ID] }
    ;(global as any).__docFiles = {
      file: { filepath: pdf.filepath, size: 100, mimetype: 'application/pdf', originalFilename: 'rx.pdf' },
    }
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({ id: SESSION_ID, patientId: PATIENT_ID })
    mockUploadFile.mockResolvedValue(`/uploads/${PATIENT_ID}/abc.pdf`)
    mockPrisma.medicalDocument.create.mockResolvedValue(makeDoc({ preConsultationSessionId: SESSION_ID }))

    const res = await callHandler(documentsIndexHandler, 'POST')
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.medicalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preConsultationSessionId: SESSION_ID,
          mimeType: 'application/pdf',
          size: 100,
          patientId: PATIENT_ID,
        }),
      })
    )
    expect(mockPrisma.documentProcessing.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ documentId: DOC_ID, status: 'PENDING' }) })
    )
    expect(body.document.id).toBe(DOC_ID)
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test("upload with another patient's sessionId is rejected", async () => {
    const pdf = tempPdf()
    ;(global as any).__docFields = { sessionId: [SESSION_ID] }
    ;(global as any).__docFiles = {
      file: { filepath: pdf.filepath, size: 100, mimetype: 'application/pdf', originalFilename: 'rx.pdf' },
    }
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({ id: SESSION_ID, patientId: 'other-patient' })

    const res = await callHandler(documentsIndexHandler, 'POST')
    const body = res._getJSONData()

    expect(res.statusCode).toBe(404)
    expect(body.error).toBe('Session not found')
    expect(mockPrisma.medicalDocument.create).not.toHaveBeenCalled()
    expect(mockPrisma.documentProcessing.create).not.toHaveBeenCalled()
    expect(mockUploadFile).not.toHaveBeenCalled()
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('upload still works without sessionId', async () => {
    const pdf = tempPdf()
    ;(global as any).__docFields = { title: ['Standalone'] }
    ;(global as any).__docFiles = {
      file: { filepath: pdf.filepath, size: 50, mimetype: 'image/png', originalFilename: 'scan.png' },
    }
    mockUploadFile.mockResolvedValue(`/uploads/${PATIENT_ID}/id.png`)

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.preConsultationSession.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.medicalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preConsultationSessionId: null }) })
    )
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('upload rejects an invalid file type', async () => {
    const pdf = tempPdf('evil.txt')
    ;(global as any).__docFields = {}
    ;(global as any).__docFiles = {
      file: { filepath: pdf.filepath, size: 10, mimetype: 'text/plain', originalFilename: 'evil.txt' },
    }

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(400)
    expect(mockPrisma.medicalDocument.create).not.toHaveBeenCalled()
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('upload returns 500 instead of hanging when storage upload fails', async () => {
    const pdf = tempPdf()
    ;(global as any).__docFields = { sessionId: [SESSION_ID] }
    ;(global as any).__docFiles = {
      file: { filepath: pdf.filepath, size: 100, mimetype: 'application/pdf', originalFilename: 'rx.pdf' },
    }
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({ id: SESSION_ID, patientId: PATIENT_ID })
    mockUploadFile.mockRejectedValue(new Error('No value provided for input HTTP label: Bucket.'))

    const res = await callHandler(documentsIndexHandler, 'POST')
    const body = res._getJSONData()

    expect(res.statusCode).toBe(500)
    expect(body.error).toBe('Upload failed')
    expect(mockPrisma.medicalDocument.create).not.toHaveBeenCalled()
    expect(mockPrisma.documentProcessing.create).not.toHaveBeenCalled()
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('upload returns 500 instead of hanging when database write fails', async () => {
    const pdf = tempPdf()
    ;(global as any).__docFields = { sessionId: [SESSION_ID] }
    ;(global as any).__docFiles = {
      file: { filepath: pdf.filepath, size: 100, mimetype: 'application/pdf', originalFilename: 'rx.pdf' },
    }
    mockPrisma.preConsultationSession.findUnique.mockResolvedValue({ id: SESSION_ID, patientId: PATIENT_ID })
    mockUploadFile.mockResolvedValue(`/uploads/${PATIENT_ID}/abc.pdf`)
    mockPrisma.medicalDocument.create.mockRejectedValue(new Error('db connection failed'))

    const res = await callHandler(documentsIndexHandler, 'POST')
    const body = res._getJSONData()

    expect(res.statusCode).toBe(500)
    expect(body.error).toBe('Upload failed')
    expect(mockPrisma.documentProcessing.create).not.toHaveBeenCalled()
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })
})

describe('GET /api/patient/documents/[id]/file - secure file serving', () => {
  test('owner can stream their document with stored mimeType and audit', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc())
    mockReadFile.mockResolvedValue(Buffer.from('%PDF-1.4 mock content'))

    const res = await callHandler(documentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(200)
    expect(mockReadFile).toHaveBeenCalledWith(`${PATIENT_ID}/abc.pdf`)
    expect(res.getHeader('Content-Type')).toBe('application/pdf')
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff')
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'DOCUMENT_VIEW' }) })
    )
  })

  test('patient cannot access another patient document (404, no leak)', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc({ patientId: 'other-patient' }))

    const res = await callHandler(documentFileHandler, 'GET', { id: DOC_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(404)
    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockPrisma.accessAudit.create).not.toHaveBeenCalled()
  })

  test('missing document returns 404', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(null)

    const res = await callHandler(documentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(404)
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('unauthenticated request returns 401', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await callHandler(documentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(401)
  })

  test('read failure returns 404 and never leaks the file', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc())
    mockReadFile.mockRejectedValue(new Error('not found'))

    const res = await callHandler(documentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(404)
  })

  test('unsafe stored mimeTypes are downgraded to octet-stream', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(
      makeDoc({ mimeType: 'text/html', url: `/uploads/${PATIENT_ID}/note.bin` })
    )
    mockReadFile.mockResolvedValue(Buffer.from('<script>alert(1)</script>'))

    const res = await callHandler(documentFileHandler, 'GET', { id: DOC_ID })

    expect(res.statusCode).toBe(200)
    expect(res.getHeader('Content-Type')).toBe('application/octet-stream')
  })

  test('non-GET method is rejected with 405', async () => {
    const res = await callHandler(documentFileHandler, 'POST', { id: DOC_ID })
    expect(res.statusCode).toBe(405)
  })
})

describe('POST /api/patient/documents/[id]/retry', () => {
  test('owner can retry a FAILED document', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc())
    mockPrisma.documentProcessing.findFirst.mockResolvedValue({ id: PROCESSING_ID, status: 'FAILED', error: 'boom' })
    mockPrisma.documentProcessing.update.mockResolvedValue({ id: PROCESSING_ID, status: 'PENDING', error: null })

    const res = await callHandler(documentRetryHandler, 'POST', { id: DOC_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockPrisma.documentProcessing.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROCESSING_ID }, data: { status: 'PENDING', error: null } })
    )
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'DOCUMENT_RETRY' }) })
    )
  })

  test('non-FAILED job cannot be retried', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc())
    mockPrisma.documentProcessing.findFirst.mockResolvedValue({ id: PROCESSING_ID, status: 'COMPLETED', error: null })

    const res = await callHandler(documentRetryHandler, 'POST', { id: DOC_ID })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(409)
    expect(body.error).toBe('Only failed documents can be retried')
    expect(mockPrisma.documentProcessing.update).not.toHaveBeenCalled()
    expect(mockPrisma.accessAudit.create).not.toHaveBeenCalled()
  })

  test('document with no processing job cannot be retried', async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc())
    mockPrisma.documentProcessing.findFirst.mockResolvedValue(null)

    const res = await callHandler(documentRetryHandler, 'POST', { id: DOC_ID })

    expect(res.statusCode).toBe(409)
    expect(mockPrisma.documentProcessing.update).not.toHaveBeenCalled()
  })

  test("another patient's document cannot be retried (404, no leak)", async () => {
    mockPrisma.medicalDocument.findUnique.mockResolvedValue(makeDoc({ patientId: 'other-patient' }))

    const res = await callHandler(documentRetryHandler, 'POST', { id: DOC_ID })

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.documentProcessing.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.accessAudit.create).not.toHaveBeenCalled()
  })

  test('unauthenticated request returns 401', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await callHandler(documentRetryHandler, 'POST', { id: DOC_ID })

    expect(res.statusCode).toBe(401)
  })
})