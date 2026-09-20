import fs from 'fs'
import path from 'path'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

type OCRResult = { text: string }

async function bufferFromUrl(url: string): Promise<Buffer> {
  // Local uploads
  if (url.startsWith('/uploads/')) {
    const key = url.replace(/^\/uploads\//, '')
    const filePath = path.join(process.cwd(), 'uploads', key)

    if (!fs.existsSync(filePath)) {
      throw new Error(`Local upload file not found: ${key}`)
    }

    return fs.readFileSync(filePath)
  }

  // If STORAGE_PROVIDER is s3, try to fetch via S3 using env config
  if (process.env.STORAGE_PROVIDER === 's3') {
    try {
      const endpoint = process.env.S3_ENDPOINT || ''
      const bucket = process.env.S3_BUCKET || ''

      // Try to extract key from common URL forms
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
        // Try common HTTP/S3 hostname form
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
      // Fall through to HTTP fetch.
      // The HTTP path may still be valid for public/object URLs.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('S3 document fetch failed, trying HTTP:', error)
      }
    }
  }

  // Fallback: fetch over HTTP
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(
      `Document download failed: ${res.status} ${res.statusText}`
    )
  }

  const ab = await res.arrayBuffer()

  return Buffer.from(ab)
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
    if (url.startsWith('/uploads/')) {
      const key = url.replace(/^\/uploads\//, '')
      const txtPath = path.join(
        process.cwd(),
        'uploads',
        `${key}.txt`
      )

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