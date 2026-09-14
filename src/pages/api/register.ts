import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { hashPassword } from '../../lib/password'
import { validatePassword } from '../../lib/passwordPolicy'
import { hasErrors, RegistrationFieldErrors } from '../../lib/registerFlows'

const RegisterSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required.').max(100, 'Full name must be under 100 characters.'),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z.string(),
  confirmPassword: z.string(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    const errors: RegistrationFieldErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof RegistrationFieldErrors
      if (field && !errors[field]) errors[field] = issue.message
    }
    return res.status(400).json({ ok: false, errors })
  }

  const { name, email, password, confirmPassword } = parsed.data

  // Business rules on top of shape validation (password policy, confirmation).
  const errors: RegistrationFieldErrors = {}
  const passwordError = validatePassword(password)
  if (passwordError) errors.password = passwordError
  if (!confirmPassword) errors.confirmPassword = 'Please confirm your password.'
  else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.'
  if (hasErrors(errors)) return res.status(400).json({ ok: false, errors })

  // Public self-registration may ONLY ever create PATIENT accounts. The role is
  // hard-coded server-side; the client cannot influence it via extra fields.
  try {
    const hashedPassword = await hashPassword(password)
    await prisma.user.create({
      data: {
        name,
        email,
        role: 'PATIENT',
        hashedPassword,
        patient: { create: {} },
      },
    })
    return res.status(201).json({ ok: true })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      // Duplicate email — respond with a code the client maps to a single
      // generic message. Never reveal whether the account already exists.
      return res.status(409).json({ error: 'DUPLICATE_EMAIL' })
    }
    console.error('register: failed to create account', e)
    return res.status(500).json({ error: 'REGISTRATION_FAILED' })
  }
}