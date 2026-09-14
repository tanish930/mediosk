import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
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
    if (!doc || doc.patientId !== patient.id) return res.status(404).json({ error: 'Not found' })

    const processing = await prisma.documentProcessing.findFirst({
      where: { documentId: doc.id },
      orderBy: { createdAt: 'desc' },
    })

    if (!processing || processing.status !== 'FAILED') {
      return res.status(409).json({ error: 'Only failed documents can be retried' })
    }

    const updated = await prisma.documentProcessing.update({
      where: { id: processing.id },
      data: { status: 'PENDING', error: null },
    })

    await prisma.accessAudit.create({
      data: { actorId: userId, actorRole: 'PATIENT', patientId: patient.id, action: 'DOCUMENT_RETRY', note: `Retried ${doc.id}` },
    })

    return res.json({ ok: true, processing: updated })
  } catch (err) {
    console.error('document retry handler error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}