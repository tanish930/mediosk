import { GetServerSideProps } from 'next'
import { requireRole } from '../../lib/auth'
import { useEffect, useState } from 'react'
import { getSession } from 'next-auth/react'
import AccountNav from '../../components/AccountNav'
import { passwordHelpText } from '../../lib/passwordPolicy'

export default function HospitalDashboard() {
  const [tab, setTab] = useState<'profile'|'doctors'|'queue'|'emergency'>('profile')
  const [userName, setUserName] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/hospital/profile')
      .then(r => r.json().catch(() => null))
      .then(d => {
        if (d?.hospital?.user) setUserName(d.hospital.user.name || d.hospital.user.email || null)
      })
      .catch(() => {})
  }, [])

  return (
    <>
      <AccountNav profileHref="#profile-section" dashboardHref="/dashboard/hospital" userName={userName} />
      <main className="container py-8">
        <h1 className="text-2xl font-semibold mb-4">Hospital Dashboard</h1>
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => setTab('profile')} className={`px-3 py-2 rounded ${tab === 'profile' ? 'bg-sky-600 text-white' : 'border'}`}>Profile</button>
          <button onClick={() => setTab('doctors')} className={`px-3 py-2 rounded ${tab === 'doctors' ? 'bg-sky-600 text-white' : 'border'}`}>Doctors</button>
          <button onClick={() => setTab('queue')} className={`px-3 py-2 rounded ${tab === 'queue' ? 'bg-sky-600 text-white' : 'border'}`}>Patient Queue</button>
          <button onClick={() => setTab('emergency')} className={`px-3 py-2 rounded ${tab === 'emergency' ? 'bg-sky-600 text-white' : 'border'}`}>Emergency Alerts</button>
        </div>
        <div>
          {tab === 'profile' && <HospitalProfile onSaved={(name) => setUserName(name)} />}
          {tab === 'doctors' && <HospitalDoctors />}
          {tab === 'queue' && <HospitalQueue />}
          {tab === 'emergency' && <HospitalEmergencyEmbed />}
        </div>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  return requireRole(ctx, 'HOSPITAL')
}

function messageClass(type: 'success' | 'error'): string {
  return type === 'success'
    ? 'text-green-700 bg-green-50 border-green-200'
    : 'text-red-700 bg-red-50 border-red-200'
}

function doctorStatusClass(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'bg-green-100 text-green-800'
    case 'SUSPENDED': return 'bg-red-100 text-red-800'
    default: return 'bg-amber-100 text-amber-800'
  }
}

function HospitalProfile({ onSaved }: { onSaved?: (name: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [appLang, setAppLang] = useState('en')
  const [languages, setLanguages] = useState<{ code: string; label: string }[]>([])
  const [activities, setActivities] = useState<{ action: string; note: string | null; createdAt: string }[]>([])
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

  const ACTIVITY_LABELS: Record<string, string> = {
    PASSWORD_CHANGED: 'Password changed',
    ACCOUNT_UPDATED: 'Account settings updated',
    HOSPITAL_PROFILE_UPDATED: 'Hospital profile updated',
    LOGIN: 'Signed in',
  }

  function loadAll() {
    return Promise.all([
      fetch('/api/hospital/profile').then(r => r.json().catch(() => null)),
      fetch('/api/account').then(r => r.json().catch(() => null)),
      fetch('/api/account/languages').then(r => r.json().catch(() => null)),
      fetch('/api/account/activity').then(r => r.json().catch(() => null)),
    ]).then(([hData, accData, langData, actData]) => {
      const h = hData?.hospital
      if (h) {
        setName(h.user?.name || '')
        setEmail(h.user?.email || '')
        setAddress(h.address || '')
      }
      if (accData?.account) setAppLang(accData.account.preferredLanguage || 'en')
      setLanguages(langData?.languages || [])
      setActivities(actData?.activities || [])
    })
  }

  useEffect(() => { loadAll().finally(() => setLoading(false)) }, [])

  async function saveProfile() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const hRes = await fetch('/api/hospital/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, address }),
      })
      const hData = await hRes.json().catch(() => null)
      if (!hRes.ok) {
        const field = hData?.errors ? Object.values(hData.errors).flat().join(' ') : hData?.error
        throw new Error(field || 'Unable to save hospital profile')
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
      onSaved?.(name)
      await loadAll()
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
      setPasswordMsg({ type: 'success', text: 'Your password was changed. In this prototype, existing sessions on other devices may remain active.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      await loadAll()
    } catch (err) {
      const text = err instanceof Error && err.message ? err.message : 'Could not change your password. Please try again.'
      setPasswordMsg({ type: 'error', text })
    } finally {
      setPasswordBusy(false)
    }
  }

  if (loading) return <div className="text-slate-500">Loading...</div>

  const fieldClass = 'w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-sky-300'
  const sectionClass = 'border border-slate-200 rounded-xl p-5 mb-6 bg-white'

  return (
    <div id="profile-section" className="max-w-2xl" role="region" aria-label="Hospital profile and settings">
      <section className={sectionClass} aria-labelledby="hosp-personal-heading">
        <h2 id="hosp-personal-heading" className="font-semibold mb-4">Hospital information</h2>
        <div className="space-y-4">
          <label className="block" htmlFor="hosp-name">
            <span className="text-sm mb-1 block">Hospital / account name</span>
            <input id="hosp-name" className={fieldClass} value={name} onChange={e => setName(e.target.value)} />
          </label>
          <div className="block">
            <span className="text-sm mb-1 block">Email</span>
            <input className={`${fieldClass} bg-slate-50 text-slate-500`} value={email} readOnly aria-readonly="true" disabled />
            <span className="text-xs text-slate-400 mt-1 block">Email cannot be changed in this milestone.</span>
          </div>
          <label className="block" htmlFor="hosp-address">
            <span className="text-sm mb-1 block">Address</span>
            <textarea id="hosp-address" className={`${fieldClass} resize-y`} rows={3} value={address} onChange={e => setAddress(e.target.value)} />
          </label>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="hosp-language-heading">
        <h2 id="hosp-language-heading" className="font-semibold mb-4">Language</h2>
        <label className="block" htmlFor="hosp-app-language">
          <span className="text-sm mb-1 block font-medium">App language</span>
          <select id="hosp-app-language" className={fieldClass} value={appLang} onChange={e => setAppLang(e.target.value)}>
            {languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <span className="text-xs text-slate-500 mt-1 block">
            Your preferred language for the app interface. More Indian languages will be added over time.
          </span>
        </label>
      </section>

      <section className={sectionClass} aria-labelledby="hosp-security-heading">
        <h2 id="hosp-security-heading" className="font-semibold mb-4">Security</h2>
        <form onSubmit={changePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm mb-1" htmlFor="hosp-current-password">Current password</label>
            <div className="flex items-center">
              <input id="hosp-current-password" type={showCurrent ? 'text' : 'password'} className={`${fieldClass} flex-1`} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" onClick={() => setShowCurrent(v => !v)} className="ml-2 px-3 py-2 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label={showCurrent ? 'Hide current password' : 'Show current password'}>
                {showCurrent ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="hosp-new-password">New password</label>
            <div className="flex items-center">
              <input id="hosp-new-password" type={showNew ? 'text' : 'password'} className={`${fieldClass} flex-1`} value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
              <button type="button" onClick={() => setShowNew(v => !v)} className="ml-2 px-3 py-2 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label={showNew ? 'Hide new password' : 'Show new password'}>
                {showNew ? 'Hide' : 'Show'}
              </button>
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Your password must contain {passwordHelpText()}.</span>
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="hosp-confirm-password">Confirm new password</label>
            <div className="flex items-center">
              <input id="hosp-confirm-password" type={showConfirm ? 'text' : 'password'} className={`${fieldClass} flex-1`} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              <button type="button" onClick={() => setShowConfirm(v => !v)} className="ml-2 px-3 py-2 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}>
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
            <div className={`p-3 border rounded text-sm ${messageClass(passwordMsg.type)}`} role="status" aria-live="polite">{passwordMsg.text}</div>
          )}
        </form>
      </section>

      <section className={sectionClass} aria-labelledby="hosp-activity-heading">
        <h2 id="hosp-activity-heading" className="font-semibold mb-4">Recent account activity</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-slate-500">No account activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activities.map((a, i) => (
              <li key={`${a.action}-${a.createdAt}-${i}`} className="py-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-slate-800">{ACTIVITY_LABELS[a.action] || a.action}</span>
                <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={sectionClass} aria-labelledby="hosp-account-heading">
        <h2 id="hosp-account-heading" className="font-semibold mb-4">Account</h2>
        <p className="text-sm text-slate-600">
          Account deactivation is handled separately. Doctor assignments and consultation records cannot be changed from this page.
        </p>
      </section>

      <div className="mt-2">
        <button onClick={saveProfile} disabled={saving} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300">
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>
      {saveMsg && (
        <div className={`mt-4 p-3 border rounded text-sm ${messageClass(saveMsg.type)}`} role="status" aria-live="polite">{saveMsg.text}</div>
      )}
    </div>
  )
}

function HospitalDoctors() {
  const [links, setLinks] = useState<any[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  useEffect(() => { load() }, [])
  async function load() { const r = await fetch('/api/hospital/doctors'); const j = await r.json(); setLinks(j.doctors || []) }
  async function add() {
    const r = await fetch('/api/hospital/doctors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doctorId }) })
    const j = await r.json().catch(() => null)
    if (!r.ok) { setMessage({ type: 'error', text: j?.error || 'Could not add doctor' }); return }
    setDoctorId('')
    setMessage({ type: 'success', text: 'Doctor linked to the hospital.' })
    await load()
  }
  async function setStatus(linkId: string, action: 'activate' | 'deactivate') {
    setBusyId(linkId)
    setMessage(null)
    try {
      const r = await fetch(`/api/hospital/doctors/${linkId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) { setMessage({ type: 'error', text: j?.error || 'Could not update doctor status' }); return }
      setMessage({ type: 'success', text: action === 'activate' ? 'Doctor activated. They can now receive assignments.' : 'Doctor deactivated. They can no longer receive assignments.' })
      await load()
    } catch {
      setMessage({ type: 'error', text: 'Could not update doctor status' })
    } finally {
      setBusyId(null)
    }
  }
  return (
    <div>
      <h2 className="font-semibold mb-2">Doctors</h2>
      {message && (
        <div className={`mb-2 p-3 border rounded text-sm ${messageClass(message.type)}`} role="status" aria-live="polite">{message.text}</div>
      )}
      <div className="mb-3">
        <input className="border p-2 mr-2" placeholder="Doctor ID" value={doctorId} onChange={e => setDoctorId(e.target.value)} />
        <button onClick={add} className="px-3 py-2 bg-sky-600 text-white rounded">Add Doctor</button>
        <p className="text-xs text-slate-500 mt-1">
          New doctors start as PENDING. Activate a doctor before they can receive consultation assignments.
        </p>
      </div>
      <div className="space-y-2">
        {links.map(l => (
          <div key={l.id} className="p-3 border rounded">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{l.doctor.user?.name || l.doctor.user?.email}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${doctorStatusClass(l.status)}`}>
                {l.status}
              </span>
              {l.status === 'PENDING' && (
                <button onClick={() => setStatus(l.id, 'activate')} disabled={busyId === l.id} className="px-2 py-1 text-xs bg-green-600 text-white rounded disabled:opacity-50">
                  {busyId === l.id ? 'Updating...' : 'Activate'}
                </button>
              )}
              {l.status === 'ACTIVE' && (
                <button onClick={() => setStatus(l.id, 'deactivate')} disabled={busyId === l.id} className="px-2 py-1 text-xs bg-amber-500 text-white rounded disabled:opacity-50">
                  {busyId === l.id ? 'Updating...' : 'Deactivate'}
                </button>
              )}
            </div>
            <div className="text-sm">Verifications: {l.doctor.verifications?.length || 0}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HospitalQueue() {
  const [consultations, setConsultations] = useState<any[]>([])
  const [doctors, setDoctors] = useState<any[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({})
  const [scheduleBusyId, setScheduleBusyId] = useState<string | null>(null)
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null)

  useEffect(() => {
    load()
    loadDoctors()
    const interval = setInterval(() => { load() }, 10000)
    return () => clearInterval(interval)
  }, [])

  async function load() { const r = await fetch('/api/hospital/queue'); const j = await r.json(); setConsultations(j.consultations || []) }
  async function loadDoctors() { const r = await fetch('/api/hospital/doctors'); const j = await r.json(); setDoctors(j.doctors || []) }
  async function assign(consult: any, doctorId: string) { await fetch('/api/consultations/assign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consultationId: consult.id, doctorId }) }); await load() }
  async function schedule(consultationId: string) {
    const scheduledAt = scheduleDrafts[consultationId]
    if (!scheduledAt) return
    setScheduleBusyId(consultationId)
    await fetch(`/api/consultations/${consultationId}/schedule`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scheduledAt: new Date(scheduledAt).toISOString() }) })
    setScheduleDrafts(prev => ({ ...prev, [consultationId]: '' }))
    setScheduleBusyId(null)
    await load()
  }
  async function cancel(consultationId: string) {
    if (!window.confirm('Cancel this consultation?')) return
    setCancelBusyId(consultationId)
    await fetch(`/api/consultations/${consultationId}/cancel`, { method: 'POST' })
    setCancelBusyId(null)
    await load()
  }
  return (
    <div>
      <h2 className="font-semibold mb-2">Patient / Consultation Queue</h2>
      <div className="space-y-3">
        {consultations.map(c => (
          <div key={c.id} className="p-3 border rounded">
            <div className="font-semibold">{c.status} — {c.patient?.user?.name || c.patient?.user?.email}</div>
            <div className="text-sm">Complaint: {c.session?.report?.chiefComplaint || c.session?.complaint}</div>
            {c.scheduledAt && (
              <div className="text-sm text-slate-600">
                Scheduled: {new Date(c.scheduledAt).toLocaleString()}
              </div>
            )}
            {c.doctorId && (c.status === 'READY' || c.status === 'SCHEDULED') && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  aria-label="Schedule date and time"
                  className="border p-1 rounded text-sm"
                  value={scheduleDrafts[c.id] || ''}
                  onChange={(e) => setScheduleDrafts(prev => ({ ...prev, [c.id]: e.target.value }))}
                />
                <button onClick={() => schedule(c.id)} disabled={scheduleBusyId === c.id || !scheduleDrafts[c.id]} className="px-3 py-2 bg-sky-600 text-white rounded disabled:opacity-50">
                  {scheduleBusyId === c.id ? 'Scheduling...' : 'Schedule'}
                </button>
              </div>
            )}
            {(c.status === 'REQUESTED' || c.status === 'READY' || c.status === 'SCHEDULED') && (
              <div className="mt-2">
                <button onClick={() => cancel(c.id)} disabled={cancelBusyId === c.id} className="px-3 py-2 bg-red-600 text-white rounded disabled:opacity-50">
                  {cancelBusyId === c.id ? 'Cancelling...' : 'Cancel'}
                </button>
              </div>
            )}
            {c.status === 'REQUESTED' && <div className="mt-2">
              <select
                className="border p-1 mr-2"
                value={assignments[c.id] || ""}
                onChange={(e) => setAssignments(prev => ({ ...prev, [c.id]: e.target.value }))}
              >
                <option value="">Assign to...</option>
                {doctors.map(d => <option key={d.id} value={d.doctor.id}>{d.doctor.user?.name || d.doctor.user?.email}</option>)}
              </select>
              <button onClick={async () => { const docId = assignments[c.id]; if (docId) await assign(c, docId) }} className="px-3 py-2 bg-sky-600 text-white rounded">Assign</button>
            </div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function HospitalEmergencyEmbed() {
  return (<div><iframe src="/dashboard/hospital/emergency" className="w-full h-96 border-0" title="Emergency" /></div>)
}