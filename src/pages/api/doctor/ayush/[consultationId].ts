import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { z } from 'zod'

const BodySchema = z.object({
  prakriti: z.string().optional(),
  vikriti: z.string().optional(),
  sara: z.string().optional(),
  samhanna: z.string().optional(),
  pramana: z.string().optional(),
  satmya: z.string().optional(),
  sattva: z.string().optional(),
  aharaShakti: z.string().optional(),
  vyayamaShakti: z.string().optional(),
  vaya: z.string().optional(),
  aharaVihara: z.string().optional(),
  agni: z.string().optional(),
  koshtha: z.string().optional(),
  nadi: z.string().optional(),
  note: z.string().optional(),
})

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
  const assigned = consultation.doctorId === doctor.id
  const consent = await prisma.consent.findFirst({ where: { patientId: consultation.patientId, granteeDoctorId: doctor.id }, orderBy: { createdAt: 'desc' } })
  if (!consent || consent.granted !== true) return res.status(403).json({ error: 'Access denied' })
  if (!assigned && !consent) return res.status(403).json({ error: 'Access denied' })

  if (req.method === 'GET') {
    const ayush = await prisma.ayushAssessment.findFirst({ where: { consultationId: consultation.id } })
    return res.json({ ayush })
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors })
    const data = parsed.data

    // upsert by consultationId
    let ayush = await prisma.ayushAssessment.findFirst({ where: { consultationId: consultation.id } })
    if (!ayush) {
      ayush = await prisma.ayushAssessment.create({ data: { patientId: consultation.patientId, consultationId: consultation.id, doctorId: doctor.id, ...data } })
    } else {
      ayush = await prisma.ayushAssessment.update({ where: { id: ayush.id }, data: { ...data, doctorId: doctor.id } })
    }

    return res.json({ ayush })
  }

  res.setHeader('Allow', 'GET,POST,PUT')
  res.status(405).end('Method Not Allowed')
}
