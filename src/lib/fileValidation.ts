/*
 * Magic-byte validation for supported medical document uploads.
 *
 * The declared MIME type supplied by the client is never trusted on its own.
 * The actual file bytes are inspected first, then cross-checked against the
 * declared MIME type so content/type mismatches are rejected.
 */

export const PDF_MIME = 'application/pdf'
export const PNG_MIME = 'image/png'
export const JPEG_MIME = 'image/jpeg'

// image/jpg is a declared alias for JPEG; it is canonicalized to image/jpeg.
const JPEG_MIME_ALIAS = 'image/jpg'

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])

export type DocumentFileKind = 'pdf' | 'png' | 'jpeg'

export interface ValidatedDocumentFile {
  kind: DocumentFileKind
  mimeType: string
  extension: string
}

export type DocumentFileValidationResult =
  | { ok: true; file: ValidatedDocumentFile }
  | { ok: false; reason: string }

const CANONICAL_EXTENSION: Record<DocumentFileKind, string> = {
  pdf: 'pdf',
  png: 'png',
  jpeg: 'jpg',
}

function hasMagic(buffer: Buffer, magic: Buffer): boolean {
  if (buffer.length < magic.length) {
    return false
  }
  return buffer.subarray(0, magic.length).equals(magic)
}

function detectKind(buffer: Buffer): DocumentFileKind | null {
  if (hasMagic(buffer, PDF_MAGIC)) {
    return 'pdf'
  }
  if (hasMagic(buffer, PNG_MAGIC)) {
    return 'png'
  }
  if (hasMagic(buffer, JPEG_MAGIC)) {
    return 'jpeg'
  }
  return null
}

function canonicalizeMime(
  declaredMimeType: string
): { kind: DocumentFileKind; mimeType: string } | null {
  const mime = declaredMimeType.trim().toLowerCase()

  if (mime === PDF_MIME) {
    return { kind: 'pdf', mimeType: PDF_MIME }
  }
  if (mime === PNG_MIME) {
    return { kind: 'png', mimeType: PNG_MIME }
  }
  if (mime === JPEG_MIME || mime === JPEG_MIME_ALIAS) {
    return { kind: 'jpeg', mimeType: JPEG_MIME }
  }
  return null
}

export function validateDocumentFile(
  buffer: Buffer,
  declaredMimeType: string | null | undefined
): DocumentFileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'File is empty' }
  }

  const detected = detectKind(buffer)
  if (!detected) {
    return { ok: false, reason: 'Unsupported file content' }
  }

  if (!declaredMimeType) {
    return { ok: false, reason: 'Declared file type is missing' }
  }

  const declared = canonicalizeMime(declaredMimeType)
  if (!declared) {
    return { ok: false, reason: 'Unsupported file type' }
  }

  if (declared.kind !== detected) {
    return { ok: false, reason: 'File type does not match content' }
  }

  return {
    ok: true,
    file: {
      kind: detected,
      mimeType: declared.mimeType,
      extension: CANONICAL_EXTENSION[detected],
    },
  }
}