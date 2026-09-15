import { hashPassword } from '../src/lib/password'

process.env.NEXTAUTH_SECRET = 'test-secret'

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}))

import { prisma } from '../src/lib/prisma'

const mockUser = prisma.user as any

let authorize: (credentials: { email?: string; password?: string }) => Promise<unknown>

beforeAll(async () => {
  const mod = await import('../src/pages/api/auth/[...nextauth]')
  const credentialsProvider = mod.authOptions.providers[0]
  authorize = (credentialsProvider as any).options.authorize
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('NextAuth credentials authorization', () => {
  test('a deactivated account cannot authenticate, with the same safe null result', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'patient@mediosk.demo',
      role: 'PATIENT',
      name: 'Patient',
      deactivatedAt: new Date(),
      hashedPassword: await hashPassword('Patient@123'),
    })

    const result = await authorize({ email: 'patient@mediosk.demo', password: 'Patient@123' })
    expect(result).toBeNull()
    expect(mockUser.findUnique).toHaveBeenCalledWith({ where: { email: 'patient@mediosk.demo' } })
  })

  test('a deactivated account with a wrong password also returns null (no distinction)', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'patient@mediosk.demo',
      role: 'PATIENT',
      name: 'Patient',
      deactivatedAt: new Date(),
      hashedPassword: await hashPassword('Patient@123'),
    })

    const result = await authorize({ email: 'patient@mediosk.demo', password: 'WrongPass@123' })
    expect(result).toBeNull()
  })

  test.each(['PATIENT', 'DOCTOR', 'HOSPITAL'])(
    'an active %s account still authenticates',
    async (role) => {
      mockUser.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'user@mediosk.demo',
        role,
        name: 'Active User',
        deactivatedAt: null,
        hashedPassword: await hashPassword('Active@123'),
      })

      const result = await authorize({ email: 'user@mediosk.demo', password: 'Active@123' })
      expect(result).not.toBeNull()
      expect((result as any).role).toBe(role)
    }
  )

  test('an unknown email returns null without leaking account existence', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    const result = await authorize({ email: 'nobody@mediosk.demo', password: 'Whatever@123' })
    expect(result).toBeNull()
  })

  test('missing credentials return null', async () => {
    const result = await authorize({} as any)
    expect(result).toBeNull()
  })
})