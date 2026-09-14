import { useEffect, useState } from 'react'
import { getSession } from 'next-auth/react'
import Link from 'next/link'
import { normalizeSummariesPayload, mergeCreatedSummary, SummaryLike } from '../../../lib/summaries'

function statusLabel(status: string | undefined): string {
  switch (status) {
    case 'PENDING': return 'Processing...'
    case 'PROCESSING': return 'Processing...'
    case 'COMPLETED': return 'Ready for doctor review'
    case 'FAILED': return 'Failed'
    default: return status || 'Processing...'
  }
}

function statusStyle(status: string | undefined): string {
  switch (status) {
    case 'PENDING':
    case 'PROCESSING': return 'text-amber-600 bg-amber-50'
    case 'COMPLETED': return 'text-green-600 bg-green-50'
    case 'FAILED': return 'text-red-600 bg-red-50'
    default: return 'text-slate-500 bg-slate-50'
  }
}

export default function SummaryPage() {
  const [items, setItems] = useState<SummaryLike[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<any>(null)

  function loadSummaries() {
    fetch('/api/patient/summary')
      .then(r => r.json().catch(() => null))
      .then((d: unknown) => {
        setItems(normalizeSummariesPayload(d))
        setError(null)
      })
      .catch(() => {
        setError("We couldn't load your summaries. Please try again.")
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSummaries()
    fetch('/api/patient/preconsult/status')
      .then(r => r.json())
      .then(d => {
        if (d && d.session && d.session.hasReport) setReport(d.session)
      })
      .catch(() => { /* report banner is optional */ })
  }, [])

  async function create() {
    setCreating(true)
    try {
      const res = await fetch('/api/patient/summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceRefs: { documents: [] } }),
      })
      const data = (await res.json().catch(() => null)) as null | { summary?: unknown }
      const created = data && data.summary
      setItems(prev => mergeCreatedSummary(Array.isArray(prev) ? prev : [], created))
      setError(created ? null : "We couldn't create your summary right now. Please try again.")
    } catch {
      setError("We couldn't create your summary right now. Please try again.")
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="container py-20 text-center text-slate-500" role="status" aria-label="Loading">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-300 border-t-sky-600 mb-3" />
        <p>Loading your summaries...</p>
      </div>
    )
  }

  return (
    <main className="container py-8 max-w-3xl" role="main" aria-label="Health summaries">
      <h1 className="text-2xl font-semibold text-slate-900 mb-2">Medical History Summaries</h1>
      <p className="text-slate-600 mb-6">
        Summaries are prepared from your pre-consultation answers and uploaded documents.
        They are AI-generated and reviewed by a doctor.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={create}
          disabled={creating}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300"
          aria-label="Create a new health summary"
        >
          {creating ? 'Creating...' : 'Create Summary'}
        </button>
        <Link
          href="/dashboard/patient/preconsultation"
          className="text-sky-600 hover:text-sky-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-300 rounded"
        >
          Continue Pre-Consultation &rarr;
        </Link>
      </div>

      {report && (
        <div className="mb-6 p-5 bg-green-50 border border-green-200 rounded-xl" role="status">
          <h2 className="font-semibold text-green-800">Pre-Consultation Report Available</h2>
          <p className="text-sm text-green-700 mt-1">
            Created {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ''} — your doctor will review this summary.
          </p>
          <Link
            href="/dashboard/patient/preconsultation"
            className="inline-block mt-2 text-green-700 hover:text-green-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-green-300 rounded"
          >
            Review & Submit &rarr;
          </Link>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mb-6" role="alert">
          {error}
          <button onClick={() => { setError(null); setLoading(true); loadSummaries() }} className="ml-2 underline font-medium" aria-label="Retry loading summaries">
            Try again
          </button>
        </div>
      )}

      {items.length === 0 && (
        <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl text-center">
          <h2 className="text-lg font-semibold text-slate-700 mb-1">No health summaries yet.</h2>
          <p className="text-slate-500">
            Complete a pre-consultation to create your first health summary.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {items.map(s => (
            <div key={s.id || s.createdAt} className="border border-slate-200 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className={`inline-block text-sm font-medium px-2 py-0.5 rounded-full ${statusStyle(s.status)}`}>
                    {statusLabel(s.status)}
                  </span>
                  <div className="text-sm text-slate-500 mt-1">
                    Created: {s.createdAt ? new Date(s.createdAt).toLocaleString() : 'Unknown'}
                  </div>
                </div>
                {s.status === 'FAILED' && s.note && (
                  <span className="text-xs text-red-500">({s.note})</span>
                )}
              </div>
              <div className="mt-3">
                {(s.status === 'PENDING' || s.status === 'PROCESSING' || !s.status) && (
                  <div className="text-sm text-slate-500">Your summary is still being prepared. Check back again shortly.</div>
                )}
                {s.status === 'FAILED' && (
                  <div className="text-sm text-red-600">Summary generation failed. You can try creating it again.</div>
                )}
                {s.status === 'COMPLETED' && (
                  <div>
                    <h3 className="font-semibold mt-2">Patient-friendly</h3>
                    <div className="p-3 bg-white border rounded text-slate-800">
                      AI Generated — Patient View (Doctor verification required)
                      <pre className="whitespace-pre-wrap mt-1">{s.patientSummary || 'No summary content available.'}</pre>
                    </div>
                    <h3 className="font-semibold mt-3">Doctor-facing (structured)</h3>
                    <div className="p-3 bg-white border rounded text-slate-800">
                      AI Generated — Doctor Verification Required
                      <pre className="whitespace-pre-wrap mt-1">{JSON.stringify(s.doctorSummary ?? {}, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

export async function getServerSideProps(ctx: any) {
  const session = await getSession(ctx)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  const role = (session as any).user?.role
  if (role !== 'PATIENT') return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}