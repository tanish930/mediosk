import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { z } from 'zod'
import { isValidLanguage } from '../../../lib/languages'

const PutSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required.').max(100, 'Full name must be under 100 characters.').optional(),
  dob: z.string().optional(),
  gender: z.union([z.enum(['female', 'male', 'other']), z.literal('')]).optional(),
  preferredLanguage: z.string().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const userId = token.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  if (req.method === 'GET') {
    const withUser = await prisma.patient.findUnique({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true, preferredLanguage: true } } },
    })
    return res.json({ patient: withUser })
  }

  if (req.method === 'PUT') {
    const parsed = PutSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', errors: parsed.error.flatten().fieldErrors })
    const { name, dob, gender, preferredLanguage } = parsed.data

    if (dob !== undefined && dob !== '' && isNaN(new Date(dob).getTime())) {
      return res.status(400).json({ error: 'Invalid body', errors: { dob: ['Please provide a valid date of birth.'] } })
    }
    if (preferredLanguage !== undefined && preferredLanguage !== '' && !isValidLanguage(preferredLanguage)) {
      return res.status(400).json({ error: 'Invalid body', errors: { preferredLanguage: ['Please select a supported language.'] } })
    }

    const userUpdate: { name?: string } = {}
    if (name !== undefined) userUpdate.name = name
    if (Object.keys(userUpdate).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: userUpdate })
    }

    const patientData: { dob?: Date | null; gender?: string | null; preferredLanguage?: string | null } = {}
    if (dob !== undefined) patientData.dob = dob ? new Date(dob) : null
    if (gender !== undefined) patientData.gender = gender === '' ? null : gender
    if (preferredLanguage !== undefined) patientData.preferredLanguage = preferredLanguage === '' ? null : preferredLanguage

    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: patientData,
      include: { user: { select: { id: true, name: true, email: true, preferredLanguage: true } } },
    })
    await prisma.accessAudit.create({ data: { actorId: userId, actorRole: 'PATIENT', patientId: patient.id, action: 'PROFILE_UPDATED', note: 'Patient updated profile' } })
    return res.json({ patient: updated })
  }

  res.setHeader('Allow', 'GET,PUT')
  res.status(405).end('Method Not Allowed')
}