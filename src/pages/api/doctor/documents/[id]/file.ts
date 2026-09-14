import { getToken } from 'next-auth/jwt'
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

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const userId = token.id as string
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    if (token.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' })

    const doctor = await prisma.doctor.findUnique({ where: { userId } })
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' })

    const { id } = req.query
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

    const doc = await prisma.medicalDocument.findUnique({ where: { id } })
    if (!doc) return res.status(404).json({ error: 'Not found' })

    // Allow access only when the doctor is assigned to the patient's case or the
    // patient granted consent to this doctor (same rule as /api/doctor/case/[id]).
    const assigned = await prisma.consultation.findFirst({
      where: { patientId: doc.patientId, doctorId: doctor.id },
      select: { id: true },
    })
    const consent = await prisma.consent.findFirst({
      where: { patientId: doc.patientId, granteeDoctorId: doctor.id, granted: true },
      select: { id: true },
    })
    if (!canReadDocument({
      role: 'DOCTOR',
      documentPatientId: doc.patientId,
      assignedToDoctor: Boolean(assigned),
      consentGranted: Boolean(consent),
    })) {
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
      data: { actorId: userId, actorRole: 'DOCTOR', doctorId: doctor.id, patientId: doc.patientId, action: 'DOCUMENT_VIEW', note: `Viewed file ${doc.id}` },
    })

    res.status(200).send(buffer)
  } catch (err) {
    console.error('doctor document file handler error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}