import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { z } from 'zod'
import { hashPassword, verifyPassword } from '../../../lib/password'
import { validatePassword } from '../../../lib/passwordPolicy'

const PutSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
  confirmPassword: z.string(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const userId = token.id as string
  const role = token.role as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')
    return res.status(405).end('Method Not Allowed')
  }

  const parsed = PutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', errors: parsed.error.flatten().fieldErrors })

  const { currentPassword, newPassword, confirmPassword } = parsed.data

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return res.status(404).json({ error: 'Account not found' })

  const currentOk = await verifyPassword(currentPassword, user.hashedPassword)
  if (!currentOk) {
    return res.status(400).json({ error: 'Current password is incorrect.', errors: { currentPassword: ['Current password is incorrect.'] } })
  }

  const policyError = validatePassword(newPassword)
  if (policyError) {
    return res.status(400).json({ error: policyError, errors: { newPassword: [policyError] } })
  }

  if (newPassword === confirmPassword && (await verifyPassword(newPassword, user.hashedPassword))) {
    return res.status(400).json({
      error: 'New password must be different from the current password.',
      errors: { newPassword: ['New password must be different from the current password.'] },
    })
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.', errors: { confirmPassword: ['Passwords do not match.'] } })
  }

  const hashed = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: userId }, data: { hashedPassword: hashed } })
  await prisma.accessAudit.create({
    data: {
      actorId: userId,
      actorRole: role || 'USER',
      patientId: '',
      action: 'PASSWORD_CHANGED',
      note: 'Password updated',
    },
  })

  return res.json({ ok: true })
}