import { useEffect, useState } from 'react'
import { GetServerSideProps } from 'next'
import { getSession } from 'next-auth/react'
import AccountNav from '../../../components/AccountNav'
import { passwordHelpText } from '../../../lib/passwordPolicy'

interface LanguageOption {
  code: string
  label: string
}

interface ActivityItem {
  action: string
  note: string | null
  createdAt: string
}

const ACTIVITY_LABELS: Record<string, string> = {
  PASSWORD_CHANGED: 'Password changed',
  ACCOUNT_UPDATED: 'Account settings updated',
  PROFILE_UPDATED: 'Profile updated',
  ABHA_UPDATED: 'ABHA identifier updated',
  HOSPITAL_PROFILE_UPDATED: 'Hospital profile updated',
  LOGIN: 'Signed in',
}

function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action] || action || 'Account event'
}

function messageClass(type: 'success' | 'error'): string {
  return type === 'success'
    ? 'text-green-700 bg-green-50 border-green-200'
    : 'text-red-700 bg-red-50 border-red-200'
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [appLang, setAppLang] = useState('en')
  const [clinicalLang, setClinicalLang] = useState('')
  const [abhaId, setAbhaId] = useState('')

  const [languages, setLanguages] = useState<LanguageOption[]>([])

  const [activities, setActivities] = useState<ActivityItem[]>([])

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [savingAbha, setSavingAbha] = useState(false)
  const [abhaMsg, setAbhaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function loadAccount() {
    return fetch('/api/account')
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (d && d.account) {
          setEmail(d.account.email || '')
          setAppLang(d.account.preferredLanguage || 'en')
        }
      })
  }

  function loadPatient() {
    return fetch('/api/patient/profile')
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        const p = d && d.patient
        if (p) {
          setName(p.user?.name || '')
          setDob(p.dob ? new Date(p.dob).toISOString().slice(0, 10) : '')
          setGender(p.gender || '')
          setClinicalLang(p.preferredLanguage || '')
        }
      })
  }

  function loadAbha() {
    return fetch('/api/patient/abha')
      .then((r) => r.json().catch(() => null))
      .then((d) => setAbhaId(d?.abhaId || ''))
  }

  function loadLanguages() {
    return fetch('/api/account/languages')
      .then((r) => r.json().catch(() => null))
      .then((d) => setLanguages(d?.languages || []))
  }

  function loadActivities() {
    return fetch('/api/account/activity')
      .then((r) => r.json().catch(() => null))
      .then((d) => setActivities(d?.activities || []))
  }

  useEffect(() => {
    Promise.all([loadAccount(), loadPatient(), loadAbha(), loadLanguages(), loadActivities()])
      .then(() => setLoading(false))
      .catch(() => {
        setLoadError('We could not load your profile. Please try again.')
        setLoading(false)
      })
  }, [])

  async function savePersonal() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const profileRes = await fetch('/api/patient/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, dob, gender, preferredLanguage: clinicalLang }),
      })
      const profileData = await profileRes.json().catch(() => null)
      if (!profileRes.ok) {
        const field = profileData?.errors ? Object.values(profileData.errors).flat().join(' ') : profileData?.error
        throw new Error(field || 'Unable to save profile')
      }

      const accountRes = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: appLang }),
      })
      const accountData = await accountRes.json().catch(() => null)
      if (!accountRes.ok) {
        const field = accountData?.errors ? Object.values(accountData.errors).flat().join(' ') : accountData?.error
        throw new Error(field || 'Unable to save app language')
      }

      setSaveMsg({ type: 'success', text: 'Your settings were saved.' })
      await Promise.all([loadPatient(), loadAccount(), loadActivities()])
    } catch (err) {
      const text = err instanceof Error && err.message ? err.message : 'Your settings could not be saved. Please try again.'
      setSaveMsg({ type: 'error', text })
    } finally {
      setSaving(false)
    }
  }

  async function saveAbha() {
    setSavingAbha(true)
    setAbhaMsg(null)
    try {
      const res = await fetch('/api/patient/abha', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ abhaId: abhaId || null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'ABHA update failed')
      setAbhaId(data?.abhaId || '')
      setAbhaMsg({ type: 'success', text: 'ABHA identifier saved.' })
      await loadActivities()
    } catch {
      setAbhaMsg({ type: 'error', text: 'Your ABHA identifier could not be saved. Please try again.' })
    } finally {
      setSavingAbha(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordBusy(true)
    setPasswordMsg(null)
    try {
      const res = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const field = data?.errors ? Object.values(data.errors).flat().join(' ') : data?.error
        throw new Error(field || 'Could not change your password.')
      }
      setPasswordMsg({
        type: 'success',
        text: 'Your password was changed. In this prototype, existing sessions on other devices may remain active.',
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      await loadActivities()
    } catch (err) {
      const text = err instanceof Error && err.message ? err.message : 'Could not change your password. Please try again.'
      setPasswordMsg({ type: 'error', text })
    } finally {
      setPasswordBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="container py-20 text-center text-slate-500" role="status" aria-label="Loading">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-300 border-t-sky-600 mb-3" />
        <p>Loading your profile...</p>
      </div>
    )
  }

  const fieldClass = 'w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-sky-300'
  const sectionClass = 'border border-slate-200 rounded-xl p-5 mb-6 bg-white'

  return (
    <main role="main" aria-label="Profile and settings">
      <AccountNav profileHref="/dashboard/patient/profile" dashboardHref="/dashboard/patient" userName={name || email} />

      <div className="container py-8 max-w-5xl">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">Profile &amp; Settings</h1>

        {loadError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mb-6" role="alert">
            {loadError}
          </div>
        )}

        <section className={sectionClass} aria-labelledby="personal-info-heading">
          <h2 id="personal-info-heading" className="font-semibold text-slate-900 mb-4">Personal information</h2>
          <div className="space-y-4">
            <label className="block" htmlFor="profile-name">
              <span className="text-sm mb-1 block">Full name</span>
              <input id="profile-name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="block">
              <label className="block" htmlFor="profile-email">
                <span className="text-sm font-medium mb-1 block text-slate-700">Email</span>
              </label>
              <input
                id="profile-email"
                className={`${fieldClass} bg-slate-50 text-slate-600`}
                value={email}
                readOnly
                aria-readonly="true"
                disabled
                autoComplete="off"
              />
              <span className="text-xs text-slate-500 mt-2 block">Email cannot be changed in this milestone.</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block" htmlFor="profile-dob">
                <span className="text-sm mb-1 block">Date of birth</span>
                <input id="profile-dob" type="date" className={fieldClass} value={dob} onChange={(e) => setDob(e.target.value)} />
              </label>
              <label className="block" htmlFor="profile-gender">
                <span className="text-sm mb-1 block">Gender</span>
                <select id="profile-gender" className={fieldClass} value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="language-heading">
          <h2 id="language-heading" className="font-semibold text-slate-900 mb-4">Language</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block" htmlFor="app-language">
              <span className="text-sm mb-1 block font-medium">App language</span>
              <select id="app-language" className={fieldClass} value={appLang} onChange={(e) => setAppLang(e.target.value)}>
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <span className="text-xs text-slate-500 mt-1 block">
                Your preferred language for the app interface. More Indian languages will be added over time.
              </span>
            </label>
            <label className="block" htmlFor="clinical-language">
              <span className="text-sm mb-1 block font-medium">Clinical communication language</span>
              <select id="clinical-language" className={fieldClass} value={clinicalLang} onChange={(e) => setClinicalLang(e.target.value)}>
                <option value="">No preference</option>
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <span className="text-xs text-slate-500 mt-1 block">
                The language you prefer to use while consulting your doctor. This is kept separate from your app language.
              </span>
            </label>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="abha-heading">
          <h2 id="abha-heading" className="font-semibold text-slate-900 mb-4">ABHA identifier</h2>
          <label className="block" htmlFor="abha-id">
            <span className="text-sm mb-1 block">ABHA Identifier (optional)</span>
            <input id="abha-id" className={fieldClass} value={abhaId} onChange={(e) => setAbhaId(e.target.value)} />
            <span className="text-sm text-gray-500 mt-1 block">
              This adds an optional ABHA/ABDM identifier to your profile. This is an export label only — this app does not connect to ABDM automatically.
            </span>
          </label>
          <div className="mt-3">
            <button
              onClick={saveAbha}
              disabled={savingAbha}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              {savingAbha ? 'Saving...' : 'Save ABHA'}
            </button>
          </div>
          {abhaMsg && (
            <div className={`mt-3 p-3 border rounded text-sm ${messageClass(abhaMsg.type)}`} role="status" aria-live="polite">
              {abhaMsg.text}
            </div>
          )}
        </section>

        <section className={sectionClass} aria-labelledby="security-heading">
          <h2 id="security-heading" className="font-semibold text-slate-900 mb-4">Security</h2>
          <form onSubmit={changePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm mb-1" htmlFor="current-password">Current password</label>
              <div className="flex items-center">
                <input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  className={`${fieldClass} flex-1`}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="ml-2 px-3 py-2 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrent ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1" htmlFor="new-password">New password</label>
              <div className="flex items-center">
                <input
                  id="new-password"
                  type={showNew ? 'text' : 'password'}
                  className={`${fieldClass} flex-1`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="ml-2 px-3 py-2 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  aria-label={showNew ? 'Hide new password' : 'Show new password'}
                >
                  {showNew ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                Your password must contain {passwordHelpText()}.
              </span>
            </div>
            <div>
              <label className="block text-sm mb-1" htmlFor="confirm-password">Confirm new password</label>
              <div className="flex items-center">
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  className={`${fieldClass} flex-1`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="ml-2 px-3 py-2 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                >
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div>
              <button
                type="submit"
                disabled={passwordBusy}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300"
              >
                {passwordBusy ? 'Changing...' : 'Change password'}
              </button>
            </div>
            {passwordMsg && (
              <div className={`p-3 border rounded text-sm ${messageClass(passwordMsg.type)}`} role="status" aria-live="polite">
                {passwordMsg.text}
              </div>
            )}
          </form>
        </section>

        <section className={sectionClass} aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="font-semibold text-slate-900 mb-4">Recent account activity</h2>
          {activities.length === 0 ? (
            <p className="text-sm text-slate-500">No account activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activities.map((a, i) => (
                <li key={`${a.action}-${a.createdAt}-${i}`} className="py-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-slate-800">{activityLabel(a.action)}</span>
                  <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={sectionClass} aria-labelledby="account-section-heading">
          <h2 id="account-section-heading" className="font-semibold text-slate-900 mb-4">Account</h2>
          <p className="text-sm text-slate-600">
            Account deactivation is handled separately. If you need to pause or close your account, contact support.
            Deactivating an account will hide it from the system while preserving your medical records.
          </p>
        </section>

        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={savePersonal}
            disabled={saving}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          <button
            onClick={async () => {
              const res = await fetch('/api/patient/fhir')
              if (!res.ok) return alert('Failed to export FHIR')
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `patient-${name || 'record'}.fhir.json`
              document.body.appendChild(a)
              a.click()
              a.remove()
              URL.revokeObjectURL(url)
            }}
            className="px-4 py-2 border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            Download FHIR Export
          </button>
        </div>
        {saveMsg && (
          <div className={`mt-4 p-3 border rounded text-sm ${messageClass(saveMsg.type)}`} role="status" aria-live="polite">
            {saveMsg.text}
          </div>
        )}
      </div>
    </main>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getSession(ctx)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  const role = (session as any).user?.role
  if (role !== 'PATIENT') return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}