import fs from 'fs'
import path from 'path'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import {
  isLocalUploadsPath,
  LOCAL_UPLOADS_PREFIX,
  resolveUploadsPath,
} from './storage'

type OCRResult = { text: string }

export async function bufferFromUrl(url: string): Promise<Buffer> {
  if (isLocalUploadsPath(url)) {
    // Local uploads namespace: /uploads/<key>. The key is resolved against the
    // uploads root and any traversal attempt (raw, nested, encoded, or absolute)
    // is rejected before a read is attempted.
    const key = url.slice(LOCAL_UPLOADS_PREFIX.length)

    let filePath: string
    try {
      filePath = resolveUploadsPath(key)
    } catch {
      throw new Error('Invalid document upload path')
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Local upload file not found: ${key}`)
    }

    return fs.readFileSync(filePath)
  }

  // S3 / object storage: retrieval always happens through the configured S3
  // client, never through a raw HTTP request to the URL itself. There is no
  // arbitrary HTTP fallback.
  if (process.env.STORAGE_PROVIDER === 's3') {
    try {
      const endpoint = process.env.S3_ENDPOINT || ''
      const bucket = process.env.S3_BUCKET || ''

      let key = url

      if (endpoint && url.startsWith(endpoint)) {
        const escapedEndpoint = endpoint.replace(
          /[-/\\^$*+?.()|[\]{}]/g,
          '\\$&'
        )

        key = url.replace(
          new RegExp(`^${escapedEndpoint}/`),
          ''
        )
      } else {
        // S3 hostname URL form e.g.
        // https://<bucket>.s3.<region>.amazonaws.com/<key>
        const match = url.match(/https?:\/\/(?:[\w.-]+)\/(.+)$/)

        if (match) {
          key = match[1]
        }
      }

      // If key includes bucket prefix like bucket/key, remove bucket/
      if (bucket && key.startsWith(`${bucket}/`)) {
        key = key.replace(`${bucket}/`, '')
      }

      const s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT || undefined,
        region: process.env.S3_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      })

      const get = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      )

      const stream = get.Body as any
      const chunks: Buffer[] = []

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
      }

      return Buffer.concat(chunks)
    } catch (error) {
      // Never fall back to fetching the URL over HTTP.
      throw new Error(
        `Document download failed: ${String((error && (error as any).message) || error)}`
      )
    }
  }

  throw new Error('Unsupported document URL')
}

function getExtension(url: string): string {
  const cleanUrl = url.split('?')[0].split('#')[0]

  return (
    path.extname(cleanUrl)
      .replace('.', '')
      .toLowerCase() || 'png'
  )
}

function getMimeType(extension: string): string {
  switch (extension) {
    case 'pdf':
      return 'application/pdf'

    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'

    case 'png':
      return 'image/png'

    case 'gif':
      return 'image/gif'

    case 'webp':
      return 'image/webp'

    case 'bmp':
      return 'image/bmp'

    case 'tif':
    case 'tiff':
      return 'image/tiff'

    default:
      return 'application/octet-stream'
  }
}

export async function runOCR(url: string): Promise<OCRResult> {
  const provider = process.env.OCR_PROVIDER || 'ocr_space'

  // ------------------------------------------------------------
  // MOCK OCR
  // ------------------------------------------------------------
  if (provider === 'mock') {
    // For local testing:
    // /uploads/report.pdf
    // can have:
    // /uploads/report.pdf.txt
    if (isLocalUploadsPath(url)) {
      const key = url.slice(LOCAL_UPLOADS_PREFIX.length)

      let txtPath: string
      try {
        txtPath = resolveUploadsPath(`${key}.txt`)
      } catch {
        // Traversal attempts are never read in the mock cycle either.
        return { text: '' }
      }

      if (fs.existsSync(txtPath)) {
        return {
          text: fs.readFileSync(txtPath, 'utf8'),
        }
      }
    }

    // No text available
    return {
      text: '',
    }
  }

  // ------------------------------------------------------------
  // OCR.SPACE
  // ------------------------------------------------------------
  if (provider === 'ocr_space') {
    const apiKey =
      process.env.OCR_API_KEY ||
      process.env.OCR_SPACE_API_KEY

    if (!apiKey) {
      throw new Error(
        'OCR_SPACE API key not configured (OCR_API_KEY or OCR_SPACE_API_KEY)'
      )
    }

    // Retrieve the actual document bytes
    const buf = await bufferFromUrl(url)

    if (!buf.length) {
      throw new Error('Document file is empty')
    }

    const b64 = buf.toString('base64')

    const ext = getExtension(url)
    const mimeType = getMimeType(ext)

    const form = new FormData()

    // OCR.Space accepts a data URI for base64Image.
    form.append(
      'base64Image',
      `data:${mimeType};base64,${b64}`
    )

    form.append('apikey', apiKey)

    // Allow environment configuration.
    // Example:
    // OCR_LANGUAGE=eng
    // OCR_LANGUAGE=hin
    // OCR_LANGUAGE=mar
    form.append(
      'language',
      process.env.OCR_LANGUAGE || 'eng'
    )

    form.append(
      'isOverlayRequired',
      'false'
    )

    // PDF needs to be explicitly identified for OCR.Space.
    if (ext === 'pdf') {
      form.append('filetype', 'PDF')
    }

    // Preserve layout where possible.
    form.append(
      'OCREngine',
      process.env.OCR_ENGINE || '2'
    )

    const response = await fetch(
      'https://api.ocr.space/parse/image',
      {
        method: 'POST',
        body: form,
      }
    )

    if (!response.ok) {
      throw new Error(
        `OCR provider request failed: ${response.status} ${response.statusText}`
      )
    }

    const result = await response.json()

    // Development diagnostics.
    // This helps us see exactly why OCR.Space rejected a file.
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        'OCR.Space response:',
        JSON.stringify(result, null, 2)
      )
    }

    if (
      result &&
      result.IsErroredOnProcessing === true
    ) {
      const providerMessage =
        Array.isArray(result.ErrorMessage)
          ? result.ErrorMessage.join('; ')
          : typeof result.ErrorMessage === 'string'
            ? result.ErrorMessage
            : 'unknown OCR provider error'

      throw new Error(
        `OCR provider reported an error: ${providerMessage}`
      )
    }

    if (
      !result ||
      !Array.isArray(result.ParsedResults) ||
      result.ParsedResults.length === 0
    ) {
      throw new Error(
        'OCR provider returned an invalid or empty response'
      )
    }

    const texts = result.ParsedResults
      .map((parsed: any) => {
        if (!parsed) return ''

        return typeof parsed.ParsedText === 'string'
          ? parsed.ParsedText
          : ''
      })
      .filter((text: string) => text.trim().length > 0)
      .join('\n')

    if (!texts.trim()) {
      throw new Error(
        'OCR provider returned no readable text from the document'
      )
    }

    return {
      text: texts,
    }
  }

  throw new Error(
    `OCR provider not implemented: ${provider}`
  )
}