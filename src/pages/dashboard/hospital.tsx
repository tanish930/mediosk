import { GetServerSideProps } from 'next'
import { requireRole } from '../../lib/auth'

export default function HospitalDashboard() {
  const [tab, setTab] = useState<'profile'|'doctors'|'queue'|'emergency'>('profile')
  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold mb-4">Hospital Dashboard</h1>
      <div className="mb-4">
        <button onClick={()=>setTab('profile')} className={`px-3 py-2 rounded mr-2 ${tab==='profile'?'bg-sky-600 text-white':'border'}`}>Profile</button>
        <button onClick={()=>setTab('doctors')} className={`px-3 py-2 rounded mr-2 ${tab==='doctors'?'bg-sky-600 text-white':'border'}`}>Doctors</button>
        <button onClick={()=>setTab('queue')} className={`px-3 py-2 rounded mr-2 ${tab==='queue'?'bg-sky-600 text-white':'border'}`}>Patient Queue</button>
        <button onClick={()=>setTab('emergency')} className={`px-3 py-2 rounded ${tab==='emergency'?'bg-sky-600 text-white':'border'}`}>Emergency Alerts</button>
      </div>
      <div>
        {tab==='profile' && <HospitalProfile />}
        {tab==='doctors' && <HospitalDoctors />}
        {tab==='queue' && <HospitalQueue />}
        {tab==='emergency' && <HospitalEmergencyEmbed />}
      </div>
    </main>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  return requireRole(ctx, 'HOSPITAL')
}

import { useEffect, useState } from 'react'
import { getSession } from 'next-auth/react'

function HospitalProfile(){
  const [profile,setProfile] = useState<any>(null)
  const [editing,setEditing] = useState(false)
  const [address,setAddress] = useState('')

  useEffect(()=>{ fetch('/api/hospital/profile').then(r=>r.json()).then(d=>{ setProfile(d.hospital); setAddress(d.hospital.address||'') }) },[])

  async function save(){
    await fetch('/api/hospital/profile',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({ address })})
    const j = await fetch('/api/hospital/profile').then(r=>r.json())
    setProfile(j.hospital); setEditing(false)
  }

  if (!profile) return <div>Loading...</div>
  return (
    <div className="max-w-2xl">
      <h2 className="font-semibold mb-2">Profile</h2>
      <div>Name: {profile.user?.name || profile.user?.email}</div>
      {!editing ? <div>Address: {profile.address || '—' } <button onClick={()=>setEditing(true)} className="ml-2 px-2 py-1 border rounded">Edit</button></div> : (
        <div>
          <textarea className="w-full border p-2" value={address} onChange={e=>setAddress(e.target.value)} />
          <div className="mt-2"><button onClick={save} className="px-3 py-2 bg-sky-600 text-white rounded">Save</button><button onClick={()=>setEditing(false)} className="ml-2 px-3 py-2 border rounded">Cancel</button></div>
        </div>
      )}
    </div>
  )
}

function HospitalDoctors(){
  const [links,setLinks] = useState<any[]>([])
  const [doctorId,setDoctorId] = useState('')
  useEffect(()=>{ load() },[])
  async function load(){ const r = await fetch('/api/hospital/doctors'); const j=await r.json(); setLinks(j.doctors||[]) }
  async function add(){ await fetch('/api/hospital/doctors',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ doctorId })}); setDoctorId(''); await load() }
  return (
    <div>
      <h2 className="font-semibold mb-2">Doctors</h2>
      <div className="mb-3">
        <input className="border p-2 mr-2" placeholder="Doctor ID" value={doctorId} onChange={e=>setDoctorId(e.target.value)} />
        <button onClick={add} className="px-3 py-2 bg-sky-600 text-white rounded">Add Doctor</button>
      </div>
      <div className="space-y-2">
        {links.map(l=> (
          <div key={l.id} className="p-3 border rounded">
            <div>{l.doctor.user?.name || l.doctor.user?.email} — {l.status}</div>
            <div className="text-sm">Verifications: {l.doctor.verifications?.length||0}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HospitalQueue(){
  const [consultations,setConsultations] = useState<any[]>([])
  const [doctors,setDoctors] = useState<any[]>([])
  useEffect(()=>{ load(); loadDoctors() },[])
  async function load(){ const r=await fetch('/api/hospital/queue'); const j=await r.json(); setConsultations(j.consultations||[]) }
  async function loadDoctors(){ const r=await fetch('/api/hospital/doctors'); const j=await r.json(); setDoctors(j.doctors||[]) }
  async function assign(consult:any, doctorId:string){ await fetch('/api/consultations/assign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ consultationId: consult.id, doctorId })}); await load() }
  return (
    <div>
      <h2 className="font-semibold mb-2">Patient / Consultation Queue</h2>
      <div className="space-y-3">
        {consultations.map(c=> (
          <div key={c.id} className="p-3 border rounded">
            <div className="font-semibold">{c.status} — {c.patient?.user?.name || c.patient?.user?.email}</div>
            <div className="text-sm">Complaint: {c.session?.report?.chiefComplaint || c.session?.complaint}</div>
            {c.status === 'REQUESTED' && <div className="mt-2">
              <select id={`assign-${c.id}`} className="border p-1 mr-2">
                <option value="">Assign to...</option>
                {doctors.map(d=> <option key={d.id} value={d.doctor.id}>{d.doctor.user?.name || d.doctor.user?.email}</option>)}
              </select>
              <button onClick={async()=>{ const sel:any = document.getElementById(`assign-${c.id}`) as HTMLSelectElement; if(sel.value) await assign(c, sel.value) }} className="px-3 py-2 bg-sky-600 text-white rounded">Assign</button>
            </div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function HospitalEmergencyEmbed(){
  return (<div><iframe src="/dashboard/hospital/emergency" className="w-full h-96 border-0" title="Emergency" /></div>)
}
