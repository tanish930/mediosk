import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'
import { z } from 'zod'

// Doctor review of a demo formulation suggestion. Server-side authorization
// only: the doctor must be the assigned doctor for the consultation (or hold
// a granted patient consent), matching the existing hospital/doctor
// assignment authorization model. Review identity, timestamp, status and note
// are persisted and audited. This never creates a prescription.
const BodySchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const userId = token.id as string
  const role = token.role as string
  if (role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' })

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors })

  const suggestion = await prisma.ayushFormulationSuggestion.findUnique({ where: { id } })
  if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' })

  const doctor = await prisma.doctor.findUnique({ where: { userId } })
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' })

  const consultation = await prisma.consultation.findUnique({ where: { id: suggestion.consultationId } })
  if (!consultation) return res.status(404).json({ error: 'Consultation not found' })

  // Only the authorized doctor for this consultation may review the suggestion.
  const assigned = consultation.doctorId === doctor.id
  const consent = await prisma.consent.findFirst({ where: { patientId: consultation.patientId, granteeDoctorId: doctor.id }, orderBy: { createdAt: 'desc' } })
  if (!assigned && !(consent && consent.granted === true)) return res.status(403).json({ error: 'Access denied' })

  const { status, note } = parsed.data

  const updated = await prisma.ayushFormulationSuggestion.update({
    where: { id: suggestion.id },
    data: {
      status,
      reviewerNote: note && note.trim().length > 0 ? note.trim() : null,
      reviewedById: doctor.id,
      reviewedAt: new Date(),
      active: true,
    },
  })

  await prisma.accessAudit.create({
    data: {
      actorId: userId,
      actorRole: 'DOCTOR',
      patientId: consultation.patientId,
      doctorId: doctor.id,
      consultationId: consultation.id,
      action: status === 'APPROVED' ? 'AYUSH_FORMULATION_APPROVED' : 'AYUSH_FORMULATION_REJECTED',
      note: `${suggestion.formularyId}${note ? ` | ${note}` : ''}`,
    },
  })

  return res.json({ ok: true, suggestion: updated })
}