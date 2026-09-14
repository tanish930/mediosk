import { useEffect, useState } from 'react'
import { getSession } from 'next-auth/react'

export default function DocumentsPage(){
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState('')

  async function loadDocs(){
    try {
      const r = await fetch('/api/patient/documents')
      const d = await r.json()
      setDocs(d.documents || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ loadDocs() },[])

  async function upload(){
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', title)
    fd.append('category', category)
    fd.append('documentDate', date)
    const res = await fetch('/api/patient/documents',{method:'POST',body:fd})
    await res.json()
    await loadDocs()
  }

  async function remove(id:string){
    if (!confirm('Delete document?')) return
    const r = await fetch(`/api/patient/documents/${id}`,{method:'DELETE'})
    if (r.ok) setDocs(prev=>prev.filter(d=>d.id!==id))
  }

  async function retry(id:string){
    await fetch(`/api/patient/documents/${id}/retry`,{method:'POST'})
    await loadDocs()
  }

  function statusLabel(d:any): string {
    const s = d.processing?.status
    if (s === 'PENDING') return 'PENDING'
    if (s === 'PROCESSING') return 'PROCESSING'
    if (s === 'COMPLETED') return 'COMPLETED'
    if (s === 'FAILED') return 'FAILED'
    return 'UNPROCESSED'
  }

  if (loading) return <div className="container py-20">Loading...</div>

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold mb-4">Your Documents</h1>

      <div className="max-w-md border rounded p-4 mb-6">
        <div className="mb-2">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg" onChange={e=>setFile(e.target.files?.[0]||null)} />
        </div>
        <div className="mb-2"><input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} className="w-full border p-2 rounded" /></div>
        <div className="mb-2"><input placeholder="Category" value={category} onChange={e=>setCategory(e.target.value)} className="w-full border p-2 rounded" /></div>
        <div className="mb-2"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border p-2 rounded" /></div>
        <div><button onClick={upload} className="px-3 py-2 bg-sky-600 text-white rounded">Upload</button></div>
      </div>

      {docs.length === 0 && <div className="text-slate-500 mb-4">No documents uploaded yet.</div>}

      <div className="space-y-3">
        {docs.map(d=> (
          <div key={d.id} className="border rounded p-3">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium">{d.title}</div>
                <div className="text-sm text-slate-600">{d.category ? `${d.category} • ` : ''}Uploaded {d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : ''} {d.documentDate ? `• Document date ${new Date(d.documentDate).toLocaleDateString()}` : ''}</div>
              </div>
              <div className="space-x-2">
                <a href={`/api/patient/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="text-sky-600">View</a>
                <button onClick={()=>remove(d.id)} className="text-red-600">Delete</button>
              </div>
            </div>
            <div className="mt-2 flex items-center space-x-3 text-sm">
              <span className={d.processing?.status === 'FAILED' ? 'text-red-600' : d.processing?.status === 'COMPLETED' ? 'text-emerald-600' : 'text-slate-500'}>
                Processing: {statusLabel(d)}
              </span>
              {d.processing?.status === 'FAILED' && <button onClick={()=>retry(d.id)} className="px-2 py-1 border rounded">Retry</button>}
            </div>
            {d.processing?.status === 'FAILED' && d.processing?.error && <div className="text-sm text-red-600 mt-1">{d.processing.error}</div>}
          </div>
        ))}
      </div>
    </main>
  )
}

export async function getServerSideProps(ctx:any){
  const session = await getSession(ctx)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  const role = (session as any).user?.role
  if (role !== 'PATIENT') return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}
