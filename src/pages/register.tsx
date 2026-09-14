import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { signIn, getSession } from 'next-auth/react'
import { useState } from 'react'
import { performRegistration, RegistrationFieldErrors, createRegistrationFetch } from '../lib/registerFlows'
import { passwordHelpText } from '../lib/passwordPolicy'
import { loginGssp } from '../lib/loginFlow'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

function PasswordField(props: {
  id: string
  label: string
  autoComplete: string
  value: string
  placeholder: string
  show: boolean
  error?: string
  disabled: boolean
  onToggle: () => void
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={props.id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {props.label}
      </label>
      <div className="relative">
        <input
          id={props.id}
          name={props.id}
          type={props.show ? 'text' : 'password'}
          autoComplete={props.autoComplete}
          required
          disabled={props.disabled}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-describedby={props.error ? `${props.id}-error` : undefined}
          aria-invalid={props.error ? true : undefined}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          onClick={props.onToggle}
          aria-pressed={props.show}
          aria-label={props.show ? 'Hide password' : 'Show password'}
          disabled={props.disabled}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none focus:text-teal-600 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            {props.show ? (
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
      {props.error && (
        <p id={`${props.id}-error`} className="mt-1.5 text-sm text-red-600">
          {props.error}
        </p>
      )}
    </div>
  )
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<RegistrationFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setFormError(null)
    setErrors({})
    setLoading(true)
    const result = await performRegistration({ name, email, password, confirmPassword }, {
      fetchFn: createRegistrationFetch(),
      signInFn: signIn as any,
    })
    setLoading(false)
    if (result.kind === 'error-fields') {
      setErrors(result.errors)
      return
    }
    if (result.kind === 'error') {
      setFormError(result.message)
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
          <h1 className="text-2xl font-semibold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">Join MediKiosk as a patient in under a minute.</p>
          <p className="mt-1 text-xs text-slate-400">
            New accounts are created as Patient accounts. Doctor and hospital access is granted through their organizations.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                disabled={loading}
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-describedby={errors.name ? 'name-error' : undefined}
                aria-invalid={errors.name ? true : undefined}
                className={inputClass}
              />
              {errors.name && (
                <p id="name-error" className="mt-1.5 text-sm text-red-600">
                  {errors.name}
                </p>
              )}
            </div>

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
                disabled={loading}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                aria-invalid={errors.email ? true : undefined}
                className={inputClass}
              />
              {errors.email && (
                <p id="email-error" className="mt-1.5 text-sm text-red-600">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <PasswordField
                id="password"
                label="Password"
                autoComplete="new-password"
                placeholder="Create a password"
                value={password}
                show={showPassword}
                error={errors.password}
                disabled={loading}
                onToggle={() => setShowPassword((v) => !v)}
                onChange={setPassword}
              />
              <p className="mt-1.5 text-xs text-slate-400">Password should include {passwordHelpText()}.</p>
            </div>

            <div>
              <PasswordField
                id="confirmPassword"
                label="Confirm password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                show={showConfirmPassword}
                error={errors.confirmPassword}
                disabled={loading}
                onToggle={() => setShowConfirmPassword((v) => !v)}
                onChange={setConfirmPassword}
              />
            </div>

            <div aria-live="polite">
              {formError && (
                <p
                  id="register-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white"
                  >
                    !
                  </span>
                  {formError}
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
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link
              href="/login"
              className="rounded font-semibold text-teal-600 transition-colors hover:text-teal-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
            >
              Sign in
            </Link>
          </p>
        </div>

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