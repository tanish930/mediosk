import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import path from 'path'

const provider = process.env.STORAGE_PROVIDER || 's3'

let s3: S3Client | null = null
if (provider === 's3') {
  s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
  })
}

export const LOCAL_UPLOADS_PREFIX = '/uploads/'

export const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads')

export function isLocalUploadsPath(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.startsWith(LOCAL_UPLOADS_PREFIX)
  )
}

/*
 * Resolves a storage key to an absolute path inside the uploads root.
 *
 * Traversal attempts are rejected rather than silently rewritten: raw (../),
 * normalized (a/../../b), URL-encoded (%2e%2e), and absolute paths are all
 * caught by the root-containment check after full path.resolve() normalization
 * and URL decoding.
 */
export function resolveUploadsPath(key: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('Invalid upload path')
  }

  let decodedKey: string
  try {
    decodedKey = decodeURIComponent(key)
  } catch {
    throw new Error('Invalid upload path')
  }

  if (decodedKey.includes('\u0000')) {
    throw new Error('Invalid upload path')
  }

  const resolved = path.resolve(UPLOADS_ROOT, decodedKey)

  if (resolved === UPLOADS_ROOT) {
    return resolved
  }

  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error('Invalid upload path')
  }

  return resolved
}

export async function uploadFile(buffer: Buffer, key: string, contentType: string) {
  if (provider === 's3' && s3) {
    const bucket = process.env.S3_BUCKET!
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType, ACL: 'private' })
    await s3.send(cmd)
    const endpoint = process.env.S3_ENDPOINT
    if (endpoint) {
      return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`
    }
    return `https://${bucket}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`
  }

  // Local storage fallback
  if (!fs.existsSync(UPLOADS_ROOT)) fs.mkdirSync(UPLOADS_ROOT, { recursive: true })
  const resolved = resolveUploadsPath(key)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, buffer, { mode: 0o600 })
  return `${LOCAL_UPLOADS_PREFIX}${key}`
}

export async function deleteFile(key: string) {
  if (provider === 's3' && s3) {
    const bucket = process.env.S3_BUCKET!
    const cmd = new DeleteObjectCommand({ Bucket: bucket, Key: key })
    await s3.send(cmd)
    return
  }
  const resolved = resolveUploadsPath(key)
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved)
}

export async function readFile(key: string): Promise<Buffer> {
  if (provider === 's3' && s3) {
    const bucket = process.env.S3_BUCKET!
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
    const response = await s3.send(cmd)
    if (!response.Body) throw new Error('File not found')
    const chunks: Buffer[] = []
    for await (const chunk of response.Body as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  const resolved = resolveUploadsPath(key)
  if (!fs.existsSync(resolved)) throw new Error('File not found')
  return fs.readFileSync(resolved)
}
