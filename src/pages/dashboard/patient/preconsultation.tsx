import { useEffect, useState, useRef } from 'react'
import { getSession } from 'next-auth/react'
import { canUseSpeechRecognition, canUseSpeechSynthesis, speak, createRecognizer } from '../../../lib/voice'

export default function PreConsultationPage(){
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [complaint, setComplaint] = useState('')
  const [sessionData, setSessionData] = useState<any>(null)
  const [emergencyResult, setEmergencyResult] = useState<any>(null)
  const [hospitals, setHospitals] = useState<any[] | null>(null)
  const [locationDenied, setLocationDenied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedConsultation, setSubmittedConsultation] = useState<any>(null)
  const [voiceMode, setVoiceMode] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [transcriptFinal, setTranscriptFinal] = useState<string | null>(null)
  const recognizerRef = useRef<any>(null)

  async function start(){
  setLoading(true)

  try {
    const res = await fetch('/api/patient/preconsult/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ complaint })
    })

    const data = await res.json()

    if (!res.ok || !data.sessionId) {
      console.error('Pre-consultation start failed:', data)
      alert(data.error || 'Could not start pre-consultation')
      return
    }

    await loadSession(data.sessionId)
    setSessionId(data.sessionId)
  } catch (error) {
    console.error('Pre-consultation start error:', error)
    alert('Could not connect to the server. Check the terminal for errors.')
  } finally {
    setLoading(false)
  }
}

  async function loadSession(id:string){
    const res = await fetch(`/api/patient/preconsult/session/${id}`)
    const data = await res.json()
    setSessionData(data)
  }

  useEffect(()=>{
    return ()=>{ if (recognizerRef.current && recognizerRef.current.isSupported) recognizerRef.current.stop() }
  },[])

  async function answer(questionId: string, value: any) {
  try {
    const res = await fetch(
      `/api/patient/preconsult/session/${sessionId}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId, value })
      }
    )

    const data = await res.json()

    if (!res.ok) {
      console.error('Submit answer failed:', data)
      alert(data.error || 'Could not submit answer')
      return
    }

    await loadSession(sessionId!)
  } catch (error) {
    console.error('Submit answer error:', error)
    alert('Could not submit answer. Check the terminal for errors.')
  }
}

  function playQuestion(text:string){
    if (!canUseSpeechSynthesis()) return
    setSpeaking(true)
    speak(text).finally(()=>setSpeaking(false))
  }

  function startListening(){
    if (!canUseSpeechRecognition()) return
    setTranscript('')
    setTranscriptFinal(null)
    const handleResult = (t:string, isFinal:boolean)=>{
      setTranscript(t)
      if (isFinal) setTranscriptFinal(t)
    }
    const handleEnd = ()=>{ setListening(false) }
    const r = createRecognizer(handleResult, handleEnd)
    recognizerRef.current = r
    setListening(true)
    r.start()
  }

  function stopListening(){
    if (recognizerRef.current) recognizerRef.current.stop()
    setListening(false)
  }

  async function finish(){
    const completion = await fetch(`/api/patient/preconsult/session/${sessionId}`,{method:'PUT'})
    if (!completion.ok) {
      const body = await completion.json().catch(()=>({}))
      alert(body.error || 'Unable to complete pre-consultation')
      return
    }
    await loadSession(sessionId!)
    // run emergency detection and show result
    const det = await fetch('/api/emergency/detect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ sessionId, createAlert: false })})
    const detJson = await det.json()
    setEmergencyResult(detJson)
  }

  async function submitConsultation(){
    setSubmitting(true)
    const response = await fetch(`/api/patient/preconsult/session/${sessionId}/submit`, { method: 'POST' })
    const body = await response.json().catch(()=>({}))
    setSubmitting(false)
    if (!response.ok) {
      alert(body.error || 'Unable to submit consultation request')
      return
    }
    setSubmittedConsultation(body.consultation)
  }

  async function openHospitalPicker(){
    setHospitals(null)
    setLocationDenied(false)
    if (typeof navigator !== 'undefined' && navigator.geolocation){
      navigator.geolocation.getCurrentPosition(async (pos)=>{
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        try{
          const r = await fetch('/api/patient/nearby-hospitals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ lat, lng })})
          const j = await r.json()
          setHospitals(j.hospitals || [])
        }catch(e){ setHospitals([]) }
      }, (err)=>{ setLocationDenied(true); setHospitals([]) }, { enableHighAccuracy:false, timeout:10000 })
    }else{
      setLocationDenied(true)
      setHospitals([])
    }
  }

  async function manualSearch(){
    if (!searchQuery) return
    setHospitals(null)
    try{
      const r = await fetch('/api/patient/nearby-hospitals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ q: searchQuery })})
      const j = await r.json()
      setHospitals(j.hospitals || [])
    }catch(e){ setHospitals([]) }
  }



  if (!sessionId) {
    return (
      <main className="container py-8">
        <h1 className="text-2xl font-semibold mb-4">Start Pre-Consultation</h1>
        <textarea className="w-full border p-2 rounded mb-2" value={complaint} onChange={e=>setComplaint(e.target.value)} placeholder="Describe your main complaint" />
        <div><button disabled={loading||!complaint} onClick={start} className="px-3 py-2 bg-sky-600 text-white rounded">Start Pre-Consultation</button></div>
      </main>
    )
  }

  if (!sessionData) return <div className="container py-8">Loading...</div>

  const q = sessionData.session.questions.find((x:any)=>!x.answered)
  const submitted = submittedConsultation || sessionData.session.consultation

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold mb-4">Pre-Consultation — {sessionData.session.domain}</h1>
      <div className="mb-4">Progress: {sessionData.progress.answered}/{sessionData.progress.total}</div>
      {q ? (
        <div className="max-w-md border rounded p-4">
          <div className="mb-2">{q.text}</div>
          <div className="mb-2 flex items-center space-x-2">
            <label className="inline-flex items-center"><input type="checkbox" checked={voiceMode} onChange={e=>setVoiceMode(e.target.checked)} className="mr-2" />Voice mode</label>
            {voiceMode && canUseSpeechSynthesis() && <button onClick={()=>playQuestion(q.text)} className="px-2 py-1 border rounded">Play Question</button>}
            {voiceMode && canUseSpeechRecognition() && (
              <div>
                {!listening && <button onClick={startListening} className="px-2 py-1 bg-sky-600 text-white rounded">Start Listening</button>}
                {listening && <button onClick={stopListening} className="px-2 py-1 bg-red-600 text-white rounded">Stop</button>}
              </div>
            )}
          </div>

          {q.type === 'TEXT' && (
            <div>
              <textarea className="w-full border p-2 rounded mb-2" value={transcriptFinal ?? transcript} onChange={e=>{ setTranscript(e.target.value); setTranscriptFinal(e.target.value) }} placeholder="Type or use voice" />
              <div className="flex space-x-2">
                <button onClick={()=>{ if (transcriptFinal || transcript) answer(q.id, transcriptFinal ?? transcript); setTranscript(''); setTranscriptFinal(null) }} className="px-3 py-2 bg-sky-600 text-white rounded">Submit Answer</button>
              </div>
            </div>
          )}

          {q.type === 'NUMBER' && (
            <div>
              <input type="number" className="w-full border p-2 rounded mb-2" value={transcriptFinal ?? transcript} onChange={e=>{ setTranscript(e.target.value); setTranscriptFinal(e.target.value) }} placeholder="Type or speak a number" />
              <div className="flex space-x-2"><button onClick={()=>{ const val = Number(transcriptFinal ?? transcript); if (!Number.isNaN(val)) answer(q.id, val); setTranscript(''); setTranscriptFinal(null) }} className="px-3 py-2 bg-sky-600 text-white rounded">Submit</button></div>
            </div>
          )}

          {q.type === 'YESNO' && (
            <div>
              <div className="space-x-2 mb-2"><button onClick={()=>answer(q.id, true)} className="px-3 py-2 bg-sky-600 text-white rounded">Yes</button><button onClick={()=>answer(q.id, false)} className="px-3 py-2 border rounded">No</button></div>
              {voiceMode && (
                <div>
                  <div className="mb-2">Spoken transcription (edit if needed):</div>
                  <input className="w-full border p-2 rounded mb-2" value={transcriptFinal ?? transcript} onChange={e=>{ setTranscript(e.target.value); setTranscriptFinal(e.target.value) }} />
                  <div className="space-x-2">
                    <button onClick={()=>{ const t=(transcriptFinal ?? transcript).toLowerCase(); if (t.includes('yes')) answer(q.id, true); else if (t.includes('no')) answer(q.id, false); else alert('Could not detect yes/no confidently. Please edit and submit.'); setTranscript(''); setTranscriptFinal(null) }} className="px-3 py-2 bg-sky-600 text-white rounded">Submit Spoken Answer</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-md">
          <div className="mb-2">All questions answered.</div>
          {!sessionData.session.report && <button onClick={finish} className="px-3 py-2 bg-sky-600 text-white rounded">Finish and create Symptom Report</button>}
          {sessionData.session.report && !submitted && <button disabled={submitting} onClick={submitConsultation} className="px-3 py-2 bg-sky-600 text-white rounded">{submitting ? 'Submitting...' : 'Submit Consultation Request'}</button>}
          {submitted && <div className="mt-2 text-green-700">Consultation request submitted.</div>}
          {emergencyResult && (
            <div className="mt-4 p-3 border rounded bg-yellow-50">
              <div className="font-semibold">Emergency check: {emergencyResult.severity}</div>
              {emergencyResult.severity === 'EMERGENCY' && <div className="mt-2 text-red-600">This looks like an emergency. Please seek immediate medical attention or call emergency services.</div>}
              {emergencyResult.severity === 'URGENT' && <div className="mt-2 text-orange-600">This may require urgent attention. Consider contacting your care provider.</div>}
              {(emergencyResult.severity === 'URGENT' || emergencyResult.severity === 'EMERGENCY') && !emergencyResult.alert && (
                <div className="mt-2">
                  <div className="mb-2">You may choose a nearby hospital to route this alert to. We will ask for your location once. You must explicitly choose a hospital to send the alert.</div>
                  <div className="space-x-2">
                    <button onClick={async()=>{ await openHospitalPicker(); }} className="px-3 py-2 bg-sky-600 text-white rounded">Find Nearby Hospitals</button>
                    <button onClick={async()=>{ const r = await fetch('/api/emergency/detect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ sessionId, createAlert: true })}); const j = await r.json(); setEmergencyResult(j); alert('Hospital alert created (no hospital selected)') }} className="px-3 py-2 border rounded">Create Alert Without Hospital</button>
                  </div>
                  {locationDenied && <div className="mt-2 text-sm">Location permission denied. You can search for a hospital manually below.</div>}
                  {hospitals && (
                    <div className="mt-3 border rounded p-2 bg-white">
                      <div className="font-semibold mb-2">Select Hospital</div>
                      {hospitals.length===0 && <div className="text-sm">No hospitals found.</div>}
                      {hospitals.map((h:any)=> (
                        <div key={h.id} className="mb-2 p-2 border rounded">
                          <div className="font-medium">{h.name} {h.distanceMeters ? <span className="text-sm text-gray-500">({Math.round((h.distanceMeters||0)/1000*10)/10} km)</span> : null}</div>
                          <div className="text-sm">{h.address}</div>
                          <div className="mt-1 space-x-2">
                            {h.phone && <a className="text-sm text-sky-600" href={`tel:${h.phone}`}>Call</a>}
                            {h.lat && h.lng && <a className="text-sm text-sky-600" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`}>Directions</a>}
                            <button onClick={async()=>{ const r = await fetch('/api/emergency/detect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ sessionId, createAlert: true, hospitalId: h.id })}); const j = await r.json(); setEmergencyResult(j); alert('Alert created and routed to selected hospital') }} className="px-2 py-1 bg-red-600 text-white rounded text-sm">Route to this hospital</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!hospitals && (
                    <div className="mt-3">
                      <div className="text-sm mb-2">Or search manually:</div>
                      <div className="flex space-x-2"><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="City or hospital name" className="border p-2 rounded flex-1" /><button onClick={()=>manualSearch()} className="px-3 py-2 bg-sky-600 text-white rounded">Search</button></div>
                    </div>
                  )}
                </div>
              )}
              {emergencyResult.alert && (
                <div className="mt-2">Alert created at {new Date(emergencyResult.alert.createdAt).toLocaleString()}</div>
              )}
            </div>
          )}
        </div>
      )}
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

