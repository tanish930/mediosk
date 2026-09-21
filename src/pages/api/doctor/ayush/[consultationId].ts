import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { z } from 'zod'
import {
  findAyushDecisionSupport,
  regenerateAyushDecisionSupport,
} from '../../../../lib/ayushDecisionSupport'
import { assertDoctorCanAccessConsultation } from '../../../../lib/consultationAccess'

const NadiDataSchema = z.object({
  rateBpm: z.number().int().min(0).max(300).nullish(),
  rhythm: z.string().max(500).nullish(),
  gati: z.string().max(500).nullish(),
  quality: z.string().max(500).nullish(),
  note: z.string().max(2000).nullish(),
})

const BodySchema = z.object({
  prakriti: z.string().max(2000).optional(),
  vikriti: z.string().max(2000).optional(),
  sara: z.string().max(2000).optional(),
  samhanna: z.string().max(2000).optional(),
  pramana: z.string().max(2000).optional(),
  satmya: z.string().max(2000).optional(),
  sattva: z.string().max(2000).optional(),
  aharaShakti: z.string().max(2000).optional(),
  vyayamaShakti: z.string().max(2000).optional(),
  vaya: z.string().max(2000).optional(),
  aharaVihara: z.string().max(2000).optional(),
  agni: z.string().max(2000).optional(),
  koshtha: z.string().max(2000).optional(),
  nadi: z.string().max(2000).optional(),
  // Structured pulse capture (doctor-side examination) — free text where no
  // controlled clinical vocabulary exists in the project.
  nadiData: NadiDataSchema.nullish(),
  // First-class sleep / sleep-history field (doctor-verified history).
  sleep: z.string().max(2000).optional(),
  note: z.string().max(4000).optional(),
})

function cleanString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text.length > 0 ? text : undefined
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req })
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  const userId = (session as any).user?.id
  const role = (session as any).user?.role
  if (role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' })

  const { consultationId } = req.query
  if (!consultationId || typeof consultationId !== 'string') return res.status(400).json({ error: 'Invalid consultation id' })

  const doctor = await prisma.doctor.findUnique({ where: { userId } })
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' })

  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } })
  if (!consultation) return res.status(404).json({ error: 'Consultation not found' })

  // access: doctor must be assigned or patient consent granted
  const allowed = await assertDoctorCanAccessConsultation({ consultation, doctorId: doctor.id })
  if (!allowed) return res.status(403).json({ error: 'Access denied' })

  if (req.method === 'GET') {
    const ayush = await prisma.ayushAssessment.findFirst({ where: { consultationId: consultation.id } })
    const support = ayush
      ? await findAyushDecisionSupport(ayush.id, consultation.id)
      : { doshaAssessment: null, suggestions: [] }
    return res.json({ ayush, ...support })
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors })

    const raw = parsed.data

    // Free-text fields are stored trimmed and empty strings are dropped so
    // they are never treated as a clinical finding downstream.
    const data: Record<string, unknown> = {}
    for (const key of [
      'prakriti', 'vikriti', 'sara', 'samhanna', 'pramana', 'satmya', 'sattva',
      'aharaShakti', 'vyayamaShakti', 'vaya', 'aharaVihara', 'agni', 'koshtha',
      'nadi', 'sleep', 'note',
    ]) {
      const cleaned = cleanString((raw as Record<string, unknown>)[key])
      if (cleaned !== undefined) data[key] = cleaned
    }
    if (raw.nadiData) data.nadiData = raw.nadiData

    // upsert by consultationId
    let ayush = await prisma.ayushAssessment.findFirst({ where: { consultationId: consultation.id } })
    if (!ayush) {
      ayush = await prisma.ayushAssessment.create({
        data: { patientId: consultation.patientId, consultationId: consultation.id, doctorId: doctor.id, ...data },
      })
    } else {
      ayush = await prisma.ayushAssessment.update({
        where: { id: ayush.id },
        data: { ...data, doctorId: doctor.id },
      })
    }

    // Regenerate the rule-based doshic decision support and demo formulation
    // suggestions from the doctor-verified assessment. Never from an LLM.
    const support = await regenerateAyushDecisionSupport(ayush)

    return res.json({ ayush, ...support })
  }

  res.setHeader('Allow', 'GET,POST,PUT')
  res.status(405).end('Method Not Allowed')
}