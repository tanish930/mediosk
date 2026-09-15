import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { z } from 'zod'
import { isValidLanguage } from '../../../lib/languages'

const PutSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required.').max(100, 'Full name must be under 100 characters.').optional(),
  preferredLanguage: z.string().optional(),
})

function safeAccount(user: {
  id: string
  name: string | null
  email: string
  role: string
  preferredLanguage: string
  createdAt: Date | string
  deactivatedAt: Date | string | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    preferredLanguage: user.preferredLanguage,
    createdAt: user.createdAt,
    deactivatedAt: user.deactivatedAt,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const userId = token.id as string
  const role = token.role as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'Account not found' })
    return res.json({ account: safeAccount(user) })
  }

  if (req.method === 'PUT') {
    const parsed = PutSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', errors: parsed.error.flatten().fieldErrors })

    const data: { name?: string; preferredLanguage?: string } = {}
    if (parsed.data.name !== undefined) data.name = parsed.data.name
    if (parsed.data.preferredLanguage !== undefined) {
      if (!isValidLanguage(parsed.data.preferredLanguage)) {
        return res.status(400).json({ error: 'Invalid body', errors: { preferredLanguage: ['Please select a supported language.'] } })
      }
      data.preferredLanguage = parsed.data.preferredLanguage
    }

    const updated = await prisma.user.update({ where: { id: userId }, data })
    await prisma.accessAudit.create({
      data: {
        actorId: userId,
        actorRole: role || 'USER',
        patientId: '',
        action: 'ACCOUNT_UPDATED',
        note: 'Account profile updated',
      },
    })
    return res.json({ account: safeAccount(updated) })
  }

  res.setHeader('Allow', 'GET,PUT')
  res.status(405).end('Method Not Allowed')
}