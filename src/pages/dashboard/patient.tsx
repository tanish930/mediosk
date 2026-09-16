import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { requireRole } from '../../lib/auth'
import { useEffect, useState } from 'react'
import { canJoinConsultation, consultationStatusLabel } from '../../lib/consultationStatus'

interface PreConsultStatus {
  id: string
  status: string
  complaint: string
  domain: string | null
  createdAt: string
  progress: { total: number; answered: number }
  hasReport: boolean
  documents: { id: string; title: string; processing: { status: string } | null }[]
  consultation: { id: string; status: string; scheduledAt: string | null } | null
}

interface Consultation {
  id: string
  status: string
  scheduledAt: string | null
  createdAt: string
  doctor?: { user?: { name?: string; email?: string } | null } | null
  hospital?: { user?: { name?: string; email?: string } | null; address?: string | null } | null
}

const WORKFLOW_STEPS = [
  { key: 'complaint', label: 'Describe Your Concern', description: 'Tell us what is bothering you' },
  { key: 'questions', label: 'Answer Health Questions', description: 'Answer a few simple questions' },
  { key: 'documents', label: 'Upload Documents', description: 'Share any medical papers or reports' },
  { key: 'review', label: 'Review Your Summary', description: 'We prepare a report for your doctor' },
  { key: 'consultation', label: 'Doctor Consultation', description: 'A doctor will review your information' },
]

function statusPill(status: string): string {
  switch (status) {
    case 'IN_PROGRESS': return 'text-green-700 bg-green-50'
    case 'READY':
    case 'SCHEDULED': return 'text-sky-700 bg-sky-50'
    case 'REQUESTED':
    case 'PENDING': return 'text-amber-700 bg-amber-50'
    case 'COMPLETED': return 'text-slate-600 bg-slate-100'
    case 'CANCELLED': return 'text-red-700 bg-red-50'
    default: return 'text-slate-500 bg-slate-50'
  }
}

export default function PatientDashboard() {
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [preConsult, setPreConsult] = useState<PreConsultStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/patient/consultations').then(r => r.json()),
      fetch('/api/patient/preconsult/status').then(r => r.json()),
    ]).then(([consData, preData]) => {
      setConsultations(consData.consultations || [])
      setPreConsult(preData.session || null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function cancelConsultation(consultationId: string) {
    if (!window.confirm('Cancel this consultation?')) return
    setCancellingId(consultationId)
    try {
      const res = await fetch(`/api/consultations/${consultationId}/cancel`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Could not cancel consultation')
        return
      }
      const consData = await fetch('/api/patient/consultations').then(r => r.json())
      setConsultations(consData.consultations || [])
    } catch (err) {
      alert('Could not connect to the server')
    } finally {
      setCancellingId(null)
    }
  }

  const cancellableStatuses = new Set(['PENDING', 'REQUESTED', 'READY', 'SCHEDULED'])

  // The consultation linked to the current pre-consultation session, with a fresh
  // status from the consultations list when available.
  const sessionConsultation =
    consultations.find(c => c.id === preConsult?.consultation?.id) || preConsult?.consultation || null

  const currentStep = (() => {
    if (!preConsult) return -1
    if (preConsult.consultation) return 4
    if (preConsult.hasReport) return 3
    if (preConsult.progress.total > 0 && preConsult.progress.answered >= preConsult.progress.total) return 2
    if (preConsult.progress.answered > 0) return 1
    if (preConsult.status === 'IN_PROGRESS') return 0
    return -1
  })()

  const hasUnprocessedDocs = preConsult?.documents.some(d =>
    d.processing?.status === 'PENDING' || d.processing?.status === 'PROCESSING'
  ) ?? false

  const hasFailedDocs = preConsult?.documents.some(d => d.processing?.status === 'FAILED') ?? false

  const hasActiveConsultation = consultations.some(c => c.status === 'IN_PROGRESS')
  const activeConsultationForJoin = consultations.find(c => c.status === 'IN_PROGRESS') || null

  return (
    <main className="container py-8 max-w-3xl" role="main" aria-label="Patient Dashboard">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Your Health Dashboard</h1>
        <p className="text-lg text-slate-600">
          This helps your doctor understand your health before your visit.
          Follow the steps below — it only takes a few minutes.
        </p>
      </div>

      {loading && (
        <div className="text-center py-12 text-slate-500" role="status" aria-label="Loading">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-300 border-t-sky-600 mb-3" />
          <p>Loading your information...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* Start New Consultation */}
          {!hasActiveConsultation ? (
            <div className="mb-8 p-6 rounded-2xl border-2 border-teal-200 bg-teal-50">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <span className="flex-shrink-0 w-12 h-12 rounded-xl bg-teal-600 text-white flex items-center justify-center text-2xl font-bold" aria-hidden="true">
                  {'\u002B'}
                </span>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-teal-900">Start New Consultation</h2>
                  <p className="text-sm text-teal-700 mt-0.5">
                    Begin a brand-new doctor visit. Your previous consultations stay safe and unchanged.
                  </p>
                </div>
                <Link
                  href="/dashboard/patient/preconsultation?new=1"
                  role="button"
                  aria-label="Start New Consultation"
                  className="flex-shrink-0 inline-block text-center bg-teal-600 hover:bg-teal-700 text-white text-lg font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all focus:outline-none focus:ring-4 focus:ring-teal-300"
                >
                  Start New Consultation
                </Link>
              </div>
            </div>
          ) : (
            <div className="mb-8 p-5 rounded-2xl border-2 border-amber-200 bg-amber-50" role="status" aria-label="Consultation in progress">
              <div className="flex items-center gap-3">
                <span className="inline-block animate-pulse w-3 h-3 rounded-full bg-amber-500" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-amber-900">A consultation is currently in progress</h2>
                  <p className="text-sm text-amber-800 mt-0.5">
                    Finish or leave your current consultation before starting a new one.{activeConsultationForJoin && (
                      <Link
                        href={`/dashboard/consultation/${activeConsultationForJoin.id}`}
                        className="inline-block ml-1 font-semibold text-amber-900 underline"
                      >
                        Join Consultation &rarr;
                      </Link>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Workflow Steps */}
          <div className="mb-8" aria-label="Pre-consultation progress">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              {preConsult && !preConsult.consultation ? 'Continue Pre-Consultation' : 'Your Journey'}
            </h2>
            <div className="space-y-3">
              {WORKFLOW_STEPS.map((step, i) => {
                const isCompleted = i < currentStep
                const isCurrent = i === currentStep
                const isFuture = i > currentStep

                return (
                  <div
                    key={step.key}
                    className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                      isCompleted
                        ? 'border-green-200 bg-green-50'
                        : isCurrent
                          ? 'border-sky-200 bg-sky-50 shadow-sm'
                          : 'border-slate-100 bg-white opacity-60'
                    }`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                        isCompleted
                          ? 'bg-green-500 text-white'
                          : isCurrent
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-200 text-slate-400'
                      }`}
                      aria-hidden="true"
                    >
                      {isCompleted ? '\u2713' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-base ${isFuture ? 'text-slate-400' : 'text-slate-800'}`}>
                        {step.label}
                      </div>
                      <div className={`text-sm mt-0.5 ${isFuture ? 'text-slate-300' : 'text-slate-500'}`}>
                        {step.description}
                      </div>
                      {isCurrent && preConsult && (
                        <div className="mt-2">
                          {step.key === 'questions' && preConsult.progress.total > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-200 rounded-full h-2.5 overflow-hidden" role="progressbar" aria-valuenow={preConsult.progress.answered} aria-valuemin={0} aria-valuemax={preConsult.progress.total} aria-label={`Question ${preConsult.progress.answered} of ${preConsult.progress.total}`}>
                                <div className="bg-sky-500 h-full rounded-full transition-all" style={{ width: `${(preConsult.progress.answered / preConsult.progress.total) * 100}%` }} />
                              </div>
                              <span className="text-sm font-medium text-sky-700">{preConsult.progress.answered}/{preConsult.progress.total}</span>
                            </div>
                          )}
                          {step.key === 'documents' && (
                            <span className="text-sm text-sky-600">Upload your medical documents below.</span>
                          )}
                        </div>
                      )}
                    </div>
                    {isCurrent && step.key === 'complaint' && (
                      <Link
                        href="/dashboard/patient/preconsultation"
                        className="flex-shrink-0 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-sky-300"
                      >
                        Continue
                      </Link>
                    )}
                    {isCurrent && step.key === 'consultation' && (
                      sessionConsultation && canJoinConsultation(sessionConsultation.status) ? (
                        <Link
                          href={`/dashboard/consultation/${sessionConsultation.id}`}
                          className="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
                        >
                          Join Consultation
                        </Link>
                      ) : (
                        <span className="flex-shrink-0 text-sm font-medium text-slate-600 bg-white border border-slate-200 py-2 px-3 rounded-lg">
                          {sessionConsultation ? consultationStatusLabel(sessionConsultation.status) : 'Consultation requested'}
                        </span>
                      )
                    )}
                    {isCurrent && step.key !== 'complaint' && step.key !== 'consultation' && (
                      <Link
                        href="/dashboard/patient/preconsultation"
                        className="flex-shrink-0 text-sky-600 hover:text-sky-800 font-medium text-sm py-2 px-3 rounded-lg hover:bg-sky-50 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-300"
                      >
                        Continue
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pre-consultation Status Summary */}
          {preConsult && !preConsult.consultation && (
            <div className="mb-6 p-5 bg-slate-50 border border-slate-200 rounded-xl">
              <h3 className="font-semibold text-slate-800 mb-2">Pre-Consultation Status</h3>
              {preConsult.hasReport && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500" aria-hidden="true" />
                  <span className="text-green-700 font-medium">Report ready for your doctor</span>
                </div>
              )}
              {!preConsult.hasReport && preConsult.progress.total > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-sky-500" aria-hidden="true" />
                  <span className="text-sky-700 font-medium">
                    Questions answered: {preConsult.progress.answered} of {preConsult.progress.total}
                  </span>
                </div>
              )}
              {hasUnprocessedDocs && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-amber-500" aria-hidden="true" />
                  <span className="text-amber-700">Document is still being processed</span>
                </div>
              )}
              {hasFailedDocs && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500" aria-hidden="true" />
                  <span className="text-red-700">Some documents could not be processed. You can retry them from My Documents.</span>
                </div>
              )}
              {preConsult.documents.length > 0 && !hasUnprocessedDocs && !hasFailedDocs && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500" aria-hidden="true" />
                  <span className="text-green-700">{preConsult.documents.length} document(s) uploaded</span>
                </div>
              )}
              <Link
                href="/dashboard/patient/preconsultation"
                className="inline-block mt-2 text-sky-600 hover:text-sky-800 font-medium focus:outline-none focus:ring-2 focus:ring-sky-300 rounded"
              >
                Continue Pre-Consultation &rarr;
              </Link>
            </div>
          )}

          {/* Consultations */}
          {consultations.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">Your Consultations</h2>
              <div className="space-y-3">
                {consultations.map(c => {
                  const joinable = canJoinConsultation(c.status)
                  const active = joinable && c.id === sessionConsultation?.id
                  return (
                    <div
                      key={c.id}
                      className={`p-4 rounded-xl border-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                        active ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {active && (
                            <span className="inline-block text-xs font-semibold uppercase tracking-wide text-green-700 bg-green-100 px-2 py-0.5 rounded-full" aria-hidden="true">
                              Active
                            </span>
                          )}
                          <span className="font-semibold text-slate-800">
                            {c.doctor ? `Dr. ${c.doctor.user?.name || c.doctor.user?.email}` : 'Consultation Request'}
                          </span>
                        </div>
                        {c.hospital?.user?.name && (
                          <div className="text-sm text-slate-500 mt-0.5">{c.hospital.user.name}</div>
                        )}
                        <div className="text-sm text-slate-500 mt-0.5">
                          {c.scheduledAt
                            ? new Date(c.scheduledAt).toLocaleString()
                            : c.createdAt
                              ? `Requested ${new Date(c.createdAt).toLocaleDateString()}`
                              : 'Waiting for assignment'}
                        </div>
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${statusPill(c.status)}`}>
                          {consultationStatusLabel(c.status)}
                        </span>
                      </div>
                      {joinable && (
                        <Link
                          href={`/dashboard/consultation/${c.id}`}
                          className="flex-shrink-0 inline-block bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-5 rounded-lg transition-colors text-center focus:outline-none focus:ring-2 focus:ring-sky-300"
                        >
                          Join Consultation
                        </Link>
                      )}
                      {cancellableStatuses.has(c.status) && (
                        <button
                          type="button"
                          onClick={() => cancelConsultation(c.id)}
                          disabled={cancellingId === c.id}
                          className="flex-shrink-0 inline-block bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-5 rounded-lg transition-colors text-center focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
                        >
                          {cancellingId === c.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* No state at all */}
          {!preConsult && consultations.length === 0 && !loading && (
            <div className="text-center py-8 text-slate-500">
              <p className="text-lg">No consultations yet. Start by telling us about your health concern.</p>
            </div>
          )}

          {/* Quick links */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Links</h2>
            <div className="flex flex-wrap gap-3">
                <Link href="/dashboard/patient/documents" className="text-sky-600 hover:text-sky-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 rounded">
                  My Documents
                </Link>
                <Link href="/dashboard/patient/timeline" className="text-sky-600 hover:text-sky-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 rounded">
                  Medical Timeline
                </Link>
                <Link href="/dashboard/patient/summary" className="text-sky-600 hover:text-sky-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 rounded">
                  Health Summaries
                </Link>
                <Link href="/dashboard/patient/profile" className="text-sky-600 hover:text-sky-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 rounded">
                  My Profile
                </Link>
              </div>
          </div>
        </>
      )}
    </main>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  return requireRole(ctx, 'PATIENT')
}