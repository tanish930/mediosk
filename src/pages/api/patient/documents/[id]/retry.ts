import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'

import { prisma } from '../../../../../lib/prisma'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).end('Method Not Allowed')
      return
    }

    const session = await getSession({ req })

    if (!session) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const userId = (session as any).user?.id

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const patient = await prisma.patient.findUnique({
      where: { userId },
    })

    if (!patient) {
      res.status(404).json({ error: 'Patient not found' })
      return
    }

    const { id } = req.query

    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Invalid id' })
      return
    }

    const doc = await prisma.medicalDocument.findUnique({
      where: { id },
    })

    // Do not reveal documents belonging to another patient.
    if (!doc || doc.patientId !== patient.id) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const processing = await prisma.documentProcessing.findFirst({
      where: { documentId: doc.id },
      orderBy: { createdAt: 'desc' },
    })

    if (!processing || processing.status !== 'FAILED') {
      res.status(409).json({
        error: 'Only failed documents can be retried',
      })
      return
    }

    const updated = await prisma.documentProcessing.update({
      where: { id: processing.id },
      data: {
        status: 'PENDING',
        error: null,
      },
    })

    await prisma.accessAudit.create({
      data: {
        actorId: userId,
        actorRole: 'PATIENT',
        patientId: patient.id,
        action: 'DOCUMENT_RETRY',
        note: `Retried ${doc.id}`,
      },
    })

    res.status(200).json({
      ok: true,
      processing: updated,
    })
  } catch (err) {
    console.error('document retry handler error', err)

    res.status(500).json({
      error: 'Internal server error',
    })
    return
  }
}