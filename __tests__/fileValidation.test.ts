import {
  validateDocumentFile,
  PDF_MIME,
  PNG_MIME,
  JPEG_MIME,
} from '../src/lib/fileValidation'

const PDF_MAGIC = Buffer.from('%PDF-1.7 mock report')
const PNG_MAGIC = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('mock png payload'),
])
const JPEG_MAGIC = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('mock jpeg payload'),
])

describe('validateDocumentFile', () => {
  test('accepts a valid PDF signature', () => {
    const result = validateDocumentFile(PDF_MAGIC, PDF_MIME)

    expect(result).toEqual({
      ok: true,
      file: { kind: 'pdf', mimeType: PDF_MIME, extension: 'pdf' },
    })
  })

  test('accepts a valid PNG signature', () => {
    const result = validateDocumentFile(PNG_MAGIC, PNG_MIME)

    expect(result).toEqual({
      ok: true,
      file: { kind: 'png', mimeType: PNG_MIME, extension: 'png' },
    })
  })

  test('accepts a valid JPEG signature', () => {
    const result = validateDocumentFile(JPEG_MAGIC, JPEG_MIME)

    expect(result).toEqual({
      ok: true,
      file: { kind: 'jpeg', mimeType: JPEG_MIME, extension: 'jpg' },
    })
  })

  test('maps the image/jpg declared MIME alias to canonical JPEG', () => {
    const result = validateDocumentFile(JPEG_MAGIC, 'image/jpg')

    expect(result).toEqual({
      ok: true,
      file: { kind: 'jpeg', mimeType: JPEG_MIME, extension: 'jpg' },
    })
  })

  test('rejects a declared MIME that does not match the content', () => {
    expect(validateDocumentFile(PNG_MAGIC, PDF_MIME)).toEqual({
      ok: false,
      reason: 'File type does not match content',
    })

    expect(
      validateDocumentFile(JPEG_MAGIC, PNG_MIME)
    ).toEqual({
      ok: false,
      reason: 'File type does not match content',
    })

    expect(
      validateDocumentFile(PDF_MAGIC, 'image/jpeg')
    ).toEqual({
      ok: false,
      reason: 'File type does not match content',
    })
  })

  test('rejects an unsupported declared MIME type even for valid content', () => {
    expect(
      validateDocumentFile(PDF_MAGIC, 'text/plain')
    ).toEqual({
      ok: false,
      reason: 'Unsupported file type',
    })
  })

  test('rejects arbitrary bytes', () => {
    const result = validateDocumentFile(
      Buffer.from('this is not a real file, just random bytes'),
      PDF_MIME
    )

    expect(result.ok).toBe(false)
    expect(result.ok || result.reason).toBe('Unsupported file content')
  })

  test('rejects an empty file', () => {
    expect(validateDocumentFile(Buffer.alloc(0), PDF_MIME)).toEqual({
      ok: false,
      reason: 'File is empty',
    })
  })

  test('rejects when the declared MIME is missing', () => {
    expect(validateDocumentFile(PDF_MAGIC, null)).toEqual({
      ok: false,
      reason: 'Declared file type is missing',
    })

    expect(validateDocumentFile(PDF_MAGIC, undefined)).toEqual({
      ok: false,
      reason: 'Declared file type is missing',
    })
  })
})