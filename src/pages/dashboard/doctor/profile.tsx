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
  DOCTOR_PROFILE_UPDATED: 'Doctor profile updated',
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

export default function DoctorProfilePage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [speciality, setSpeciality] = useState('')
  const [appLang, setAppLang] = useState('en')
  const [languages, setLanguages] = useState<LanguageOption[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function loadProfile() {
    return Promise.all([
      fetch('/api/doctor/profile').then(r => r.json().catch(() => null)),
      fetch('/api/account').then(r => r.json().catch(() => null)),
    ]).then(([docData, accData]) => {
      const doc = docData && docData.doctor
      if (doc) {
        setName(doc.user?.name || '')
        setEmail(doc.user?.email || '')
        setSpeciality(doc.speciality || '')
      }
      if (accData && accData.account) setAppLang(accData.account.preferredLanguage || 'en')
    })
  }

  function loadMeta() {
    return Promise.all([
      fetch('/api/account/languages').then(r => r.json().catch(() => null)),
      fetch('/api/account/activity').then(r => r.json().catch(() => null)),
    ]).then(([langData, actData]) => {
      setLanguages(langData?.languages || [])
      setActivities(actData?.activities || [])
    })
  }

  useEffect(() => {
    Promise.all([loadProfile(), loadMeta()])
      .then(() => setLoading(false))
      .catch(() => { setLoadError('We could not load your profile. Please try again.'); setLoading(false) })
  }, [])

  async function savePersonal() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const docRes = await fetch('/api/doctor/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, speciality }),
      })
      const docData = await docRes.json().catch(() => null)
      if (!docRes.ok) {
        const field = docData?.errors ? Object.values(docData.errors).flat().join(' ') : docData?.error
        throw new Error(field || 'Unable to save profile')
      }
      const accRes = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: appLang }),
      })
      const accData = await accRes.json().catch(() => null)
      if (!accRes.ok) {
        const field = accData?.errors ? Object.values(accData.errors).flat().join(' ') : accData?.error
        throw new Error(field || 'Unable to save app language')
      }
      setSaveMsg({ type: 'success', text: 'Your settings were saved.' })
      await Promise.all([loadProfile(), loadMeta()])
    } catch (err) {
      const text = err instanceof Error && err.message ? err.message : 'Your settings could not be saved. Please try again.'
      setSaveMsg({ type: 'error', text })
    } finally {
      setSaving(false)
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
      await loadMeta()
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
      <AccountNav profileHref="/dashboard/doctor/profile" dashboardHref="/dashboard/doctor" userName={name || email} />

      <div className="container py-8 max-w-5xl">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">Profile &amp; Settings</h1>

        {loadError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mb-6" role="alert">
            {loadError}
          </div>
        )}

        <section className={sectionClass} aria-labelledby="doctor-personal-heading">
          <h2 id="doctor-personal-heading" className="font-semibold text-slate-900 mb-4">Personal information</h2>
          <div className="space-y-4">
            <label className="block" htmlFor="doctor-name">
              <span className="text-sm mb-1 block">Full name</span>
              <input id="doctor-name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block" htmlFor="doctor-speciality">
              <span className="text-sm mb-1 block">Speciality</span>
              <input id="doctor-speciality" className={fieldClass} value={speciality} onChange={(e) => setSpeciality(e.target.value)} placeholder="e.g. General Practice, Cardiology" />
              <span className="text-xs text-slate-400 mt-1 block">Shown to patients and hospitals when applicable.</span>
            </label>
            <div className="block">
              <span className="text-sm mb-1 block">Email</span>
              <input className={`${fieldClass} bg-slate-50 text-slate-500`} value={email} readOnly aria-readonly="true" disabled />
              <span className="text-xs text-slate-400 mt-1 block">Email cannot be changed in this milestone.</span>
            </div>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="doctor-language-heading">
          <h2 id="doctor-language-heading" className="font-semibold text-slate-900 mb-4">Language</h2>
          <label className="block" htmlFor="doctor-app-language">
            <span className="text-sm mb-1 block font-medium">App language</span>
            <select id="doctor-app-language" className={fieldClass} value={appLang} onChange={(e) => setAppLang(e.target.value)}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500 mt-1 block">
              Your preferred language for the app interface. More Indian languages will be added over time.
            </span>
          </label>
        </section>

        <section className={sectionClass} aria-labelledby="doctor-security-heading">
          <h2 id="doctor-security-heading" className="font-semibold text-slate-900 mb-4">Security</h2>
          <form onSubmit={changePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm mb-1" htmlFor="doctor-current-password">Current password</label>
              <div className="flex items-center">
                <input id="doctor-current-password" type={showCurrent ? 'text' : 'password'} className={`${fieldClass} flex-1`} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                <button type="button" onClick={() => setShowCurrent((v) => !v)} className="ml-2 px-3 py-2 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label={showCurrent ? 'Hide current password' : 'Show current password'}>
                  {showCurrent ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1" htmlFor="doctor-new-password">New password</label>
              <div className="flex items-center">
                <input id="doctor-new-password" type={showNew ? 'text' : 'password'} className={`${fieldClass} flex-1`} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                <button type="button" onClick={() => setShowNew((v) => !v)} className="ml-2 px-3 py-2 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label={showNew ? 'Hide new password' : 'Show new password'}>
                  {showNew ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                Your password must contain {passwordHelpText()}.
              </span>
            </div>
            <div>
              <label className="block text-sm mb-1" htmlFor="doctor-confirm-password">Confirm new password</label>
              <div className="flex items-center">
                <input id="doctor-confirm-password" type={showConfirm ? 'text' : 'password'} className={`${fieldClass} flex-1`} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="ml-2 px-3 py-2 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}>
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div>
              <button type="submit" disabled={passwordBusy} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300">
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

        <section className={sectionClass} aria-labelledby="doctor-activity-heading">
          <h2 id="doctor-activity-heading" className="font-semibold text-slate-900 mb-4">Recent account activity</h2>
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

        <section className={sectionClass} aria-labelledby="doctor-account-heading">
          <h2 id="doctor-account-heading" className="font-semibold text-slate-900 mb-4">Account</h2>
          <p className="text-sm text-slate-600">
            Account deactivation is handled separately. Your doctor verification status, hospital links and clinical records cannot be changed from this page.
          </p>
        </section>

        <div className="mt-2">
          <button
            onClick={savePersonal}
            disabled={saving}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            {saving ? 'Saving...' : 'Save settings'}
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
  if (role !== 'DOCTOR') return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}