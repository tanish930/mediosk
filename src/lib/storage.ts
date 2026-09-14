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

function sanitizeKey(key: string) {
  key = key.replace(/\.\.+/g, '')
  key = key.replace(/(^\/+|\/+$)/g, '')
  key = key.split('..').join('')
  return key
}

export async function uploadFile(buffer: Buffer, key: string, contentType: string) {
  key = sanitizeKey(key)
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
  const uploadsDir = path.join(process.cwd(), 'uploads')
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
  const filePath = path.join(uploadsDir, key)
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(uploadsDir))) throw new Error('Invalid upload key')
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, buffer, { mode: 0o600 })
  return `/uploads/${key}`
}

export async function deleteFile(key: string) {
  key = sanitizeKey(key)
  if (provider === 's3' && s3) {
    const bucket = process.env.S3_BUCKET!
    const cmd = new DeleteObjectCommand({ Bucket: bucket, Key: key })
    await s3.send(cmd)
    return
  }
  const uploadsDir = path.join(process.cwd(), 'uploads')
  const filePath = path.join(uploadsDir, key)
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(uploadsDir))) throw new Error('Invalid delete key')
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved)
}

export async function readFile(key: string): Promise<Buffer> {
  key = sanitizeKey(key)
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

  const uploadsDir = path.join(process.cwd(), 'uploads')
  const filePath = path.join(uploadsDir, key)
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(uploadsDir))) throw new Error('Invalid read key')
  if (!fs.existsSync(resolved)) throw new Error('File not found')
  return fs.readFileSync(resolved)
}
