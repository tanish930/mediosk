import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { detectDomainFromComplaint } from '../../../../lib/domain'
import { getNextAdaptiveQuestion } from '../../../../lib/adaptiveQuestioning'
import { getQuestionText } from '../../../../lib/multilingualQuestions'
import { DEFAULT_LANGUAGE, CONSULTATION_MODES, isValidLanguage } from '../../../../lib/languages'
import { z } from 'zod'

const BodySchema = z.object({
  complaint: z.string().min(3),
  language: z.string().optional(),
  mode: z.enum(CONSULTATION_MODES).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const token = await getToken({
  req,
  secret: process.env.NEXTAUTH_SECRET
})

if (!token) {
  return res.status(401).json({ error: 'Unauthorized' })
}

const userId = token.id as string

if (!userId) {
  return res.status(401).json({ error: 'Unauthorized: missing user id' })
}

if (token.role !== 'PATIENT') {
  return res.status(403).json({ error: 'Forbidden' })
}

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors })
  const { complaint, language, mode = 'GENERAL' } = parsed.data

  if (language && !isValidLanguage(language)) {
    return res.status(400).json({ error: 'Invalid body', errors: { language: ['Please select a supported language.'] } })
  }
  const lang = language || DEFAULT_LANGUAGE

  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  // Business rule: do not allow a patient to start a new consultation while a
  // live consultation is already in progress. Enforced server-side, not on the
  // frontend. Completed, cancelled, or scheduled consultations do not block.
  const activeConsultation = await prisma.consultation.findFirst({
    where: { patientId: patient.id, status: 'IN_PROGRESS' },
  })
  if (activeConsultation) {
    return res.status(409).json({ error: 'ACTIVE_CONSULTATION_IN_PROGRESS' })
  }

  const domain = detectDomainFromComplaint(complaint)

  const sessionRec = await prisma.preConsultationSession.create({ data: { patientId: patient.id, complaint, domain, language: lang, mode } })

  // Initialize with the first adaptive question
  const nextQ = getNextAdaptiveQuestion(domain, [], complaint, lang, mode)
  if (nextQ) {
    await prisma.sessionQuestion.create({
      data: {
        sessionId: sessionRec.id,
        text: getQuestionText(nextQ.key, lang, domain, mode) ?? nextQ.text,
        type: nextQ.type,
        key: nextQ.key, // Pass the key
        order: 0
      }
    })
  }

  return res.json({ sessionId: sessionRec.id, domain })
}
