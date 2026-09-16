import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getNextAdaptiveQuestion } from '../../../../../lib/adaptiveQuestioning'
import { getQuestionText } from '../../../../../lib/multilingualQuestions'
import { mapAnswersToReport } from '../../../../../lib/reportMapping'
import { detectRedFlagFromAnswers } from '../../../../../lib/redFlags'

const AnswerSchema = z.object({ questionId: z.string().uuid(), value: z.any() })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = await getToken({
  req,
  secret: process.env.NEXTAUTH_SECRET
})

if (!token) {
  return res.status(401).json({ error: 'Unauthorized' })
}

if (token.role !== 'PATIENT') {
  return res.status(403).json({ error: 'Forbidden' })
}

const userId = token.id as string

if (!userId) {
  return res.status(401).json({ error: 'Unauthorized: missing user id' })
}

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

  const sess = await prisma.preConsultationSession.findUnique({ where: { id }, include: { questions: { orderBy: { order: 'asc' }, include: { answer: true } }, report: true } })
  if (!sess || sess.patientId !== (await prisma.patient.findUnique({ where: { userId } }))?.id) return res.status(404).json({ error: 'Not found' })

  if (req.method === 'GET') {
    const total = sess.questions.length
    const answered = sess.questions.filter(q=>q.answered).length
    const answers = sess.questions
      .filter(q => q.answered && q.key && q.answer)
      .map(q => ({ key: q.key!, value: q.answer!.value }))
    const redFlag = detectRedFlagFromAnswers(answers, sess.complaint, sess.language)
    return res.json({
      session: sess,
      progress: { total, answered },
      redFlag: redFlag.severity === 'NORMAL' ? null : redFlag,
    })
  }

  if (req.method === 'POST') {
    if (sess.status !== 'IN_PROGRESS') return res.status(409).json({ error: 'Session is already completed' })
    const parsed = AnswerSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid answer', details: parsed.error.errors })
    const { questionId, value } = parsed.data
    const q = await prisma.sessionQuestion.findUnique({ where: { id: questionId } })
    if (!q || q.sessionId !== id) return res.status(400).json({ error: 'Invalid question' })

    await prisma.$transaction(async (tx) => {
      await tx.sessionAnswer.upsert({
        where: { questionId },
        create: { questionId, value },
        update: { value },
      })
      await tx.sessionQuestion.update({ where: { id: questionId }, data: { answered: true } })
    })

    // Dynamically get next question
    const updatedSess = await prisma.preConsultationSession.findUnique({
        where: { id },
        include: { questions: { include: { answer: true } } }
    })

    if (!updatedSess) return res.status(500).json({ error: 'Failed to fetch updated session' })

    const answers = updatedSess.questions
        .filter(q => q.answered && q.key && q.answer)
        .map(q => ({ key: q.key!, value: q.answer!.value }))

    const nextQ = getNextAdaptiveQuestion(sess.domain || 'general', answers, sess.complaint, sess.language, sess.mode)

    if (nextQ) {
        // Idempotent: (sessionId, key) is unique, so concurrent answers for the
        // same question can never create duplicate follow-up question rows.
        await prisma.sessionQuestion.createMany({
            data: [{
                sessionId: id,
                text: getQuestionText(nextQ.key, sess.language, sess.domain || 'general', sess.mode) ?? nextQ.text,
                type: nextQ.type,
                key: nextQ.key,
                order: updatedSess.questions.length
            }],
            skipDuplicates: true
        })
    }

    const redFlag = detectRedFlagFromAnswers(answers, sess.complaint, sess.language)

    return res.json({ ok: true, redFlag: redFlag.severity === 'NORMAL' ? null : redFlag })
  }

  if (req.method === 'PUT') {
    // ... (Keep existing implementation for PUT as it works for completion)
    // ... (Wait, actually need to update this to handle adaptive flow if needed, but the current report logic works by looking up questions)
    // Actually the current PUT logic relies on BANK, this needs to be updated.

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.preConsultationSession.findUnique({
        where: { id },
        include: { questions: { orderBy: { order: 'asc' }, include: { answer: true } }, report: true },
      })
      if (!current || current.patientId !== sess.patientId) return { error: 'Not found' as const }
      if (current.report) return { report: current.report, alreadyCompleted: true }

      // Adapt report generation to use key-based answers, fallback to ID if key is null
      const answersByKey = new Map<string, unknown>()
      for (const question of current.questions) {
        if (question.answer) {
            const key = question.key || question.id
            answersByKey.set(key, question.answer.value)
        }
      }

      const mappedData = mapAnswersToReport(answersByKey, { mode: current.mode })

      const redFlagsResult = detectRedFlagFromAnswers(
        current.questions
          .filter(q => q.answered && q.key && q.answer)
          .map(q => ({ key: q.key!, value: q.answer!.value })),
        current.complaint,
        current.language
      )

      const report = await tx.preConsultationReport.create({
        data: {
          sessionId: current.id,
          chiefComplaint: current.complaint,
          redFlags:
            redFlagsResult.severity === 'NORMAL'
              ? undefined
              : (redFlagsResult.matches as Prisma.InputJsonValue),
          ...mappedData
        },
      })
      await tx.preConsultationSession.update({ where: { id: current.id }, data: { status: 'COMPLETED' } })
      return { report, alreadyCompleted: false }
    })

    if ('error' in result) return res.status(result.error === 'Not found' ? 404 : 409).json({ error: result.error })
    return res.json({ ok: true, report: result.report, alreadyCompleted: result.alreadyCompleted })
  }

  res.setHeader('Allow', 'GET,POST,PUT')
  res.status(405).end('Method Not Allowed')
}
