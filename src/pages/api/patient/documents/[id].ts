import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { deleteFile } from '../../../../lib/storage'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getSession({ req })
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    const userId = (session as any).user?.id
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const patient = await prisma.patient.findUnique({ where: { userId } })
    if (!patient) return res.status(404).json({ error: 'Patient not found' })

    const { id } = req.query
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

    const doc = await prisma.medicalDocument.findUnique({ where: { id } })
    if (!doc || doc.patientId !== patient.id) return res.status(404).json({ error: 'Not found' })
  if (req.method === 'GET') {
    const processing = await prisma.documentProcessing.findFirst({ where: { documentId: id }, orderBy: { createdAt: 'desc' } })
    const extraction = await prisma.extractedMedicalData.findFirst({ where: { documentId: id }, orderBy: { createdAt: 'desc' } })
    await prisma.accessAudit.create({ data: { actorId: userId, actorRole: 'PATIENT', patientId: patient.id, consultationId: null, action: 'DOCUMENT_VIEW', note: `Viewed ${id}` } })
    return res.json({ document: doc, processing, extraction })
  }

  if (req.method === 'DELETE') {
    // delete related rows first: the schema defines no cascade, so deleting the
    // document directly would fail with a foreign key constraint violation
    await prisma.$transaction([
      prisma.documentProcessing.deleteMany({ where: { documentId: id } }),
      prisma.extractedMedicalData.deleteMany({ where: { documentId: id } }),
      prisma.medicalTimeline.updateMany({ where: { sourceDocumentId: id }, data: { sourceDocumentId: null } }),
      prisma.medicalDocument.delete({ where: { id } }),
    ])
    // assume url contains key after bucket/ or /uploads/
    const key = doc.url.split('/').slice(-2).join('/')
    try {
      await deleteFile(key)
    } catch (err) {
      console.error('document delete: file cleanup failed', err)
    }
    try {
      await prisma.accessAudit.create({ data: { actorId: userId, actorRole: 'PATIENT', patientId: patient.id, action: 'DOCUMENT_DELETE', note: `Deleted ${id}` } })
    } catch (err) {
      console.error('document delete: audit failed', err)
    }
    return res.json({ ok: true })
  }
  res.setHeader('Allow', 'DELETE')
  res.status(405).end('Method Not Allowed')
  } catch (err) {
    console.error('document handler error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
