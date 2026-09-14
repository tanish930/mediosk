import type { GetServerSidePropsResult } from 'next'
import { roleHomePath } from './roleHome'

export const VALIDATION_REQUIRED_MESSAGE = 'Please enter your email and password.'
export const VALIDATION_EMAIL_MESSAGE = 'Please enter a valid email address.'
export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.'
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

export interface LoginSessionLike {
  user?: { role?: string }
}

export interface LoginDeps {
  signInFn: (
    provider: string,
    options: { redirect: boolean; email: string; password: string }
  ) => Promise<{ ok?: boolean; error?: string } | undefined>
  getSessionFn: () => Promise<LoginSessionLike | null>
}

export type LoginResult = { kind: 'redirect'; to: string } | { kind: 'error'; message: string }

export function validateLoginInput(email: string, password: string): string | null {
  if (!email.trim() || !password) return VALIDATION_REQUIRED_MESSAGE
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(email.trim())) return VALIDATION_EMAIL_MESSAGE
  return null
}

// Always mask whatever NextAuth returned so no raw error text ever reaches the UI.
export function loginErrorMessage(_raw: unknown): string {
  return INVALID_CREDENTIALS_MESSAGE
}

export async function performLogin(
  input: { email: string; password: string },
  deps: LoginDeps
): Promise<LoginResult> {
  const validation = validateLoginInput(input.email, input.password)
  if (validation) return { kind: 'error', message: validation }

  try {
    const res = await deps.signInFn('credentials', {
      redirect: false,
      email: input.email.trim(),
      password: input.password,
    })

    if (res?.error) return { kind: 'error', message: loginErrorMessage(res.error) }

    if (res?.ok) {
      const session = await deps.getSessionFn()
      const home = roleHomePath(session?.user?.role)
      return { kind: 'redirect', to: home ?? '/dashboard' }
    }

    return { kind: 'error', message: GENERIC_ERROR_MESSAGE }
  } catch {
    return { kind: 'error', message: GENERIC_ERROR_MESSAGE }
  }
}

export function loginGssp(session: LoginSessionLike | null): GetServerSidePropsResult<Record<string, never>> {
  if (!session || !session.user?.role) return { props: {} }
  const home = roleHomePath(session.user.role)
  if (!home) return { props: {} }
  return { redirect: { destination: home, permanent: false } }
}