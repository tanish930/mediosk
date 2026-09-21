import { getToken } from 'next-auth/jwt'
import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { z } from 'zod'

// Minimal encounter disposition vocabulary. This is an operational outcome,
// never a diagnosis, prescription, or treatment plan.
const OUTCOMES = ['COMPLETED', 'REFERRED', 'FOLLOW_UP', 'NOT_COMPLETED'] as const

const BodySchema = z.object({
  outcome: z.enum(OUTCOMES).optional(),
  outcomeNote: z.string().max(2000).optional(),
})

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'unauthenticated' })
  const role = token.role as string
  const uid = token.id as string
  if (!uid) return res.status(401).json({ error: 'missing_user_id' })
  if (role !== 'DOCTOR' && role !== 'HOSPITAL') return res.status(403).json({ error: 'forbidden' })

  const parsed = BodySchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_outcome', details: parsed.error.errors })

  const { id } = req.query as any
  const consultation = await prisma.consultation.findUnique({ where: { id } })
  if (!consultation) return res.status(404).json({ error: 'not_found' })
  if (!consultation.doctorId) return res.status(409).json({ error: 'consultation_unassigned' })
  const doctor = await prisma.doctor.findUnique({ where: { id: consultation.doctorId } })
  if (!doctor) return res.status(404).json({ error: 'doctor_not_found' })
  if (role === 'DOCTOR' && uid !== doctor.userId) return res.status(403).json({ error: 'forbidden' })

  // Only the assigned/authorized doctor may write a clinical disposition.
  // Hospital/ops ending remains allowed (existing behavior) but must not
  // supply an outcome.
  const writingOutcome = parsed.data.outcome !== undefined || (parsed.data.outcomeNote !== undefined && parsed.data.outcomeNote !== '')
  if (role !== 'DOCTOR' && writingOutcome) return res.status(403).json({ error: 'forbidden' })

  // Idempotent completion. A repeated end of an already completed
  // consultation returns the current state without rewriting it; a conflicting
  // outcome is rejected so a completed disposition cannot be silently changed.
  if (consultation.status === 'COMPLETED') {
    if (parsed.data.outcome && parsed.data.outcome !== consultation.outcome) {
      return res.status(409).json({ error: 'already_completed' })
    }
    return res.json({ consultation })
  }

  const data: Record<string, unknown> = { status: 'COMPLETED', completedAt: new Date() }
  if (parsed.data.outcome) data.outcome = parsed.data.outcome
  if (parsed.data.outcomeNote !== undefined) data.outcomeNote = parsed.data.outcomeNote === '' ? null : parsed.data.outcomeNote

  const updated = await prisma.consultation.update({ where: { id }, data })
  await prisma.accessAudit.create({ data: { actorId: uid, actorRole: role, patientId: consultation.patientId, doctorId: consultation.doctorId, consultationId: id, action: 'CONSULTATION_ENDED' } })
  return res.json({ consultation: updated })
}