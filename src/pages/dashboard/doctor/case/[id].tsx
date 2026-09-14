import { useRouter } from 'next/router'
import { getSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import {
  verificationFailureMessage,
  verificationSuccessMessage,
} from '../../../../lib/verificationFeedback'

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

export default function CaseSheet() {
  const router = useRouter()
  const { id } = router.query

  const [data, setData] = useState<any>(null)
  const [ayush, setAyush] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})

  useEffect(() => {
    if (id) {
      fetch(`/api/doctor/case/${id}`)
        .then((r) => r.json())
        .then((d) => setData(d))
    }
  }, [id])

  useEffect(() => {
    if (id) {
      fetch(`/api/doctor/ayush/${id}`)
        .then((r) => r.json())
        .then((d) => {
          setAyush(d.ayush)
          setForm(d.ayush || {})
        })
    }
  }, [id])

  const caseData = data?.consultation

  const verifyingRef = useRef<Set<string>>(new Set())

  async function verify(
    targetType: string,
    targetId: string,
    status: string
  ) {
    const key = `${targetType}:${targetId}:${status}`
    if (verifyingRef.current.has(key)) return
    verifyingRef.current.add(key)

    try {
      const res = await fetch(`/api/doctor/case/${id}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, status }),
      })
      const body = await res.json().catch(() => null)

      if (!res.ok) {
        alert(verificationFailureMessage((body as any)?.error))
        return
      }

      alert(verificationSuccessMessage(targetType, status))
    } catch (err) {
      alert(verificationFailureMessage(null))
    } finally {
      verifyingRef.current.delete(key)
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
        <h2 className="font-semibold text-lg border-b pb-1 mb-2">
          Pre-Consultation / Symptom Report
        </h2>

        <div className="bg-white p-4 border rounded shadow-sm">
          <div className="font-medium text-sky-800 mb-2">
            Primary Complaint: {session?.complaint}
          </div>

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
                <button
                  onClick={() =>
                    verify(
                      'PRECONSULTATION_REPORT',
                      session.report.id,
                      'REVIEWED'
                    )
                  }
                  className="px-3 py-1 bg-yellow-500 text-white rounded text-xs"
                >
                  Mark Reviewed
                </button>

                <button
                  onClick={() =>
                    verify(
                      'PRECONSULTATION_REPORT',
                      session.report.id,
                      'VERIFIED'
                    )
                  }
                  className="ml-2 px-3 py-1 bg-green-600 text-white rounded text-xs"
                >
                  Mark Verified
                </button>
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

              <button
                onClick={() =>
                  verify('MEDICAL_SUMMARY', s.id, 'REVIEWED')
                }
                className="mt-2 px-3 py-2 bg-yellow-500 text-white rounded"
              >
                Mark Reviewed
              </button>
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
              <div className="font-semibold">
                {t.title} — {t.entryType}
              </div>

              <div className="text-sm">{t.details}</div>
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

              <pre className="bg-gray-50 p-2 rounded mt-1">
                {JSON.stringify(d.extractions || [], null, 2)}
              </pre>

              <button
                onClick={() =>
                  verify('DOCUMENT', d.id, 'REVIEWED')
                }
                className="mt-2 px-3 py-2 bg-yellow-500 text-white rounded"
              >
                Mark Document Reviewed
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* AYUSH Assessment */}
      <section className="mb-4">
        <h2 className="font-semibold">AYUSH Assessment</h2>

        <div className="p-3 border rounded">
          {ayush && !editing && (
            <div>
              <div>Prakriti: {ayush.prakriti}</div>
              <div>Vikriti: {ayush.vikriti}</div>
              <div>Sara: {ayush.sara}</div>
              <div>Samhanana: {ayush.samhanna}</div>
              <div>Pramana: {ayush.pramana}</div>
              <div>Satmya: {ayush.satmya}</div>
              <div>Sattva: {ayush.sattva}</div>
              <div>Ahara Shakti: {ayush.aharaShakti}</div>
              <div>Vyayama Shakti: {ayush.vyayamaShakti}</div>
              <div>Vaya: {ayush.vaya}</div>
              <div>Ahara-Vihara: {ayush.aharaVihara}</div>
              <div>Agni: {ayush.agni}</div>
              <div>Nadi: {ayush.nadi}</div>
              <div>Note: {ayush.note}</div>

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
                Nadi
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
                      body: JSON.stringify(form),
                    })
                      .then((r) => r.json())
                      .then((d) => {
                        setAyush(d.ayush)
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