import { useRouter } from 'next/router'
import { getSession } from 'next-auth/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  verificationFailureMessage,
  verificationSuccessMessage,
} from '../../../../lib/verificationFeedback'
import { groupPatientAyurvedicHistory } from '../../../../lib/ayurvedaReport'
import { timelineSourceLabel } from '../../../../lib/timeline'

function displayReportValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return 'Not reported'
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function abnormalBadgeClass(status: string): string {
  switch (status) {
    case 'HIGH': return 'bg-red-100 text-red-800'
    case 'LOW': return 'bg-amber-100 text-amber-800'
    case 'NORMAL': return 'bg-green-100 text-green-800'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function emergencySeverityClass(severity: string): string {
  switch (severity) {
    case 'EMERGENCY': return 'bg-red-100 text-red-800'
    case 'URGENT': return 'bg-amber-100 text-amber-800'
    case 'NORMAL': return 'bg-slate-100 text-slate-600'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function emergencyStatusClass(status: string): string {
  switch (status) {
    case 'OPEN': return 'bg-red-100 text-red-800 border-red-300'
    case 'ACKNOWLEDGED': return 'bg-amber-100 text-amber-800 border-amber-300'
    case 'RESOLVED': return 'bg-green-100 text-green-800 border-green-300'
    default: return 'bg-slate-100 text-slate-600 border-slate-300'
  }
}

// Compact, read-only view of persisted emergency workflow alerts, shown
// adjacent to the rule-based red-flag banner. The hospital workflow owns
// acknowledge/resolve; this never mutates alerts and renders nothing when
// there are no alerts.
function EmergencyAlertsSubsection({ alerts }: { alerts: any[] }) {
  const list = alerts || []
  if (list.length === 0) return null

  return (
    <div
      className="p-3 mb-4 bg-orange-50 border-2 border-orange-300 rounded"
      role="alert"
      aria-label="Emergency alerts"
    >
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h3 className="font-bold text-orange-800">
          {'\u26A0\uFE0F'} Emergency Alert{list.length > 1 ? 's' : ''}
        </h3>
        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          Persisted hospital workflow record
        </span>
      </div>
      <p className="text-orange-800 text-sm mb-2">
        This is a persisted emergency workflow alert for this case that
        requires clinical attention. It is distinct from the rule-based red
        flags detected from the pre-consultation answers above.
      </p>
      <div className="space-y-1.5">
        {list.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${emergencySeverityClass(
                a.severity
              )}`}
            >
              {a.severity}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${emergencyStatusClass(
                a.status
              )}`}
            >
              {a.status}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {a.source}
            </span>
            {a.createdAt && (
              <span className="text-xs text-slate-600">
                Created: {new Date(a.createdAt).toLocaleString()}
              </span>
            )}
            {a.acknowledgedAt && (
              <span className="text-xs text-amber-700">
                Acknowledged: {new Date(a.acknowledgedAt).toLocaleString()}
              </span>
            )}
            {a.resolvedAt && (
              <span className="text-xs text-green-700">
                Resolved: {new Date(a.resolvedAt).toLocaleString()}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function VerificationControls({
  targetType,
  targetId,
  verifications,
  notes,
  onNoteChange,
  onVerify,
}: {
  targetType: string
  targetId: string
  verifications: any[]
  notes: Record<string, string>
  onNoteChange: (key: string, value: string) => void
  onVerify: (targetType: string, targetId: string, status: string, note?: string) => void
}) {
  const latest = [...(verifications || [])]
    .reverse()
    .find((v: any) => v.targetType === targetType && v.targetId === targetId)
  const key = `${targetType}:${targetId}`

  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => onVerify(targetType, targetId, 'REVIEWED', notes[key] || undefined)}
          className="px-3 py-1 bg-yellow-500 text-white rounded text-xs"
        >
          Mark Reviewed
        </button>
        <button
          type="button"
          onClick={() => onVerify(targetType, targetId, 'VERIFIED', notes[key] || undefined)}
          className="px-3 py-1 bg-green-600 text-white rounded text-xs"
        >
          Mark Verified
        </button>
        {latest && (
          <span className="text-xs text-gray-600">
            Status: <span className="font-medium">{latest.status}</span>
            {latest.note ? ` — ${latest.note}` : ''}
          </span>
        )}
      </div>
      <input
        type="text"
        aria-label={`Verification note for ${targetType}`}
        placeholder="Verification note (optional)"
        className="border p-1 text-sm rounded w-full max-w-xs"
        value={notes[key] || ''}
        onChange={(e) => onNoteChange(key, e.target.value)}
      />
    </div>
  )
}

export default function CaseSheet() {
  const router = useRouter()
  const { id } = router.query

  const [data, setData] = useState<any>(null)
  const [ayush, setAyush] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [verifications, setVerifications] = useState<any[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [doshaAssessment, setDoshaAssessment] = useState<any>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (id) {
      fetch(`/api/doctor/case/${id}`)
        .then((r) => r.json())
        .then((d) => {
          setData(d)
          setVerifications(d.verifications || [])
        })
    }
  }, [id])

  const refreshAyush = useCallback(async () => {
    try {
      const res = await fetch(`/api/doctor/ayush/${id}`)
      if (res.ok) {
        const d = await res.json()
        setAyush(d.ayush)
        setForm(d.ayush || {})
        setDoshaAssessment(d.doshaAssessment || null)
        setSuggestions(d.suggestions || [])
      }
    } catch {
      // keep the current data if the refresh fails
    }
  }, [id])

  useEffect(() => {
    if (id) {
      refreshAyush()
    }
  }, [id, refreshAyush])

  function setNadi(key: string, value: unknown) {
    const current =
      typeof form.nadiData === 'object' && form.nadiData ? form.nadiData : {}
    setForm({ ...form, nadiData: { ...current, [key]: value } })
  }

  function cleanedNadiData(): unknown {
    const nd =
      typeof form.nadiData === 'object' && form.nadiData ? form.nadiData : {}
    const out: Record<string, unknown> = {}
    if (nd.rateBpm !== undefined && nd.rateBpm !== null && nd.rateBpm !== '') {
      out.rateBpm = Number(nd.rateBpm)
    }
    for (const k of ['rhythm', 'gati', 'quality', 'note']) {
      const v = nd[k]
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        out[k] = String(v).trim()
      }
    }
    return Object.keys(out).length > 0 ? out : undefined
  }

  const caseData = data?.consultation
  const emergencyAlerts = data?.emergencyAlerts || []

  const verifyingRef = useRef<Set<string>>(new Set())

  async function refreshCase() {
    try {
      const res = await fetch(`/api/doctor/case/${id}`)
      if (res.ok) {
        const d = await res.json()
        setData(d)
        setVerifications(d.verifications || [])
      }
    } catch {
      // keep the current data if the refresh fails
    }
  }

  function latestVerification(targetType: string, targetId: string) {
    return [...(verifications || [])]
      .reverse()
      .find((v: any) => v.targetType === targetType && v.targetId === targetId)
  }

  async function verify(
    targetType: string,
    targetId: string,
    status: string,
    note?: string
  ) {
    const key = `${targetType}:${targetId}:${status}`
    if (verifyingRef.current.has(key)) return
    verifyingRef.current.add(key)

    try {
      const res = await fetch(`/api/doctor/case/${id}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, status, note }),
      })
      const body = await res.json().catch(() => null)

      if (!res.ok) {
        alert(verificationFailureMessage((body as any)?.error))
        return
      }

      setNotes((prev) => {
        const next = { ...prev }
        delete next[`${targetType}:${targetId}`]
        return next
      })
      await refreshCase()

      alert(verificationSuccessMessage(targetType, status))
    } catch (err) {
      alert(verificationFailureMessage(null))
    } finally {
      verifyingRef.current.delete(key)
    }
  }

  async function reviewSuggestion(s: any, status: string) {
    const note = reviewNotes[s.id] || undefined
    try {
      const res = await fetch(`/api/doctor/ayush/formulation/${s.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, note }),
      })
      const body = await res.json().catch(() => null)

      if (!res.ok) {
        alert((body as any)?.error || 'Could not update the formulation suggestion')
        return
      }

      setReviewNotes((prev) => {
        const next = { ...prev }
        delete next[s.id]
        return next
      })
      await refreshAyush()
      alert(
        status === 'APPROVED'
          ? 'Formulation suggestion approved. Decision support only — not a prescription.'
          : 'Formulation suggestion rejected.'
      )
    } catch {
      alert('Could not update the formulation suggestion')
    }
  }

  if (!caseData) {
    return <div className="container py-8">Loading...</div>
  }

  const patient = caseData.patient
  const session = caseData.session

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold mb-4">
        Case: {patient.user.name || patient.user.email}
      </h1>

      <div className="mb-4">
        {(caseData.status === 'SCHEDULED' ||
          caseData.status === 'IN_PROGRESS' ||
          caseData.status === 'READY') && (
          <a
            href={`/dashboard/consultation/${caseData.id}`}
            className="px-3 py-2 bg-sky-600 text-white rounded"
          >
            Join Consultation
          </a>
        )}
      </div>

      <section className="mb-4">
        <h2 className="font-semibold">Patient Information</h2>
        <div>DOB: {patient.dob}</div>
        <div>Gender: {patient.gender}</div>
      </section>

      <section className="mb-4">
        <h2 className="font-semibold text-lg border-b pb-1 mb-2 flex flex-wrap items-center gap-2">
          General Clinical History
          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">
            Patient reported
          </span>
        </h2>

        <div className="bg-white p-4 border rounded shadow-sm">
          <div className="font-medium text-sky-800 mb-2">
            Primary Complaint: {session?.complaint}
          </div>

          {session?.report?.redFlags && Array.isArray(session.report.redFlags) && session.report.redFlags.length > 0 && (
            <div className="p-4 mb-4 bg-red-50 border-2 border-red-300 rounded" role="alert">
              <h3 className="font-bold text-red-800 mb-1">{'\u26A0\uFE0F'} Red Flags Detected</h3>
              <p className="text-red-700 text-sm mb-2">
                The patient&apos;s pre-consultation answers matched these rule-based red-flag keywords.
                Discuss and verify them with the patient before continuing.
              </p>
              <ul className="list-disc list-inside text-sm text-red-800">
                {session.report.redFlags.map((f: any, i: number) => (
                  <li key={i}>{String(f)}</li>
                ))}
              </ul>
            </div>
          )}

          <EmergencyAlertsSubsection alerts={emergencyAlerts} />

          {session?.report ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {/* HPI */}
              <div className="space-y-2">
                <h3 className="font-semibold border-b">
                  History of Present Illness (HPI)
                </h3>

                <div>
                  <span className="text-gray-600">Chief Complaint:</span>{' '}
                  {displayReportValue(session.report.chiefComplaint)}
                </div>

                <div>
                  <span className="text-gray-600">Onset/Duration:</span>{' '}
                  {displayReportValue(session.report.onsetDuration)}
                </div>

                <div>
                  <span className="text-gray-600">Location:</span>{' '}
                  {displayReportValue(session.report.location)}
                </div>

                <div>
                  <span className="text-gray-600">Severity:</span>{' '}
                  {displayReportValue(session.report.severity)}
                </div>

                <div>
                  <span className="text-gray-600">Character:</span>{' '}
                  {displayReportValue(session.report.character)}
                </div>

                <div>
                  <span className="text-gray-600">Aggravating:</span>{' '}
                  {displayReportValue(session.report.aggravating)}
                </div>

                <div>
                  <span className="text-gray-600">Relieving:</span>{' '}
                  {displayReportValue(session.report.relieving)}
                </div>

                <div>
                  <span className="text-gray-600">Associated:</span>{' '}
                  {displayReportValue(session.report.associated)}
                </div>
              </div>

              {/* Medical and Social History */}
              <div className="space-y-2">
                <h3 className="font-semibold border-b">
                  Medical & Social History
                </h3>

                <div>
                  <span className="text-gray-600">
                    Past Medical History:
                  </span>{' '}
                  {displayReportValue(session.report.relevantHistory)}
                </div>

                <div>
                  <span className="text-gray-600">
                    Past Surgical History:
                  </span>{' '}
                  {session.report.pastSurgicalHistory || 'Not reported'}
                </div>

                <div>
                  <span className="text-gray-600">
                    Current Medications:
                  </span>{' '}
                  {displayReportValue(session.report.currentMedications)}
                </div>

                <div>
                  <span className="text-gray-600">Allergies:</span>{' '}
                  {displayReportValue(session.report.allergies)}
                </div>

                <div>
                  <span className="text-gray-600">Family History:</span>{' '}
                  {session.report.familyHistory || 'Not reported'}
                </div>

                <div>
                  <span className="text-gray-600">
                    Personal/Social History:
                  </span>{' '}
                  {session.report.personalSocialHistory || 'Not reported'}
                </div>

                <div>
                  <span className="text-gray-600">
                    Review of Systems:
                  </span>{' '}
                  {session.report.reviewOfSystems || 'Not reported'}
                </div>
              </div>

              {/* Verification */}
              <div className="md:col-span-2 pt-2 border-t mt-2">
                <VerificationControls
                  targetType="PRECONSULTATION_REPORT"
                  targetId={session.report.id}
                  verifications={verifications}
                  notes={notes}
                  onNoteChange={(key, value) =>
                    setNotes((prev) => ({ ...prev, [key]: value }))
                  }
                  onVerify={(t, tid, s, note) => verify(t, tid, s, note)}
                />
              </div>
            </div>
          ) : (
            <div className="text-gray-500 italic">
              No final report generated yet. The patient might still be in the
              pre-consultation phase.
            </div>
          )}
        </div>
      </section>

      {/* Patient-reported Ayurvedic history (separate from doctor assessment) */}
      {(() => {
        const patientAyush = session?.report?.ayush
        if (!patientAyush) return null
        const groups = groupPatientAyurvedicHistory(patientAyush)
        if (groups.length === 0) return null
        return (
          <section className="mb-4">
            <h2 className="font-semibold text-lg border-b pb-1 mb-2 flex flex-wrap items-center gap-2">
              Patient-reported Ayurvedic history
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">
                Patient reported
              </span>
            </h2>
            <div className="bg-white p-4 border rounded shadow-sm">
              <p className="text-sm text-gray-500 mb-3">
                These items were reported by the patient during the
                pre-consultation interview. They are patient-reported
                information and are not an Ayurvedic assessment and do not
                determine Prakriti or Vikriti.
              </p>
              {groups.map((g: any) => (
                <div key={g.id} className="mb-4">
                  <h3 className="font-semibold border-b">{g.title}</h3>
                  <div className="space-y-1 mt-1 text-sm">
                    {g.findings.map((f: any) => (
                      <div key={f.key}>
                        <span className="text-gray-600">{f.label}:</span>{' '}
                        {f.notSure
                          ? 'Not sure / Not reported'
                          : displayReportValue(f.value)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      {/* AI Medical Summaries */}
      <section className="mb-4">
        <h2 className="font-semibold">AI Medical Summaries</h2>

        <div className="space-y-2">
          {data.summaries?.map((s: any) => (
            <div key={s.id} className="p-3 border rounded">
              <div>
                Version: {s.version} — {s.status}
              </div>

              <div>
                Patient Summary: {s.patientSummary}
              </div>

              <VerificationControls
                targetType="MEDICAL_SUMMARY"
                targetId={s.id}
                verifications={verifications}
                notes={notes}
                onNoteChange={(key, value) =>
                  setNotes((prev) => ({ ...prev, [key]: value }))
                }
                onVerify={(t, tid, status, note) => verify(t, tid, status, note)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Medical Timeline */}
      <section className="mb-4">
        <h2 className="font-semibold">Medical Timeline</h2>

        <div className="space-y-2">
          {data.timelines?.map((t: any) => (
            <div key={t.id} className="p-2 border rounded">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {t.title} — {t.entryType}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    t.sourceDocumentId
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {timelineSourceLabel(t)}
                </span>
              </div>

              <div className="text-sm mt-0.5">{t.details}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Documents */}
      <section className="mb-4">
        <h2 className="font-semibold">Documents & Extractions</h2>

        <div className="space-y-2">
          {data.documents?.map((d: any) => (
            <div key={d.id} className="p-3 border rounded">
              <div className="font-semibold">
                {d.title} — {d.documentDate}
              </div>

              <div>
                URL:{' '}
                <a
                  href={`/api/doctor/documents/${d.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600"
                >
                  Open
                </a>
              </div>

              <div className="mt-2">Extractions:</div>

              {(d.abnormalities || []).length > 0 && (
                <div className="mt-1 p-2 bg-slate-50 border rounded">
                  <div className="font-semibold text-sm">
                    Investigation Levels (AI/OCR extracted)
                  </div>
                  <div className="space-y-1 mt-1 text-sm">
                    {d.abnormalities.map((inv: any, i: number) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{inv.name}</span>
                        <span>
                          {inv.value}
                          {inv.unit ? ` ${inv.unit}` : ''}
                        </span>
                        {inv.referenceRange && (
                          <span className="text-gray-500">
                            ({inv.referenceRange})
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${abnormalBadgeClass(
                            inv.status
                          )}`}
                        >
                          {inv.status}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    AI-generated level: flag only. Verify the value against the
                    original document before relying on it.
                  </p>
                </div>
              )}

              <pre className="bg-gray-50 p-2 rounded mt-1">
                {JSON.stringify(d.extractions || [], null, 2)}
              </pre>

              <VerificationControls
                targetType="DOCUMENT"
                targetId={d.id}
                verifications={verifications}
                notes={notes}
                onNoteChange={(key, value) =>
                  setNotes((prev) => ({ ...prev, [key]: value }))
                }
                onVerify={(t, tid, status, note) => verify(t, tid, status, note)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* AYUSH Assessment */}
      <section className="mb-4">
        <h2 className="font-semibold text-lg border-b pb-1 mb-2 flex flex-wrap items-center gap-2">
          Doctor Ayurvedic Assessment
          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
            Doctor verified
          </span>
        </h2>

        <div className="p-3 border rounded">
          {ayush && !editing && (
            <div>
              <div className="font-medium text-sm text-slate-700 border-b mt-2">
                History &amp; lifestyle
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 text-sm mt-1">
                <div>Prakriti: {ayush.prakriti}</div>
                <div>Vikriti: {ayush.vikriti}</div>
                <div>Satmya: {ayush.satmya}</div>
                <div>Sattva: {ayush.sattva}</div>
                <div>Ahara Shakti: {ayush.aharaShakti}</div>
                <div>Vyayama Shakti: {ayush.vyayamaShakti}</div>
                <div>Vaya: {ayush.vaya}</div>
                <div>Ahara-Vihara: {ayush.aharaVihara}</div>
                <div>Agni: {ayush.agni}</div>
                <div>Koshtha: {ayush.koshtha}</div>
                <div>Sleep (history): {ayush.sleep || 'Not recorded'}</div>
              </div>

              <div className="font-medium text-sm text-slate-700 border-b mt-3">
                Clinical examination
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 text-sm mt-1">
                <div>Sara: {ayush.sara}</div>
                <div>Samhanana: {ayush.samhanna}</div>
                <div>Pramana: {ayush.pramana}</div>
                <div>Nadi (pulse): {ayush.nadi}</div>
              </div>

              {ayush.nadiData && (
                <div className="mt-2 text-sm">
                  <div className="font-medium text-slate-700 border-b">
                    Pulse (Nadi) — structured capture
                  </div>
                  {ayush.nadiData.rateBpm !== undefined &&
                  ayush.nadiData.rateBpm !== null
                    ? <div>Rate: {ayush.nadiData.rateBpm} bpm</div>
                    : null}
                  {ayush.nadiData.rhythm ? <div>Rhythm: {ayush.nadiData.rhythm}</div> : null}
                  {ayush.nadiData.gati ? <div>Gati: {ayush.nadiData.gati}</div> : null}
                  {ayush.nadiData.quality ? <div>Quality: {ayush.nadiData.quality}</div> : null}
                  {ayush.nadiData.note ? <div>Pulse note: {ayush.nadiData.note}</div> : null}
                </div>
              )}

              {ayush.note && <div className="mt-2 text-sm">Note: {ayush.note}</div>}

              <div className="mt-2">
                Status: {ayush.status}
                {ayush.verifiedAt
                  ? ` — verified at ${new Date(
                      ayush.verifiedAt
                    ).toLocaleString()}`
                  : ''}
              </div>

              <div className="mt-2">
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-2 bg-sky-600 text-white rounded"
                >
                  Edit
                </button>

                <button
                  onClick={async () => {
                    const res = await fetch(
                      `/api/doctor/ayush/verify/${ayush.id}`,
                      {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ status: 'VERIFIED' }),
                      }
                    )
                    const body = await res.json().catch(() => null)

                    if (!res.ok) {
                      alert(
                        verificationFailureMessage((body as any)?.error)
                      )
                      return
                    }

                    alert(
                      verificationSuccessMessage('AYUSH', 'VERIFIED')
                    )
                  }}
                  className="ml-2 px-3 py-2 bg-green-600 text-white rounded"
                >
                  Mark Verified
                </button>
              </div>
            </div>
          )}

          {(!ayush || editing) && (
            <div className="space-y-2">
              <label>
                Prakriti
                <input
                  className="w-full border p-1"
                  value={form.prakriti || ''}
                  onChange={(e) =>
                    setForm({ ...form, prakriti: e.target.value })
                  }
                />
              </label>

              <label>
                Vikriti
                <input
                  className="w-full border p-1"
                  value={form.vikriti || ''}
                  onChange={(e) =>
                    setForm({ ...form, vikriti: e.target.value })
                  }
                />
              </label>

              <label>
                Sara
                <input
                  className="w-full border p-1"
                  value={form.sara || ''}
                  onChange={(e) =>
                    setForm({ ...form, sara: e.target.value })
                  }
                />
              </label>

              <label>
                Samhanana
                <input
                  className="w-full border p-1"
                  value={form.samhanna || ''}
                  onChange={(e) =>
                    setForm({ ...form, samhanna: e.target.value })
                  }
                />
              </label>

              <label>
                Pramana
                <input
                  className="w-full border p-1"
                  value={form.pramana || ''}
                  onChange={(e) =>
                    setForm({ ...form, pramana: e.target.value })
                  }
                />
              </label>

              <label>
                Satmya
                <input
                  className="w-full border p-1"
                  value={form.satmya || ''}
                  onChange={(e) =>
                    setForm({ ...form, satmya: e.target.value })
                  }
                />
              </label>

              <label>
                Sattva
                <input
                  className="w-full border p-1"
                  value={form.sattva || ''}
                  onChange={(e) =>
                    setForm({ ...form, sattva: e.target.value })
                  }
                />
              </label>

              <label>
                Ahara Shakti
                <input
                  className="w-full border p-1"
                  value={form.aharaShakti || ''}
                  onChange={(e) =>
                    setForm({ ...form, aharaShakti: e.target.value })
                  }
                />
              </label>

              <label>
                Vyayama Shakti
                <input
                  className="w-full border p-1"
                  value={form.vyayamaShakti || ''}
                  onChange={(e) =>
                    setForm({ ...form, vyayamaShakti: e.target.value })
                  }
                />
              </label>

              <label>
                Vaya
                <input
                  className="w-full border p-1"
                  value={form.vaya || ''}
                  onChange={(e) =>
                    setForm({ ...form, vaya: e.target.value })
                  }
                />
              </label>

              <label>
                Ahara-Vihara
                <input
                  className="w-full border p-1"
                  value={form.aharaVihara || ''}
                  onChange={(e) =>
                    setForm({ ...form, aharaVihara: e.target.value })
                  }
                />
              </label>

              <label>
                Sleep (history)
                <input
                  className="w-full border p-1"
                  value={form.sleep || ''}
                  onChange={(e) =>
                    setForm({ ...form, sleep: e.target.value })
                  }
                />
              </label>

              <label>
                Agni
                <input
                  className="w-full border p-1"
                  value={form.agni || ''}
                  onChange={(e) =>
                    setForm({ ...form, agni: e.target.value })
                  }
                />
              </label>

              <label>
                Koshtha
                <input
                  className="w-full border p-1"
                  value={form.koshtha || ''}
                  onChange={(e) =>
                    setForm({ ...form, koshtha: e.target.value })
                  }
                />
              </label>

              <div className="font-medium text-sm text-slate-700 border-b pt-2">
                Nadi (pulse) — doctor-side examination
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label>
                  Pulse rate (bpm)
                  <input
                    type="number"
                    min={0}
                    max={300}
                    className="w-full border p-1"
                    value={
                      form.nadiData?.rateBpm === undefined ||
                      form.nadiData?.rateBpm === null
                        ? ''
                        : String(form.nadiData.rateBpm)
                    }
                    onChange={(e) => setNadi('rateBpm', e.target.value)}
                  />
                </label>
                <label>
                  Rhythm
                  <input
                    className="w-full border p-1"
                    value={form.nadiData?.rhythm || ''}
                    onChange={(e) => setNadi('rhythm', e.target.value)}
                  />
                </label>
                <label>
                  Gati
                  <input
                    className="w-full border p-1"
                    value={form.nadiData?.gati || ''}
                    onChange={(e) => setNadi('gati', e.target.value)}
                  />
                </label>
                <label>
                  Quality
                  <input
                    className="w-full border p-1"
                    value={form.nadiData?.quality || ''}
                    onChange={(e) => setNadi('quality', e.target.value)}
                  />
                </label>
              </div>
              <label>
                Pulse note
                <textarea
                  className="w-full border p-1"
                  value={form.nadiData?.note || ''}
                  onChange={(e) => setNadi('note', e.target.value)}
                />
              </label>

              <label>
                Nadi (free text)
                <input
                  className="w-full border p-1"
                  value={form.nadi || ''}
                  onChange={(e) =>
                    setForm({ ...form, nadi: e.target.value })
                  }
                />
              </label>

              <label>
                Note
                <textarea
                  className="w-full border p-1"
                  value={form.note || ''}
                  onChange={(e) =>
                    setForm({ ...form, note: e.target.value })
                  }
                />
              </label>

              <div>
                <button
                  onClick={async () => {
                    await fetch(`/api/doctor/ayush/${id}`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        ...form,
                        nadiData: cleanedNadiData(),
                      }),
                    })
                      .then((r) => r.json())
                      .then((d) => {
                        setAyush(d.ayush)
                        setForm(d.ayush || {})
                        setDoshaAssessment(d.doshaAssessment || null)
                        setSuggestions(d.suggestions || [])
                        setEditing(false)
                      })
                  }}
                  className="px-3 py-2 bg-sky-600 text-white rounded"
                >
                  Save AYUSH
                </button>

                <button
                  onClick={() => {
                    setEditing(false)
                    setForm(ayush || {})
                  }}
                  className="ml-2 px-3 py-2 border rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Doshic decision support */}
      <section className="mb-4">
          <h2 className="font-semibold text-lg border-b pb-1 mb-2">
            Doshic assessment
          </h2>
          <div className="bg-white p-4 border rounded shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Suggested — requires doctor review
              </span>
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Decision support
              </span>
            </div>
            <p className="text-sm text-slate-700 mb-3">
              {doshaAssessment?.result?.conclusion ||
                'No doctor-verified Ayurvedic assessment saved yet. Save the assessment to generate rule-based doshic decision support.'}
            </p>
            <div className="space-y-2">
              {(doshaAssessment?.result?.doshas || []).map((d: any) => (
                <div
                  key={d.dosha}
                  className={`p-2 border rounded ${
                    d.suggested
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="text-sm font-medium capitalize">
                    {d.dosha}
                    {d.suggested ? ' — suggested' : ' — no matching evidence'}
                  </div>
                  {d.evidence && d.evidence.length > 0 && (
                    <ul className="text-xs text-slate-600 mt-1 list-disc list-inside">
                      {d.evidence.map((e: any, i: number) => (
                        <li key={i}>
                          <span className="font-medium">{e.fieldLabel}</span>{' '}
                          — &ldquo;{e.matchedTerm}&rdquo; ({e.note})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Deterministic, rule-based output generated only from the
              doctor-verified assessment. It does not determine Prakriti or
              Vikriti by itself and is not a diagnosis.
            </p>
          </div>
        </section>

        {/* Decision-support formulation suggestions */}
        <section className="mb-4">
          <h2 className="font-semibold text-lg border-b pb-1 mb-2">
            Decision-support formulation suggestions
          </h2>
          <div className="bg-white p-4 border rounded shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                Demo formulary
              </span>
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Suggested — requires doctor review
              </span>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Curated demo formulary entries matched by rule from the
              doctor-verified doshic assessment. They are not medical advice
              and do not form a prescription. Each suggestion requires the
              treating doctor&apos;s review.
            </p>
            {suggestions.filter((s: any) => s.active).length === 0 ? (
              <div className="text-gray-500 italic">
                No active suggested formulations yet. Save the doctor Ayurvedic
                assessment to generate rule-based suggestions.
              </div>
            ) : (
              <div className="space-y-3">
                {suggestions
                  .filter((s: any) => s.active)
                  .map((s: any) => (
                    <div key={s.id} className="p-3 border rounded">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.formulationName}</span>
                        <span className="text-xs text-gray-500">
                          {s.category}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${(() => {
                            switch (s.status) {
                              case 'APPROVED':
                                return 'bg-green-100 text-green-800'
                              case 'REJECTED':
                                return 'bg-red-100 text-red-800'
                              default:
                                return 'bg-gray-100 text-gray-700'
                            }
                          })()}`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <div className="text-sm mt-1">
                        Matched doshas: {(s.matchedDoshas || []).join(', ')}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        {s.rationale}
                      </div>
                      {s.status !== 'SUGGESTED' && (
                        <div className="text-xs text-slate-500 mt-1">
                          Reviewed by {s.reviewedById || '—'} at{' '}
                          {s.reviewedAt
                            ? new Date(s.reviewedAt).toLocaleString()
                            : '—'}
                          {s.reviewerNote ? ` — ${s.reviewerNote}` : ''}
                        </div>
                      )}
                      {s.status === 'SUGGESTED' && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            placeholder="Review note (optional)"
                            className="border p-1 text-sm rounded w-full max-w-xs"
                            value={reviewNotes[s.id] || ''}
                            onChange={(e) =>
                              setReviewNotes((prev) => ({
                                ...prev,
                                [s.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            onClick={() => reviewSuggestion(s, 'APPROVED')}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => reviewSuggestion(s, 'REJECTED')}
                            className="px-3 py-1 bg-red-600 text-white rounded text-xs"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
    </main>
  )
}

export async function getServerSideProps(ctx: any) {
  const session = await getSession(ctx)

  if (!session) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  const role = (session as any).user?.role

  if (role !== 'DOCTOR') {
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false,
      },
    }
  }

  return {
    props: {},
  }
}