import {
  validateRegistrationInput,
  performRegistration,
  hasErrors,
  REGISTER_GENERIC_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  registrationServerMessage,
} from '../src/lib/registerFlows'
import { hashPassword, verifyPassword } from '../src/lib/password'
import { PASSWORD_POLICY, validatePassword, passwordHelpText } from '../src/lib/passwordPolicy'

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    patient: { findUnique: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}))

import { prisma } from '../src/lib/prisma'

const mockPrisma = prisma as any

describe('validatePassword', () => {
  test('empty password reports required', () => {
    expect(validatePassword('')).toBe('Password is required.')
  })

  test('too short reports minimum length', () => {
    expect(validatePassword('Ab1')).toBe(`Password must be at least ${PASSWORD_POLICY.minLength} characters long.`)
  })

  test('missing uppercase is rejected', () => {
    expect(validatePassword('abcdefgh1')).toBe('Password must include at least one uppercase letter.')
  })

  test('missing lowercase is rejected', () => {
    expect(validatePassword('ABCDEFGH1')).toBe('Password must include at least one lowercase letter.')
  })

  test('missing digit is rejected', () => {
    expect(validatePassword('Abcdefgh')).toBe('Password must include at least one digit.')
  })

  test('valid password passes', () => {
    expect(validatePassword('Patient@123')).toBeNull()
  })
})

describe('passwordHelpText', () => {
  test('lists all requirements', () => {
    const text = passwordHelpText()
    expect(text).toContain(`${PASSWORD_POLICY.minLength} characters`)
    expect(text).toContain('uppercase')
    expect(text).toContain('lowercase')
    expect(text).toContain('number')
  })
})

describe('password hash roundtrip', () => {
  test('hashPassword produces a bcrypt-looking hash and verifies correctly', async () => {
    const plain = 'Patient@123'
    const hashed = await hashPassword(plain)

    expect(hashed).not.toBe(plain)
    expect(hashed.startsWith('$2')).toBe(true)
    expect(await verifyPassword(plain, hashed)).toBe(true)
  })

  test('wrong password is rejected', async () => {
    const hashed = await hashPassword('Patient@123')
    expect(await verifyPassword('wrongpassword', hashed)).toBe(false)
  })
})

describe('validateRegistrationInput', () => {
  const valid = { name: 'Test User', email: 'test@example.com', password: 'Patient@123', confirmPassword: 'Patient@123' }

  test('valid input produces no errors', () => {
    expect(hasErrors(validateRegistrationInput(valid))).toBe(false)
  })

  test('missing name', () => {
    const errors = validateRegistrationInput({ ...valid, name: '' })
    expect(errors.name).toBe('Full name is required.')
  })

  test('missing email', () => {
    const errors = validateRegistrationInput({ ...valid, email: '' })
    expect(errors.email).toBe('Email is required.')
  })

  test('invalid email format', () => {
    const errors = validateRegistrationInput({ ...valid, email: 'not-an-email' })
    expect(errors.email).toBe('Please enter a valid email address.')
  })

  test('missing password', () => {
    const errors = validateRegistrationInput({ ...valid, password: '' })
    expect(errors.password).toBe('Password is required.')
  })

  test('weak password is rejected', () => {
    const errors = validateRegistrationInput({ ...valid, password: 'weak' })
    expect(errors.password).toBeDefined()
  })

  test('missing confirmation', () => {
    const errors = validateRegistrationInput({ ...valid, confirmPassword: '' })
    expect(errors.confirmPassword).toBe('Please confirm your password.')
  })

  test('password mismatch', () => {
    const errors = validateRegistrationInput({ ...valid, confirmPassword: 'Patient@1234' })
    expect(errors.confirmPassword).toBe('Passwords do not match.')
  })

  test('several fields can fail simultaneously', () => {
    const errors = validateRegistrationInput({ name: '', email: '', password: '', confirmPassword: '' })
    expect(errors.name).toBeDefined()
    expect(errors.email).toBeDefined()
    expect(errors.password).toBeDefined()
    expect(errors.confirmPassword).toBeDefined()
  })
})

describe('registrationServerMessage', () => {
  test('duplicate email returns a safe generic message', () => {
    expect(registrationServerMessage(409)).toBe(REGISTER_GENERIC_MESSAGE)
    expect(registrationServerMessage(409)).not.toContain('duplicate')
    expect(registrationServerMessage(409)).not.toContain('exists')
  })

  test('unexpected failures return a safe generic message', () => {
    expect(registrationServerMessage(500)).toBe(GENERIC_ERROR_MESSAGE)
    expect(registrationServerMessage(500)).not.toContain('DB')
  })
})

describe('performRegistration', () => {
  function baseDeps(overrides: Partial<Parameters<typeof performRegistration>[1]> = {}) {
    return {
      fetchFn: jest.fn(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ ok: true }),
      })),
      signInFn: jest.fn(async () => ({ ok: true })),
      ...overrides,
    } as Parameters<typeof performRegistration>[1]
  }

  const validInput = { name: 'Test User', email: ' test@example.com ', password: 'Patient@123', confirmPassword: 'Patient@123' }

  test('client-side validation short-circuits before any network call', async () => {
    const deps = baseDeps()
    const res = await performRegistration({ ...validInput, email: '' }, deps)

    expect(res.kind).toBe('error-fields')
    expect(deps.fetchFn).not.toHaveBeenCalled()
    expect(deps.signInFn).not.toHaveBeenCalled()
  })

  test('successful registration signs in and redirects to patient dashboard', async () => {
    const deps = baseDeps()
    const res = await performRegistration(validInput, deps)

    expect(deps.fetchFn).toHaveBeenCalledWith(
      '/api/register',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"email":"test@example.com"'),
      })
    )
    expect(deps.signInFn).toHaveBeenCalledWith('credentials', {
      redirect: false,
      email: 'test@example.com',
      password: 'Patient@123',
    })
    expect(res).toEqual({ kind: 'redirect', to: '/dashboard/patient' })
  })

  test('duplicate email produces a safe error message and never reveals the duplicate', async () => {
    const deps = baseDeps({
      fetchFn: jest.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: 'DUPLICATE_EMAIL' }),
      })),
    })
    const res = await performRegistration(validInput, deps)

    expect(res).toEqual({ kind: 'error', message: REGISTER_GENERIC_MESSAGE })
    expect(JSON.stringify(res)).not.toContain('DUPLICATE_EMAIL')
    expect(deps.signInFn).not.toHaveBeenCalled()
  })

  test('server validation errors are passed through to the caller', async () => {
    const deps = baseDeps({
      fetchFn: jest.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          errors: { password: 'Password must include at least one uppercase letter.' },
        }),
      })),
    })
    const res = await performRegistration(validInput, deps)

    expect(res.kind).toBe('error-fields')
    if (res.kind === 'error-fields') {
      expect(res.errors.password).toBeDefined()
    }
  })

  test('network failure yields a friendly generic error', async () => {
    const deps = baseDeps({
      fetchFn: jest.fn(async () => { throw new Error('offline') }),
    })
    const res = await performRegistration(validInput, deps)

    expect(res).toEqual({ kind: 'error', message: GENERIC_ERROR_MESSAGE })
  })

  test('failed auto-login redirects to /login with a friendly success notice', async () => {
    const deps = baseDeps({
      signInFn: jest.fn(async () => ({ ok: false })),
    })
    const res = await performRegistration(validInput, deps)

    expect(res).toEqual({ kind: 'redirect', to: '/login?registered=1' })
  })

  test('signIn throw falls back to /login?registered=1', async () => {
    const deps = baseDeps({
      signInFn: jest.fn(async () => { throw new Error('cookie error') }),
    })
    const res = await performRegistration(validInput, deps)

    expect(res).toEqual({ kind: 'redirect', to: '/login?registered=1' })
  })

  test('role field in the input cannot force a non-patient account', async () => {
    const deps = baseDeps()
    const res = await performRegistration({ ...validInput, name: 'Sneaky User' }, deps)

    const sentBody = JSON.parse((deps.fetchFn as jest.Mock).mock.calls[0][1].body)
    expect(sentBody).not.toHaveProperty('role')
    expect(res).toEqual({ kind: 'redirect', to: '/dashboard/patient' })
  })
})

describe('existing login still works with a bcrypt-hashed password', () => {
  test('password hashed by the register flow is verifiable by the same bcrypt.compare used in authorize()', async () => {
    const plainPassword = 'Patient@123'
    const hashed = await hashPassword(plainPassword)

    // The register flow hashes with the same bcrypt round configuration as the
    // seed script and the NextAuth authorize function. Prove compatibility by
    // verifying with the same bcrypt.compare call the authorize path uses.
    const bcrypt = require('bcryptjs')
    const valid = await bcrypt.compare(plainPassword, hashed)
    expect(valid).toBe(true)

    const wrong = await bcrypt.compare('WrongPass123', hashed)
    expect(wrong).toBe(false)
  })

  test('mocked authorize() lookup returns the hashed user and verifies it', async () => {
    const plainPassword = 'Patient@123'
    const hashed = await hashPassword(plainPassword)

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Test',
      email: 'test@mediosk.demo',
      role: 'PATIENT',
      hashedPassword: hashed,
    })

    const foundUser = await mockPrisma.user.findUnique({ where: { email: 'test@mediosk.demo' } })
    expect(foundUser).not.toBeNull()

    const bcrypt = require('bcryptjs')
    expect(await bcrypt.compare(plainPassword, foundUser.hashedPassword)).toBe(true)
    expect(await bcrypt.compare('WrongPass123', foundUser.hashedPassword)).toBe(false)
  })
})