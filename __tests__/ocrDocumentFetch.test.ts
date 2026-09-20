import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

jest.mock('@aws-sdk/client-s3', () => {
  const __send = jest.fn()
  const S3Client = jest.fn(function () {
    return { send: __send }
  })
  const GetObjectCommand = jest.fn(function (input: any) {
    return { input }
  })
  return {
    S3Client,
    GetObjectCommand,
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    __send,
  }
})

const uploadsRoot = path.resolve(process.cwd(), 'uploads')

describe('document fetch security - local uploads', () => {
  let ocr: typeof import('../src/lib/ocr')
  let dir: string

  beforeEach(() => {
    jest.resetModules()
    process.env.STORAGE_PROVIDER = 'local'
    delete process.env.OCR_PROVIDER
    ocr = require('../src/lib/ocr')
    fs.mkdirSync(uploadsRoot, { recursive: true })
  })

  afterEach(() => {
    delete process.env.STORAGE_PROVIDER
    delete process.env.OCR_PROVIDER
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
      dir = ''
    }
  })

  test('reads a valid local /uploads document', async () => {
    dir = path.join(uploadsRoot, `sec-${randomUUID()}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'report.pdf'), 'actual-doc-bytes')

    const buffer = await ocr.bufferFromUrl(
      `/uploads/${path.basename(dir)}/report.pdf`
    )

    expect(buffer.toString()).toBe('actual-doc-bytes')
  })

  test('rejects local ../ traversal', async () => {
    await expect(
      ocr.bufferFromUrl('/uploads/../secret.pdf')
    ).rejects.toThrow('Invalid document upload path')
  })

  test('rejects nested traversal', async () => {
    await expect(
      ocr.bufferFromUrl(
        '/uploads/../../../../etc/passwd'
      )
    ).rejects.toThrow('Invalid document upload path')
  })

  test('rejects URL-encoded traversal', async () => {
    await expect(
      ocr.bufferFromUrl(
        '/uploads/%2e%2e/%2e%2e/etc/passwd'
      )
    ).rejects.toThrow('Invalid document upload path')
  })

  test('rejects an absolute filesystem path as a document URL', async () => {
    await expect(
      ocr.bufferFromUrl('/etc/passwd')
    ).rejects.toThrow('Unsupported document URL')

    await expect(
      ocr.bufferFromUrl('C:\\Windows\\win.ini')
    ).rejects.toThrow('Unsupported document URL')
  })

  test('rejects an arbitrary http:// URL', async () => {
    await expect(
      ocr.bufferFromUrl('http://evil.example/steal.pdf')
    ).rejects.toThrow('Unsupported document URL')
  })

  test('rejects an arbitrary https:// URL', async () => {
    await expect(
      ocr.bufferFromUrl('https://evil.example/steal.pdf')
    ).rejects.toThrow('Unsupported document URL')
  })

  test('runOCR mock provider still reads a local sidecar document', async () => {
    process.env.OCR_PROVIDER = 'mock'

    dir = path.join(uploadsRoot, `sec-${randomUUID()}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'report.txt'),
      'mock ocr text'
    )

    const result = await ocr.runOCR(
      `/uploads/${path.basename(dir)}/report`
    )

    expect(result).toEqual({ text: 'mock ocr text' })
  })

  test('runOCR mock provider refuses traversal instead of reading', async () => {
    process.env.OCR_PROVIDER = 'mock'

    const result = await ocr.runOCR('/uploads/../secret')

    expect(result).toEqual({ text: '' })
  })
})

describe('document fetch security - configured S3 storage', () => {
  let ocr: typeof import('../src/lib/ocr')
  let sdk: any

  beforeEach(() => {
    jest.resetModules()
    process.env.STORAGE_PROVIDER = 's3'
    process.env.S3_ENDPOINT = 'http://minio.local'
    process.env.S3_BUCKET = 'mediosk-test'
    process.env.S3_REGION = 'us-east-1'
    sdk = require('@aws-sdk/client-s3')
    ocr = require('../src/lib/ocr')
  })

  afterEach(() => {
    delete process.env.STORAGE_PROVIDER
    delete process.env.S3_ENDPOINT
    delete process.env.S3_BUCKET
    delete process.env.S3_REGION
  })

  test('retrieves the object through the configured S3 client', async () => {
    sdk.__send.mockResolvedValue({
      Body: (async function* () {
        yield Buffer.from('s3-doc-bytes')
      })(),
    })

    const buffer = await ocr.bufferFromUrl(
      'http://minio.local/mediosk-test/patient1/report.pdf'
    )

    expect(buffer.toString()).toBe('s3-doc-bytes')
    expect(sdk.GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'mediosk-test',
      Key: 'patient1/report.pdf',
    })
  })

  test('does not fall back to an arbitrary HTTP fetch when S3 retrieval fails', async () => {
    sdk.__send.mockRejectedValue(new Error('denied'))

    await expect(
      ocr.bufferFromUrl(
        'http://minio.local/mediosk-test/patient1/report.pdf'
      )
    ).rejects.toThrow('Document download failed')
  })
})