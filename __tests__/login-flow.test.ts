import {
  performLogin,
  loginGssp,
  loginErrorMessage,
  validateLoginInput,
  VALIDATION_REQUIRED_MESSAGE,
  VALIDATION_EMAIL_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  GENERIC_ERROR_MESSAGE,
} from '../src/lib/loginFlow'
import { roleHomePath } from '../src/lib/roleHome'

describe('roleHomePath', () => {
  test('maps each role to its dashboard', () => {
    expect(roleHomePath('PATIENT')).toBe('/dashboard/patient')
    expect(roleHomePath('DOCTOR')).toBe('/dashboard/doctor')
    expect(roleHomePath('HOSPITAL')).toBe('/dashboard/hospital')
  })

  test('unknown or missing roles map to nothing', () => {
    expect(roleHomePath('SUPERADMIN')).toBeNull()
    expect(roleHomePath('')).toBeNull()
    expect(roleHomePath(undefined)).toBeNull()
    expect(roleHomePath(null)).toBeNull()
  })
})

describe('validateLoginInput', () => {
  test('missing email and/or password asks for both', () => {
    expect(validateLoginInput('', '')).toBe(VALIDATION_REQUIRED_MESSAGE)
    expect(validateLoginInput('', 'password')).toBe(VALIDATION_REQUIRED_MESSAGE)
    expect(validateLoginInput('  ', 'password')).toBe(VALIDATION_REQUIRED_MESSAGE)
    expect(validateLoginInput('patient@mediosk.demo', '')).toBe(VALIDATION_REQUIRED_MESSAGE)
  })

  test('malformed email asks for a valid email', () => {
    expect(validateLoginInput('not-an-email', 'secret')).toBe(VALIDATION_EMAIL_MESSAGE)
    expect(validateLoginInput('a@b', 'secret')).toBe(VALIDATION_EMAIL_MESSAGE)
  })

  test('valid credentials pass validation', () => {
    expect(validateLoginInput('patient@mediosk.demo', 'Patient@123')).toBeNull()
  })
})

describe('loginErrorMessage', () => {
  test('never leaks raw NextAuth/API error text', () => {
    expect(loginErrorMessage('CredentialsSignin')).toBe(INVALID_CREDENTIALS_MESSAGE)
    expect(loginErrorMessage('OAuthAccountNotLinked')).toBe(INVALID_CREDENTIALS_MESSAGE)
    expect(loginErrorMessage(new Error('internal db timeout'))).toBe(INVALID_CREDENTIALS_MESSAGE)
    expect(loginErrorMessage('raw internal error: user table denied 500')).toBe(INVALID_CREDENTIALS_MESSAGE)
    expect(loginErrorMessage('raw internal error: user table denied 500')).not.toContain('user table denied')
    expect(loginErrorMessage(undefined)).toBe(INVALID_CREDENTIALS_MESSAGE)
  })
})

describe('performLogin', () => {
  const sessionOf = (role: string | null) => ({ user: role ? { role } : undefined })

  function deps(overrides: Partial<Parameters<typeof performLogin>[1]> = {}) {
    return {
      signInFn: jest.fn(async () => ({ ok: true, error: undefined })),
      getSessionFn: jest.fn(async () => sessionOf('PATIENT')),
      ...overrides,
    } as Parameters<typeof performLogin>[1]
  }

  test('missing fields short-circuit before talking to NextAuth', async () => {
    const d = deps()
    const result = await performLogin({ email: '', password: '' }, d)

    expect(result).toEqual({ kind: 'error', message: VALIDATION_REQUIRED_MESSAGE })
    expect(d.signInFn).not.toHaveBeenCalled()
  })

  test('malformed email short-circuits before talking to NextAuth', async () => {
    const d = deps()
    const result = await performLogin({ email: 'oops', password: 'x' }, d)

    expect(result).toEqual({ kind: 'error', message: VALIDATION_EMAIL_MESSAGE })
    expect(d.signInFn).not.toHaveBeenCalled()
  })

  test('invalid credentials produce a friendly message and no raw error', async () => {
    const d = deps({
      signInFn: jest.fn(async () => ({ ok: false, error: 'CredentialsSignin' })),
    })
    const result = await performLogin({ email: 'a@b.com', password: 'wrong' }, d)

    expect(result).toEqual({ kind: 'error', message: INVALID_CREDENTIALS_MESSAGE })
    expect(JSON.stringify(result)).not.toContain('CredentialsSignin')
  })

  test('successful patient login routes to the patient dashboard', async () => {
    const d = deps({ getSessionFn: jest.fn(async () => sessionOf('PATIENT')) })
    const result = await performLogin({ email: 'patient@mediosk.demo', password: 'Patient@123' }, d)

    expect(d.signInFn).toHaveBeenCalledWith('credentials', {
      redirect: false,
      email: 'patient@mediosk.demo',
      password: 'Patient@123',
    })
    expect(result).toEqual({ kind: 'redirect', to: '/dashboard/patient' })
  })

  test('successful doctor login routes to the doctor dashboard', async () => {
    const d = deps({ getSessionFn: jest.fn(async () => sessionOf('DOCTOR')) })
    const result = await performLogin({ email: 'doctor@mediosk.demo', password: 'Doctor@123' }, d)

    expect(result).toEqual({ kind: 'redirect', to: '/dashboard/doctor' })
  })

  test('successful hospital login routes to the hospital dashboard', async () => {
    const d = deps({ getSessionFn: jest.fn(async () => sessionOf('HOSPITAL')) })
    const result = await performLogin({ email: 'hospital@mediosk.demo', password: 'Hospital@123' }, d)

    expect(result).toEqual({ kind: 'redirect', to: '/dashboard/hospital' })
  })

  test('successful login without a resolvable role falls back to /dashboard dispatcher', async () => {
    const d = deps({ getSessionFn: jest.fn(async () => ({ user: undefined })) })
    const result = await performLogin({ email: 'unknown@mediosk.demo', password: 'Whatever@1' }, d)

    expect(result).toEqual({ kind: 'redirect', to: '/dashboard' })
  })

  test('unexpected sign-in response yields a generic error', async () => {
    const d = deps({
      signInFn: jest.fn(async () => ({ ok: false, error: undefined })),
    })
    const result = await performLogin({ email: 'a@b.com', password: 'secret' }, d)

    expect(result).toEqual({ kind: 'error', message: GENERIC_ERROR_MESSAGE })
  })

  test('a thrown sign-in error yields a generic error, never a raw one', async () => {
    const d = deps({
      signInFn: jest.fn(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:3000 nextauth endpoint')
      }),
    })
    const result = await performLogin({ email: 'a@b.com', password: 'secret' }, d)

    expect(result).toEqual({ kind: 'error', message: GENERIC_ERROR_MESSAGE })
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED')
  })

  test('signIn is called with the trimmed email', async () => {
    const d = deps()
    await performLogin({ email: '  patient@mediosk.demo  ', password: 'Patient@123' }, d)

    expect(d.signInFn).toHaveBeenCalledWith('credentials', {
      redirect: false,
      email: 'patient@mediosk.demo',
      password: 'Patient@123',
    })
  })
})

describe('loginGssp (already-authenticated redirect)', () => {
  const sessionOf = (role: string) => ({ user: { role } })

  test('no session means the login form is shown', () => {
    expect(loginGssp(null)).toEqual({ props: {} })
    expect(loginGssp({ user: undefined })).toEqual({ props: {} })
  })

  test('unknown role means the login form is shown', () => {
    expect(loginGssp({ user: { role: 'MARTIAN' } })).toEqual({ props: {} })
  })

  test('authenticated patient is sent to the patient dashboard', () => {
    expect(loginGssp(sessionOf('PATIENT'))).toEqual({ redirect: { destination: '/dashboard/patient', permanent: false } })
  })

  test('authenticated doctor is sent to the doctor dashboard', () => {
    expect(loginGssp(sessionOf('DOCTOR'))).toEqual({ redirect: { destination: '/dashboard/doctor', permanent: false } })
  })

  test('authenticated hospital is sent to the hospital dashboard', () => {
    expect(loginGssp(sessionOf('HOSPITAL'))).toEqual({ redirect: { destination: '/dashboard/hospital', permanent: false } })
  })
})