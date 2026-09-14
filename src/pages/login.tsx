import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { signIn, getSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { performLogin, loginGssp } from '../lib/loginFlow'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registeredNotice, setRegisteredNotice] = useState(false)

  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('registered') === '1') {
        setRegisteredNotice(true)
      }
    } catch {
      /* SSR-safe */
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    const result = await performLogin({ email, password }, {
      signInFn: signIn as any,
      getSessionFn: getSession as any,
    })
    setLoading(false)
    if (result.kind === 'error') {
      setError(result.message)
      return
    }
    window.location.assign(result.to)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 via-white to-teal-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-sky-600 text-white shadow-lg shadow-teal-200"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-7 w-7">
              <path d="M12 3v18M3 12h18" />
            </svg>
          </div>
          <p className="mt-3 text-xl font-bold tracking-tight text-slate-900">
            Medi<span className="text-teal-600">Kiosk</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">AI-assisted case-taking &amp; medical history platform</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">Sign in to your MediKiosk account to continue.</p>

          {registeredNotice && (
            <div role="status" className="mb-6 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
              Your account was created. Please sign in.
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                disabled={loading}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={error ? 'login-error' : undefined}
                aria-invalid={error ? true : undefined}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={error ? 'login-error' : undefined}
                  aria-invalid={error ? true : undefined}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={loading}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none focus:text-teal-600 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    {showPassword ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <div aria-live="polite">
              {error && (
                <p
                  id="login-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white"
                  >
                    !
                  </span>
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-teal-600 to-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-teal-700 hover:to-sky-700 focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && (
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white"
                  aria-hidden="true"
                />
              )}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <details className="mt-6 text-left">
            <summary className="cursor-pointer rounded text-xs font-medium text-slate-400 transition-colors hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
              Demo accounts (prototype only)
            </summary>
            <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              <p>
                <span className="font-semibold text-slate-600">Patient:</span> patient@mediosk.demo · Patient@123
              </p>
              <p>
                <span className="font-semibold text-slate-600">Doctor:</span> doctor@mediosk.demo · Doctor@123
              </p>
              <p>
                <span className="font-semibold text-slate-600">Hospital:</span> hospital@mediosk.demo · Hospital@123
              </p>
            </div>
          </details>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="rounded font-semibold text-teal-600 transition-colors hover:text-teal-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            Create one
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-slate-400">
          Protected area. Only authorized patients and care providers can access MediKiosk.
        </p>
      </div>
    </main>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getSession(ctx)
  return loginGssp(session as any)
}