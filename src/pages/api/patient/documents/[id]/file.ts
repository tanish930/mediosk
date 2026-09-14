import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'
import { readFile } from '../../../../../lib/storage'
import { canReadDocument } from '../../../../../lib/documentAccess'

const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/octet-stream'])

function safeContentType(mimeType: string | null | undefined, url: string): string {
  const mime = (mimeType || '').toLowerCase()
  if (ALLOWED_MIME.has(mime)) return mime
  const ext = url.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      res.status(405).end('Method Not Allowed')
      return
    }

    const session = await getSession({ req })
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    const userId = (session as any).user?.id
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const patient = await prisma.patient.findUnique({ where: { userId } })
    if (!patient) return res.status(404).json({ error: 'Patient not found' })

    const { id } = req.query
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

    const doc = await prisma.medicalDocument.findUnique({ where: { id } })
    if (!doc) return res.status(404).json({ error: 'Not found' })

    if (!canReadDocument({ role: 'PATIENT', documentPatientId: doc.patientId, actorPatientId: patient.id })) {
      return res.status(404).json({ error: 'Not found' })
    }

    const key = doc.url.split('/').slice(-2).join('/')
    let buffer: Buffer
    try {
      buffer = await readFile(key)
    } catch (err) {
      return res.status(404).json({ error: 'Not found' })
    }

    const contentType = safeContentType(doc.mimeType, doc.url)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', String(buffer.length))
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.title || 'document')}"`)

    await prisma.accessAudit.create({
      data: { actorId: userId, actorRole: 'PATIENT', patientId: patient.id, action: 'DOCUMENT_VIEW', note: `Viewed file ${doc.id}` },
    })

    res.status(200).send(buffer)
  } catch (err) {
    console.error('document file handler error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}