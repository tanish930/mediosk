import { validatePassword } from './passwordPolicy'
import { roleHomePath } from './roleHome'

export const REGISTER_GENERIC_MESSAGE =
  'Unable to create the account. Please check your details or try signing in.'
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

export interface RegistrationFieldErrors {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export interface RegistrationInput {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export type RegistrationResult =
  | { kind: 'error-fields'; errors: RegistrationFieldErrors }
  | { kind: 'error'; message: string }
  | { kind: 'redirect'; to: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegistrationInput(input: RegistrationInput): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {}

  const name = input.name.trim()
  if (!name) errors.name = 'Full name is required.'
  else if (name.length > 100) errors.name = 'Full name must be under 100 characters.'

  const email = input.email.trim()
  if (!email) errors.email = 'Email is required.'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Please enter a valid email address.'

  const passwordError = validatePassword(input.password)
  if (passwordError) errors.password = passwordError

  const confirm = input.confirmPassword
  if (!confirm) errors.confirmPassword = 'Please confirm your password.'
  else if (input.password && confirm !== input.password) errors.confirmPassword = 'Passwords do not match.'

  return errors
}

export function hasErrors(errors: RegistrationFieldErrors): boolean {
  return Object.values(errors ?? {}).some(Boolean)
}

// Maps server status codes to safe, human-readable messages. A 409 (duplicate
// email) must never reveal that an account exists, so it uses the same generic
// wording as any other failure.
export function registrationServerMessage(status: number, _raw?: unknown): string {
  if (status === 409) return REGISTER_GENERIC_MESSAGE
  return GENERIC_ERROR_MESSAGE
}

export interface RegisterDeps {
  fetchFn: (
    url: string,
    init?: {
      method: string
      headers: Record<string, string>
      body: string
    }
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<Record<string, unknown>> }>
  signInFn: (
    provider: string,
    options: { redirect: boolean; email: string; password: string }
  ) => Promise<{ ok?: boolean } | undefined>
}

// The browser's WebIDL globals such as `window.fetch` must be invoked as a
// method (this === the host), otherwise strict-mode callers get a TypeError:
// "Failed to execute 'fetch' on 'Window': Illegal invocation". performRegistration
// calls deps.fetchFn as a plain function (this === undefined), so the page must
// supply a receiver-safe function that dispatches through the host object.
export function createRegistrationFetch(
  fetchHost: { fetch: typeof globalThis.fetch } = globalThis
): RegisterDeps['fetchFn'] {
  return (url, init) => fetchHost.fetch(url, init)
}

export async function performRegistration(
  input: RegistrationInput,
  deps: RegisterDeps
): Promise<RegistrationResult> {
  const errors = validateRegistrationInput(input)
  if (hasErrors(errors)) return { kind: 'error-fields', errors }

  const email = input.email.trim()

  let res: { ok: boolean; status: number; json: () => Promise<Record<string, unknown>> }
  try {
    res = await deps.fetchFn('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name.trim(),
        email,
        password: input.password,
        confirmPassword: input.confirmPassword,
      }),
    })
  } catch {
    return { kind: 'error', message: GENERIC_ERROR_MESSAGE }
  }

  if (res.status === 400) {
    let body: Record<string, unknown> = {}
    try {
      body = await res.json()
    } catch {
      /* ignore unparseable body */
    }
    const serverErrors = body?.errors as RegistrationFieldErrors | undefined
    if (serverErrors && hasErrors(serverErrors)) return { kind: 'error-fields', errors: serverErrors }
    return { kind: 'error', message: GENERIC_ERROR_MESSAGE }
  }

  if (!res.ok) return { kind: 'error', message: registrationServerMessage(res.status) }

  // Account created. Sign the patient in with the existing NextAuth credentials
  // flow (same mechanism as the login page) and route to the patient dashboard.
  try {
    const signInRes = await deps.signInFn('credentials', {
      redirect: false,
      email,
      password: input.password,
    })
    if (signInRes?.ok) {
      return { kind: 'redirect', to: roleHomePath('PATIENT') ?? '/dashboard' }
    }
  } catch {
    /* fall through to the login page */
  }

  // Auto-login failed for a transient reason; send them to sign in instead.
  return { kind: 'redirect', to: '/login?registered=1' }
}