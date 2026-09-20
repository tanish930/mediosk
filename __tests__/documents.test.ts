import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'
import fs from 'fs'
import os from 'os'
import path from 'path'

jest.mock('next-auth/react', () => ({ getSession: jest.fn() }))

jest.mock('../src/lib/storage', () => ({
  uploadFile: jest.fn(),
  readFile: jest.fn(),
  deleteFile: jest.fn(),
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
    $transaction: jest.fn(),
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import { uploadFile, readFile, deleteFile } from '../src/lib/storage'
import documentsIndexHandler from '../src/pages/api/patient/documents/index'
import documentFileHandler from '../src/pages/api/patient/documents/[id]/file'
import documentRetryHandler from '../src/pages/api/patient/documents/[id]/retry'

const mockGetSession = getSession as jest.Mock
const mockPrisma = prisma as any
const mockUploadFile = uploadFile as jest.Mock
const mockReadFile = readFile as jest.Mock
const mockDeleteFile = deleteFile as jest.Mock

const PATIENT_ID = '00000000-0000-0000-0000-000000000100'
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000101'
const OTHER_PATIENT_USER_ID = '00000000-0000-0000-0000-000000000102'
const SESSION_ID = '00000000-0000-0000-0000-000000000110'
const DOC_ID = '00000000-0000-0000-0000-000000000120'
const PROCESSING_ID = '00000000-0000-0000-0000-000000000130'

const session = { user: { id: PATIENT_USER_ID, role: 'PATIENT' } }

function tempFile(name: string, data: Buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediosk-doc-'))
  const filepath = path.join(dir, name)
  fs.writeFileSync(filepath, data)
  return { dir, filepath, data }
}

function tempPdf(name = 'rx.pdf') {
  return tempFile(name, Buffer.from('%PDF-1.4 mock content'))
}

function tempPng(name = 'scan.png') {
  return tempFile(
    name,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('mock png payload'),
    ])
  )
}

function tempJpeg(name = 'scan.jpg') {
  return tempFile(
    name,
    Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('mock jpeg payload'),
    ])
  )
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
  // Interactive transaction that applies every write through the mock client.
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
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
    const png = tempPng()
    ;(global as any).__docFields = { title: ['Standalone'] }
    ;(global as any).__docFiles = {
      file: { filepath: png.filepath, size: 50, mimetype: 'image/png', originalFilename: 'scan.png' },
    }
    mockUploadFile.mockResolvedValue(`/uploads/${PATIENT_ID}/id.png`)

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.preConsultationSession.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.medicalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preConsultationSessionId: null }) })
    )
    fs.rmSync(png.dir, { recursive: true, force: true })
  })

  test('upload rejects a content/type mismatch with a 400', async () => {
    const png = tempPng('evil.pdf')
    ;(global as any).__docFields = {}
    ;(global as any).__docFiles = {
      file: { filepath: png.filepath, size: 50, mimetype: 'application/pdf', originalFilename: 'evil.pdf' },
    }

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().error).toBe('Invalid file content')
    expect(mockUploadFile).not.toHaveBeenCalled()
    expect(mockPrisma.medicalDocument.create).not.toHaveBeenCalled()
    expect(mockPrisma.documentProcessing.create).not.toHaveBeenCalled()
    fs.rmSync(png.dir, { recursive: true, force: true })
  })

  test('upload canonicalizes image/jpg and ignores the original filename extension', async () => {
    const jpeg = tempJpeg('scan.png')
    ;(global as any).__docFields = { title: ['Report'] }
    ;(global as any).__docFiles = {
      file: { filepath: jpeg.filepath, size: 50, mimetype: 'image/jpg', originalFilename: 'scan.png' },
    }
    mockUploadFile.mockResolvedValue(`/uploads/${PATIENT_ID}/id.jpg`)

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(200)
    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    expect(mockUploadFile.mock.calls[0][1]).toMatch(
      new RegExp(`^${PATIENT_ID}/[0-9a-f-]+\\.jpg$`)
    )
    expect(mockUploadFile.mock.calls[0][2]).toBe('image/jpeg')
    expect(mockPrisma.medicalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mimeType: 'image/jpeg' }),
      })
    )
    fs.rmSync(jpeg.dir, { recursive: true, force: true })
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

describe('POST /api/patient/documents - upload consistency and cleanup', () => {
  const KEY_RE = new RegExp(`^${PATIENT_ID}/[0-9a-f-]+\\.pdf$`)

  function stageUpload(pdf: ReturnType<typeof tempPdf>) {
    ;(global as any).__docFields = {}
    ;(global as any).__docFiles = {
      file: { filepath: pdf.filepath, size: 100, mimetype: 'application/pdf', originalFilename: 'rx.pdf' },
    }
    mockUploadFile.mockResolvedValue(`/uploads/${PATIENT_ID}/abc.pdf`)
  }

  afterEach(() => {
    mockPrisma.medicalDocument.create.mockReset()
    mockPrisma.accessAudit.create.mockReset()
    mockPrisma.documentProcessing.create.mockReset()
    mockPrisma.$transaction.mockReset()
    mockUploadFile.mockReset()
    mockDeleteFile.mockReset()
  })

  test('successful upload records document, processing job, and upload audit', async () => {
    const pdf = tempPdf()
    stageUpload(pdf)
    mockPrisma.medicalDocument.create.mockResolvedValue(makeDoc())

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.medicalDocument.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.accessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: PATIENT_USER_ID,
          actorRole: 'PATIENT',
          patientId: PATIENT_ID,
          action: 'DOCUMENT_UPLOAD',
        }),
      })
    )
    expect(mockPrisma.documentProcessing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: DOC_ID,
          status: 'PENDING',
        }),
      })
    )
    expect(mockDeleteFile).not.toHaveBeenCalled()
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('medicalDocument creation failure removes the uploaded storage object', async () => {
    const pdf = tempPdf()
    stageUpload(pdf)
    mockPrisma.medicalDocument.create.mockRejectedValue(new Error('db write failed'))

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(500)
    expect(res._getJSONData().error).toBe('Upload failed')
    expect(mockDeleteFile).toHaveBeenCalledTimes(1)
    expect(mockDeleteFile).toHaveBeenCalledWith(expect.stringMatching(KEY_RE))
    expect(mockPrisma.documentProcessing.create).not.toHaveBeenCalled()
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('upload audit creation failure removes the uploaded storage object', async () => {
    const pdf = tempPdf()
    stageUpload(pdf)
    mockPrisma.medicalDocument.create.mockResolvedValue(makeDoc())
    mockPrisma.accessAudit.create.mockRejectedValue(new Error('audit write failed'))

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(500)
    expect(res._getJSONData().error).toBe('Upload failed')
    expect(mockDeleteFile).toHaveBeenCalledTimes(1)
    expect(mockDeleteFile).toHaveBeenCalledWith(expect.stringMatching(KEY_RE))
    expect(mockPrisma.documentProcessing.create).not.toHaveBeenCalled()
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('processing job creation failure removes the uploaded storage object', async () => {
    const pdf = tempPdf()
    stageUpload(pdf)
    mockPrisma.medicalDocument.create.mockResolvedValue(makeDoc())
    mockPrisma.documentProcessing.create.mockRejectedValue(new Error('job write failed'))

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(500)
    expect(res._getJSONData().error).toBe('Upload failed')
    expect(mockDeleteFile).toHaveBeenCalledTimes(1)
    expect(mockDeleteFile).toHaveBeenCalledWith(expect.stringMatching(KEY_RE))
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('database transaction failure removes the uploaded storage object', async () => {
    const pdf = tempPdf()
    stageUpload(pdf)
    mockPrisma.$transaction.mockRejectedValue(new Error('transaction aborted'))

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(500)
    expect(res._getJSONData().error).toBe('Upload failed')
    expect(mockDeleteFile).toHaveBeenCalledTimes(1)
    expect(mockDeleteFile).toHaveBeenCalledWith(expect.stringMatching(KEY_RE))
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('cleanup failure is handled safely and never leaks storage internals', async () => {
    const pdf = tempPdf()
    stageUpload(pdf)
    mockPrisma.medicalDocument.create.mockRejectedValue(new Error('db write failed'))
    mockDeleteFile.mockRejectedValue(new Error('bucket creds=supersecret'))

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(500)
    expect(res._getJSONData()).toEqual({ error: 'Upload failed' })
    expect(mockDeleteFile).toHaveBeenCalledTimes(1)
    fs.rmSync(pdf.dir, { recursive: true, force: true })
  })

  test('storage upload failure is reported without cleanup or database writes', async () => {
    const pdf = tempPdf()
    ;(global as any).__docFields = {}
    ;(global as any).__docFiles = {
      file: { filepath: pdf.filepath, size: 100, mimetype: 'application/pdf', originalFilename: 'rx.pdf' },
    }
    mockUploadFile.mockRejectedValue(new Error('upload failed upstream'))

    const res = await callHandler(documentsIndexHandler, 'POST')

    expect(res.statusCode).toBe(500)
    expect(res._getJSONData().error).toBe('Upload failed')
    expect(mockDeleteFile).not.toHaveBeenCalled()
    expect(mockPrisma.medicalDocument.create).not.toHaveBeenCalled()
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