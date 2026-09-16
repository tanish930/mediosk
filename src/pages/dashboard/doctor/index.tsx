import Link from 'next/link'
import { getSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import AccountNav from '../../../components/AccountNav'

export default function DoctorDashboard() {
  const [consultations, setConsultations] = useState<any[]>([])
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  async function loadQueue() {
    try {
      const res = await fetch('/api/doctor/queue')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Could not load doctor queue')
        return
      }

      setConsultations(data.consultations || [])
    } catch (err) {
      console.error(err)
      setError('Could not connect to the server')
    }
  }

  useEffect(() => {
    loadQueue()
  }, [])

  async function assignToMe(consultationId: string) {
    setAssigningId(consultationId)
    setError('')

    try {
      const res = await fetch('/api/consultations/assign', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          consultationId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Could not assign consultation')
        return
      }

      await loadQueue()
    } catch (err) {
      console.error(err)
      setError('Could not connect to the server')
    } finally {
      setAssigningId(null)
    }
  }

  async function scheduleConsultation(consultationId: string) {
    const scheduledAt = scheduleDrafts[consultationId]
    if (!scheduledAt) return
    setSchedulingId(consultationId)
    setError('')

    try {
      const res = await fetch(`/api/consultations/${consultationId}/schedule`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ scheduledAt: new Date(scheduledAt).toISOString() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Could not schedule consultation')
        return
      }

      setScheduleDrafts((prev) => ({ ...prev, [consultationId]: '' }))
      await loadQueue()
    } catch (err) {
      console.error(err)
      setError('Could not connect to the server')
    } finally {
      setSchedulingId(null)
    }
  }

  async function cancelConsultation(consultationId: string) {
    if (!window.confirm('Cancel this consultation?')) return
    setCancellingId(consultationId)
    setError('')

    try {
      const res = await fetch(`/api/consultations/${consultationId}/cancel`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Could not cancel consultation')
        return
      }

      await loadQueue()
    } catch (err) {
      console.error(err)
      setError('Could not connect to the server')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <>
      <AccountNav profileHref="/dashboard/doctor/profile" dashboardHref="/dashboard/doctor" />
      <main className="container py-8">
      <h1 className="text-2xl font-semibold mb-4">
        Todays Consultations
      </h1>

      {error && (
        <div className="mb-4 p-3 border border-red-300 bg-red-50 text-red-700 rounded">
          {error}
        </div>
      )}

      {consultations.length === 0 ? (
        <div className="p-4 border rounded">
          No consultations in the queue.
        </div>
      ) : (
        <div className="space-y-3">
          {consultations.map((c: any) => {
            const isRequested = c.status === 'REQUESTED' && !c.doctorId
            const isAssignedToDoctor = Boolean(c.doctorId)

            return (
              <div
                key={c.id}
                className="p-4 border rounded flex justify-between items-center gap-4"
              >
                <div>
                  <div className="font-semibold">
                    {c.patient?.user?.name || c.patient?.user?.email || 'Patient'}
                  </div>

                  <div className="text-sm text-gray-600">
                    {c.session?.complaint || 'No pre-consult complaint'}
                  </div>

                  <div className="text-sm mt-1">
                    Status:{' '}
                    <span className="font-medium">
                      {c.status}
                    </span>
                  </div>

                  {c.doctor?.user && (
                    <div className="text-sm text-gray-600">
                      Doctor:{' '}
                      {c.doctor.user.name || c.doctor.user.email}
                    </div>
                  )}

                  {c.scheduledAt && (
                    <div className="text-sm text-gray-600">
                      Scheduled:{' '}
                      {new Date(c.scheduledAt).toLocaleString()}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {c.doctorId && (c.status === 'READY' || c.status === 'SCHEDULED') && (
                    <div className="flex items-center gap-2">
                      <input
                        type="datetime-local"
                        aria-label="Schedule date and time"
                        value={scheduleDrafts[c.id] || ''}
                        onChange={(e) =>
                          setScheduleDrafts((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        className="border p-2 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => scheduleConsultation(c.id)}
                        disabled={schedulingId === c.id || !scheduleDrafts[c.id]}
                        className="px-3 py-2 bg-sky-600 text-white rounded disabled:opacity-50"
                      >
                        {schedulingId === c.id ? 'Scheduling...' : 'Schedule'}
                      </button>
                    </div>
                  )}

                  {isRequested && (
                    <button
                      type="button"
                      onClick={() => assignToMe(c.id)}
                      disabled={assigningId === c.id}
                      className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                    >
                      {assigningId === c.id
                        ? 'Assigning...'
                        : 'Assign to me'}
                    </button>
                  )}

                  {isAssignedToDoctor && (
                    <Link
                      href={`/dashboard/doctor/case/${c.id}`}
                      className="px-3 py-2 bg-sky-600 text-white rounded"
                    >
                      Open Case
                    </Link>
                  )}

                  {(c.status === 'SCHEDULED' ||
                    c.status === 'IN_PROGRESS' ||
                    c.status === 'READY') && (
                    <Link
                      href={`/dashboard/consultation/${c.id}`}
                      className="px-3 py-2 border rounded"
                    >
                      Join Consultation
                    </Link>
                  )}

                  {c.doctorId &&
                    (c.status === 'REQUESTED' ||
                      c.status === 'READY' ||
                      c.status === 'SCHEDULED') && (
                      <button
                        type="button"
                        onClick={() => cancelConsultation(c.id)}
                        disabled={cancellingId === c.id}
                        className="px-3 py-2 bg-red-600 text-white rounded disabled:opacity-50"
                      >
                        {cancellingId === c.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      </main>
    </>
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