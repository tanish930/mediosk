import { useEffect, useState, useRef } from 'react'
import { getSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { canUseSpeechRecognition, canUseSpeechSynthesis, speak, createRecognizer } from '../../../lib/voice'
import { parsePreconsultIntent } from '../../../lib/preconsultFlow'
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, isValidLanguage } from '../../../lib/languages'
import { sttLocale, readAloudLocale, getQuestionSection, getSectionLabel, getQuestionText } from '../../../lib/multilingualQuestions'
import { startUiCopy } from '../../../lib/startUiCopy'
import { DONT_KNOW_VALUE, PREFER_NOT_TO_ANSWER_VALUE } from '../../../lib/responseQualifiers'

type Stage = 'start' | 'questions' | 'documents' | 'review' | 'submitted'

export default function PreConsultationPage({ newFlow = false, initialSessionId = null }: any) {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [complaint, setComplaint] = useState('')
  const [consultationLang, setConsultationLang] = useState<string>(DEFAULT_LANGUAGE)
  const [sessionLanguage, setSessionLanguage] = useState<string | null>(null)
  const [sessionData, setSessionData] = useState<any>(null)
  const [emergencyResult, setEmergencyResult] = useState<any>(null)
  const [hospitals, setHospitals] = useState<any[] | null>(null)
  const [locationDenied, setLocationDenied] = useState(false)
  const [showHospitalPickerForStandard, setShowHospitalPickerForStandard] = useState(false)
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedConsultation, setSubmittedConsultation] = useState<any>(null)
  const [voiceMode, setVoiceMode] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [transcriptFinal, setTranscriptFinal] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [inlineRedFlag, setInlineRedFlag] = useState<any>(null)
  const recognizerRef = useRef<any>(null)
  const answerInputRef = useRef<any>(null)
  const userChangedLangRef = useRef(false)
  const [answering, setAnswering] = useState(false)
  const answeringRef = useRef(false)
  const [intakeSkipped, setIntakeSkipped] = useState(false)
  const [intakeVisible, setIntakeVisible] = useState(false)
  const [intakeDocs, setIntakeDocs] = useState<any[]>([])
  const [intakeFile, setIntakeFile] = useState<File | null>(null)
  const [intakeTitle, setIntakeTitle] = useState('')
  const [intakeUploading, setIntakeUploading] = useState(false)
  const [intakeError, setIntakeError] = useState<string | null>(null)

  async function start() {
    setLoading(true)
    try {
      const res = await fetch('/api/patient/preconsult/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ complaint, language: consultationLang }),
      })
      const data = await res.json()
      if (!res.ok || !data.sessionId) {
        const t = startUiCopy(consultationLang)
        setStartError(data.error === 'ACTIVE_CONSULTATION_IN_PROGRESS' ? t.errorActiveConsultation : t.errorStartFailed)
        return
      }
      await loadSession(data.sessionId)
      setSessionId(data.sessionId)
      setStartError(null)
      // Pin the new session in the URL so a refresh keeps operating on THIS
      // session and never auto-resumes an older one. Shallow so this page's
      // getServerSideProps (and therefor the resume effect) is not re-run.
      router.replace(
        `/dashboard/patient/preconsultation?session=${encodeURIComponent(data.sessionId)}`,
        undefined,
        { shallow: true }
      )
    } catch {
      setStartError(startUiCopy(consultationLang).errorConnectFailed)
    } finally {
      setLoading(false)
    }
  }

  const [startError, setStartError] = useState<string | null>(null)

  function applySessionData(data: any) {
    setSessionData(data)
    const lang = data?.session?.language
    if (isValidLanguage(lang)) setSessionLanguage(lang)
    setInlineRedFlag(data?.redFlag && data.redFlag.severity !== 'NORMAL' ? data.redFlag : null)
  }

  async function loadSession(id: string) {
    const res = await fetch(`/api/patient/preconsult/session/${id}`)
    const data = await res.json()
    applySessionData(data)
  }

  const [resumeLoading, setResumeLoading] = useState(true)
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (initialSessionId) {
      // Explicit session (e.g. created by "Start New Consultation"): operate on
      // exactly this session. Never auto-resume an older one.
      setResumeLoading(true)
      fetch(`/api/patient/preconsult/session/${encodeURIComponent(initialSessionId)}`)
        .then(r => r.json())
        .then(d => {
          if (cancelled) return
          if (d && d.session) {
            setSessionId(initialSessionId)
            applySessionData(d)
            setSessionLoadError(null)
          } else {
            setSessionId(null)
            setSessionLoadError(startUiCopy(consultationLang).errorSessionLoad)
          }
        })
        .catch(() => {
          if (cancelled) return
          setSessionId(null)
          setSessionLoadError(startUiCopy(consultationLang).errorSessionLoad)
        })
        .finally(() => { if (!cancelled) setResumeLoading(false) })
      return () => { cancelled = true }
    }

    if (newFlow) {
      // "Start New Consultation": do NOT auto-resume an existing session. A
      // fresh session is created server-side when the patient clicks "Begin".
      setResumeLoading(false)
      return
    }

    // Default entry points (Continue Pre-Consultation, summary "Review & Submit"):
    // resume the latest session.
    setResumeLoading(true)
    fetch('/api/patient/preconsult/status')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const existing = d && d.session
        if (existing && existing.id) {
          setSessionId(existing.id)
          return loadSession(existing.id)
        }
      })
      .catch(() => { /* fall through to the start stage */ })
      .finally(() => { if (!cancelled) setResumeLoading(false) })
    return () => { cancelled = true }
  }, [initialSessionId, newFlow])

  useEffect(() => {
    return () => {
      if (recognizerRef.current && recognizerRef.current.isSupported) recognizerRef.current.stop()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Pre-select the patient's preferred clinical language (from their profile)
    // so a new consultation defaults to the language they consult in. A
    // language the patient already chose in the form always wins over this
    // preselect, so an in-flight profile fetch can never revert their choice.
    fetch('/api/patient/profile')
      .then(r => r.json().catch(() => null))
      .then(d => {
        if (cancelled || userChangedLangRef.current) return
        const lang = d?.patient?.preferredLanguage
        if (isValidLanguage(lang)) setConsultationLang(lang)
      })
      .catch(() => { /* keep the default language */ })
    return () => { cancelled = true }
  }, [])

  async function loadIntakeDocs() {
    if (!sessionId) return
    try {
      const r = await fetch(`/api/patient/documents?sessionId=${encodeURIComponent(sessionId)}`)
      const j = await r.json()
      setIntakeDocs(j.documents || [])
    } catch { /* poll silently */ }
  }

  async function openIntake() {
    setIntakeVisible(true)
    await loadIntakeDocs()
  }

  async function uploadIntakeDoc() {
    if (!intakeFile) return
    setIntakeUploading(true)
    setIntakeError(null)
    try {
      const fd = new FormData()
      fd.append('file', intakeFile)
      fd.append('title', intakeTitle || intakeFile.name)
      fd.append('sessionId', sessionId!)
      const r = await fetch('/api/patient/documents', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) {
        setIntakeError(j.error || 'Upload failed. Please try again.')
        return
      }
      setIntakeFile(null)
      setIntakeTitle('')
      await loadIntakeDocs()
    } catch {
      setIntakeError('Upload failed. Please check your connection and try again.')
    } finally {
      setIntakeUploading(false)
    }
  }

  async function retryIntakeDoc(id: string) {
    try { await fetch(`/api/patient/documents/${id}/retry`, { method: 'POST' }) } catch { /* ignore */ }
    await loadIntakeDocs()
  }

  const hasActiveIntakeProcessing = intakeDocs.some(
    (d: any) => d.processing && (d.processing.status === 'PENDING' || d.processing.status === 'PROCESSING')
  )

  useEffect(() => {
    if (!sessionId || !intakeVisible || !hasActiveIntakeProcessing) return
    const iv = setInterval(() => {
      fetch(`/api/patient/documents?sessionId=${encodeURIComponent(sessionId)}`)
        .then(r => r.json())
        .then(j => setIntakeDocs(j.documents || []))
        .catch(() => {})
    }, 8000)
    return () => clearInterval(iv)
  }, [sessionId, intakeVisible, hasActiveIntakeProcessing])

  function intakeStatusLabel(d: any): string {
    const s = d.processing?.status
    if (s === 'PENDING') return 'Processing...'
    if (s === 'PROCESSING') return 'Processing...'
    if (s === 'COMPLETED') return 'Ready'
    if (s === 'FAILED') return 'Failed'
    return 'Uploaded'
  }

  function intakeStatusColor(d: any): string {
    const s = d.processing?.status
    if (s === 'PENDING' || s === 'PROCESSING') return 'text-amber-600 bg-amber-50'
    if (s === 'COMPLETED') return 'text-green-600 bg-green-50'
    if (s === 'FAILED') return 'text-red-600 bg-red-50'
    return 'text-slate-500 bg-slate-50'
  }

  async function answer(questionId: string, value: any) {
    if (answeringRef.current) return
    answeringRef.current = true
    setAnswering(true)
    try {
      const res = await fetch(`/api/patient/preconsult/session/${sessionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId, value }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAnswerError(data.error || 'Could not submit answer. Please try again.')
        return
      }
      setAnswerError(null)
      await loadSession(sessionId!)
      stopVoiceRecognition()
      setTranscript('')
      setTranscriptFinal(null)
    } catch {
      setAnswerError('Could not submit answer. Please check your connection and try again.')
    } finally {
      answeringRef.current = false
      setAnswering(false)
    }
  }

  const [answerError, setAnswerError] = useState<string | null>(null)

  function playQuestion(text: string) {
    if (!canUseSpeechSynthesis()) return
    setSpeaking(true)
    const lang = sessionLanguage || consultationLang
    speak(text, readAloudLocale(lang)).finally(() => setSpeaking(false))
  }

  function startListening() {
    if (!canUseSpeechRecognition()) return
    if (recognizerRef.current && recognizerRef.current.isListening()) return
    setVoiceError(null)
    const lang = sessionLanguage || consultationLang
    const r = createRecognizer({
      lang: sttLocale(lang),
      onResult: (t, isFinal) => {
        if (recognizerRef.current !== r) return
        setTranscript(t)
        if (isFinal) setTranscriptFinal(t)
      },
      onEnd: () => {
        if (recognizerRef.current !== r) return
        recognizerRef.current = null
        setListening(false)
      },
      onError: (info) => {
        if (recognizerRef.current !== r) return
        setVoiceError(info?.message || info?.error || 'Speech recognition failed. You can type your answer instead.')
      },
    })
    recognizerRef.current = r
    setListening(true)
    r.start()
  }

  function stopVoiceRecognition() {
    if (recognizerRef.current) {
      recognizerRef.current.stop()
      recognizerRef.current = null
    }
    setListening(false)
  }

  async function finish() {
    setLoading(true)
    try {
      const completion = await fetch(`/api/patient/preconsult/session/${sessionId}`, { method: 'PUT' })
      if (!completion.ok) {
        const body = await completion.json().catch(() => ({}))
        setFinishError(body.error || 'Unable to complete pre-consultation. Please try again.')
        return
      }
      await loadSession(sessionId!)
      setFinishError(null)
      const det = await fetch('/api/emergency/detect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, createAlert: false }),
      })
      const detJson = await det.json()
      setEmergencyResult(detJson)
    } catch {
      setFinishError('Could not complete pre-consultation. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const [finishError, setFinishError] = useState<string | null>(null)

  async function submitConsultation() {
    if (!selectedHospitalId) return
    setSubmitting(true)
    try {
      const response = await fetch(`/api/patient/preconsult/session/${sessionId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hospitalId: selectedHospitalId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSubmitError(body.error || 'Unable to submit consultation request. Please try again.')
        return
      }
      setSubmittedConsultation(body.consultation)
      setSubmitError(null)
    } catch {
      setSubmitError('Could not submit. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const [submitError, setSubmitError] = useState<string | null>(null)

  async function openHospitalPicker() {
    setHospitals(null)
    setLocationDenied(false)
    const fetchFallbackHospitals = async () => {
      try {
        const r = await fetch('/api/patient/nearby-hospitals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        })
        const j = await r.json()
        setHospitals(j.hospitals || [])
      } catch {
        setHospitals([])
      }
    }
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const r = await fetch('/api/patient/nearby-hospitals', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            })
            const j = await r.json()
            setHospitals(j.hospitals || [])
          } catch {
            setHospitals([])
          }
        },
        () => {
          setLocationDenied(true)
          fetchFallbackHospitals()
        },
        { enableHighAccuracy: false, timeout: 10000 }
      )
    } else {
      setLocationDenied(true)
      fetchFallbackHospitals()
    }
  }

  async function manualSearch() {
    if (!searchQuery) return
    setHospitals(null)
    try {
      const r = await fetch('/api/patient/nearby-hospitals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: searchQuery }),
      })
      const j = await r.json()
      setHospitals(j.hospitals || [])
    } catch {
      setHospitals([])
    }
  }

  // ─── Stage derivation ────────────────────────────────────────────
  if (resumeLoading && !sessionId) {
    return (
      <main className="container py-20 text-center text-slate-500" role="status" aria-label="Loading">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-300 border-t-sky-600 mb-3" />
        <p>Loading your pre-consultation...</p>
      </main>
    )
  }

  const q = sessionData?.session?.questions?.find((x: any) => !x.answered)
  const submitted = submittedConsultation || sessionData?.session?.consultation
  const hasReport = !!sessionData?.session?.report
  const progress = sessionData?.progress || { total: 0, answered: 0 }
  const questionLang = sessionLanguage || consultationLang
  const questionSection = q ? getQuestionSection(q.key) : null

  const stage: Stage = (() => {
    if (submitted) return 'submitted'
    if (!sessionId) return 'start'
    if (q) return 'questions'
    if (!hasReport || intakeVisible) return 'documents'
    return 'review'
  })()

  const stageIndex = { start: 0, questions: 1, documents: 2, review: 3, submitted: 4 }[stage]

  // Active consultation-language UI copy for the Start stage. Because this is
  // derived from `consultationLang` state, the whole stage re-renders in the
  // selected language the moment the patient picks a card.
  const t = startUiCopy(consultationLang)

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <main className="container py-8 max-w-3xl" role="main" aria-label="Pre-Consultation">

      {/* ── Progress bar ─────────────────────────────────────────── */}
      {sessionId && (
        <nav className="mb-8" aria-label="Pre-consultation progress">
          <div className="flex items-center justify-between mb-3">
            {['Health Questions', 'Medical Documents', 'Review & Finish'].map((label, i) => {
              const active = (stage === 'questions' && i === 0) || (stage === 'documents' && i === 1) || (stage === 'review' && i === 2)
              const done = (stage === 'documents' && i === 0) || (stage === 'review' && i <= 1) || (stage === 'submitted' && i <= 2)
              return (
                <div key={label} className="flex-1 text-center" aria-current={active ? 'step' : undefined}>
                  <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${active ? 'text-sky-600' : done ? 'text-green-600' : 'text-slate-400'}`}>
                    {done ? '\u2713 ' : ''}{label}
                  </div>
                  <div className={`h-1 rounded-full mx-2 ${active ? 'bg-sky-500' : done ? 'bg-green-400' : 'bg-slate-200'}`} />
                </div>
              )
            })}
          </div>
          {stage === 'questions' && progress.total > 0 && (
            <div className="flex items-center gap-3 px-1">
              <div className="flex-1 bg-slate-200 rounded-full h-3 overflow-hidden" role="progressbar" aria-valuenow={progress.answered} aria-valuemin={0} aria-valuemax={progress.total} aria-label={`Question ${progress.answered} of ${progress.total}`}>
                <div className="bg-sky-500 h-full rounded-full transition-all duration-500" style={{ width: `${(progress.answered / progress.total) * 100}%` }} />
              </div>
              <span className="text-sm font-semibold text-sky-700 whitespace-nowrap">{progress.answered} / {progress.total}</span>
            </div>
          )}
        </nav>
      )}

      {/* ── STAGE: Start ─────────────────────────────────────────── */}
      {stage === 'start' && (
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{t.pageTitle}</h1>
          <p className="text-lg text-slate-600 mb-6">
            {t.intro}
          </p>

          {sessionLoadError && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 mb-4" role="alert">
              {sessionLoadError}
            </div>
          )}

          <fieldset className="mb-2">
            <legend className="block text-base font-semibold text-slate-700 mb-2">
              {t.languageQuestion}
            </legend>
            <div className="flex flex-col sm:flex-row gap-3">
              {SUPPORTED_LANGUAGES.map(l => {
                const selected = consultationLang === l.code
                return (
                  <label
                    key={l.code}
                    className={`flex items-center justify-center gap-3 w-full sm:flex-1 border-2 rounded-xl px-4 py-4 text-lg cursor-pointer select-none transition-all focus-within:ring-2 focus-within:ring-sky-400 focus-within:ring-offset-1 ${
                      selected
                        ? 'border-sky-600 bg-sky-50 text-sky-800 font-bold ring-2 ring-sky-400'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="consultation-lang"
                      value={l.code}
                      checked={selected}
                      onChange={() => { userChangedLangRef.current = true; setConsultationLang(l.code) }}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-sky-600' : 'border-slate-400'}`}
                    >
                      {selected && <span className="w-3 h-3 rounded-full bg-sky-600" />}
                    </span>
                    <span>{t.languageNames[isValidLanguage(l.code) ? l.code : 'en']}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          <p className="text-sm text-slate-500 mt-2 mb-4">
            {t.languageNote}
          </p>

          <div className="flex items-center justify-between gap-3 mb-2">
            <label htmlFor="complaint-input" className="block text-base font-semibold text-slate-700">
              {t.concernLabel}
            </label>
            {canUseSpeechSynthesis() && (
              <button
                onClick={() => playQuestion(getQuestionText('chief_complaint', consultationLang) ?? '')}
                disabled={speaking}
                className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-300 whitespace-nowrap"
                aria-label={t.readFirstQuestionAria}
              >
                {speaking ? t.reading : t.readAloud}
              </button>
            )}
          </div>
          <textarea
            id="complaint-input"
            className="w-full border-2 border-slate-300 p-4 rounded-xl text-lg resize-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
            rows={4}
            value={complaint}
            onChange={e => setComplaint(e.target.value)}
            placeholder={t.complaintPlaceholder}
            aria-describedby="complaint-hint"
          />
          <p id="complaint-hint" className="text-sm text-slate-500 mt-1 mb-4">
            {t.complaintHint}
          </p>

          {startError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mb-4" role="alert">
              {startError}
            </div>
          )}

          <button
            disabled={loading || !complaint.trim()}
            onClick={start}
            className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white text-lg font-semibold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-sky-300"
            aria-label={t.pageTitle}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                {t.starting}
              </span>
            ) : (
              t.beginButton
            )}
          </button>
        </div>
      )}

      {/* ── STAGE: Questions ─────────────────────────────────────── */}
      {stage === 'questions' && q && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Health Questions</h1>
          <p className="text-slate-500 mb-6">Answer each question so we can understand your condition better.</p>

          {inlineRedFlag && (
            <div
              className={`p-4 rounded-xl border-2 mb-4 ${inlineRedFlag.severity === 'EMERGENCY' ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}
              role="alert"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className={`text-lg font-bold mb-1 ${inlineRedFlag.severity === 'EMERGENCY' ? 'text-red-800' : 'text-amber-800'}`}>
                    {'\u26A0\uFE0F'} {inlineRedFlag.severity === 'EMERGENCY' ? 'Emergency Detected' : 'Urgent Attention Needed'}
                  </h2>
                  <p className={`text-base ${inlineRedFlag.severity === 'EMERGENCY' ? 'text-red-700' : 'text-amber-700'}`}>
                    {inlineRedFlag.severity === 'EMERGENCY'
                      ? 'Your answers suggest this may be a medical emergency. Please seek immediate medical attention. You can finish the questions and we can alert a nearby hospital.'
                      : 'Your answers suggest this may need prompt attention. Please consider reaching a care provider soon.'}
                  </p>
                </div>
                <button
                  onClick={() => setInlineRedFlag(null)}
                  className="text-sm font-medium text-slate-500 hover:text-slate-700 underline whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
                  aria-label="Dismiss emergency warning"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {answerError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mb-4" role="alert">
              {answerError}
              <button onClick={() => setAnswerError(null)} className="ml-2 underline text-red-600 font-medium" aria-label="Dismiss error">Dismiss</button>
            </div>
          )}

          {/* Current question card */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-sky-600">
                  Question {progress.answered + 1}
                </div>
                {questionSection && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                    {getSectionLabel(questionSection, questionLang)}
                  </span>
                )}
              </div>
              {isValidLanguage(questionLang) && SUPPORTED_LANGUAGES.find(l => l.code === questionLang) && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {SUPPORTED_LANGUAGES.find(l => l.code === questionLang)!.label}
                </span>
              )}
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-5">{q.text}</h2>
            <p className="text-sm text-slate-500 mb-4">
              You can speak your answer, type it, or choose a quick option below.
            </p>

            {/* Voice controls */}
            <div className="flex flex-wrap items-center gap-3 mb-5 pb-4 border-b border-slate-100">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={voiceMode}
                  onChange={e => setVoiceMode(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-sm font-medium text-slate-600">Voice mode</span>
              </label>

              {canUseSpeechSynthesis() && (
                <button
                  onClick={() => playQuestion(q.text)}
                  disabled={speaking}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-300"
                  aria-label={t.readFirstQuestionAria}
                >
                  {speaking ? t.reading : t.readAloud}
                </button>
              )}

              {voiceMode && canUseSpeechRecognition() && (
                <div>
                  {!listening && (
                    <button
                      onClick={startListening}
                      className="text-sm font-medium px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 hover:bg-sky-200 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-300"
                      aria-label="Start voice input"
                    >
                      {'\uD83C\uDFA4'} Start Listening
                    </button>
                  )}
                  {listening && (
                    <button
                      onClick={stopVoiceRecognition}
                      className="text-sm font-medium px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors focus:outline-none focus:ring-2 focus:ring-red-300 animate-pulse"
                      aria-label="Stop voice input"
                    >
                      {'\uD83C\uDF99\uFE0F'} Stop Listening
                    </button>
                  )}
                </div>
              )}
            </div>

            {voiceError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm mb-4" role="alert">
                <div className="flex items-center justify-between gap-3">
                  <div>{voiceError}</div>
                  {(q.type === 'TEXT' || q.type === 'NUMBER') && (
                    <button
                      onClick={() => {
                        stopVoiceRecognition()
                        setVoiceError(null)
                        if (answerInputRef.current) answerInputRef.current.focus()
                      }}
                      className="text-sm font-semibold text-amber-800 underline whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-amber-300 rounded"
                      aria-label="Use typing instead of voice"
                    >
                      Type instead
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Answer input — TEXT */}
            {q.type === 'TEXT' && (
              <div>
                <label htmlFor="answer-text" className="sr-only">Your answer</label>
                <textarea
                  id="answer-text"
                  ref={answerInputRef}
                  className="w-full border-2 border-slate-300 p-4 rounded-xl text-lg resize-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
                  rows={3}
                  value={transcriptFinal ?? transcript}
                  onChange={e => { setTranscript(e.target.value); setTranscriptFinal(e.target.value) }}
                  placeholder="Type or speak your answer"
                  aria-label="Your answer"
                />
                <button
                  onClick={() => {
                    const val = transcriptFinal ?? transcript
                    if (val) answer(q.id, val)
                    setTranscript('')
                    setTranscriptFinal(null)
                  }}
                  disabled={answering || !(transcriptFinal ?? transcript)}
                  className="mt-3 w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white text-lg font-semibold py-3 px-8 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-sky-300"
                  aria-label="Submit answer"
                >
                  {answering ? 'Submitting...' : 'Submit Answer'}
                </button>
                {questionSection && (questionSection === 'past_history' || questionSection === 'systems_review') && (
                  <button
                    onClick={() => answer(q.id, PREFER_NOT_TO_ANSWER_VALUE)}
                    disabled={answering}
                    className="mt-2 text-sm font-medium px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    aria-label="Prefer not to answer"
                  >
                    Prefer not to answer
                  </button>
                )}
              </div>
            )}

            {/* Answer input — NUMBER */}
            {q.type === 'NUMBER' && (
              <div>
                <label htmlFor="answer-number" className="sr-only">Your answer (number)</label>
                <input
                  id="answer-number"
                  ref={answerInputRef}
                  type="number"
                  className="w-full border-2 border-slate-300 p-4 rounded-xl text-2xl text-center font-semibold focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
                  value={transcriptFinal ?? transcript}
                  onChange={e => { setTranscript(e.target.value); setTranscriptFinal(e.target.value) }}
                  placeholder="Enter a number"
                  aria-label="Your answer as a number"
                />
                <button
                  onClick={() => {
                    const val = Number(transcriptFinal ?? transcript)
                    if (!Number.isNaN(val)) answer(q.id, val)
                    setTranscript('')
                    setTranscriptFinal(null)
                  }}
                  disabled={answering || !(transcriptFinal ?? transcript)}
                  className="mt-3 w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white text-lg font-semibold py-3 px-8 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-sky-300"
                  aria-label="Submit answer"
                >
                  {answering ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            )}

            {/* Answer input — YESNO */}
            {q.type === 'YESNO' && (
              <div>
                <div className="flex gap-4">
                  <button
                    onClick={() => answer(q.id, true)}
                    disabled={answering}
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-xl font-semibold py-4 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-sky-300"
                    aria-label="Yes"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => answer(q.id, false)}
                    disabled={answering}
                    className="flex-1 bg-white hover:bg-slate-50 text-slate-700 text-xl font-semibold py-4 px-6 rounded-xl border-2 border-slate-300 hover:border-slate-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-slate-300"
                    aria-label="No"
                  >
                    No
                  </button>
                </div>
                <div className="mt-3 text-center">
                  <button
                    onClick={() => answer(q.id, DONT_KNOW_VALUE)}
                    disabled={answering}
                    className="inline-block text-sm font-medium px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    aria-label="I don't know"
                  >
                    I don&apos;t know
                  </button>
                </div>

                {voiceMode && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-sm font-medium text-slate-500 mb-2">Spoken transcription (edit if needed):</p>
                    <input
                      className="w-full border-2 border-slate-300 p-3 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
                      value={transcriptFinal ?? transcript}
                      onChange={e => { setTranscript(e.target.value); setTranscriptFinal(e.target.value) }}
                      aria-label="Edit spoken answer"
                    />
                    <button
                      onClick={() => {
                        const t = (transcriptFinal ?? transcript).toLowerCase()
                        if (t.includes('yes')) answer(q.id, true)
                        else if (t.includes('no')) answer(q.id, false)
                        else setAnswerError('Could not detect yes or no. Please edit your answer and try again.')
                        setTranscript('')
                        setTranscriptFinal(null)
                      }}
                      disabled={answering || !(transcriptFinal ?? transcript)}
                      className="mt-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-5 rounded-lg transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    >
                      Submit Spoken Answer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {answering && (
            <div className="flex items-center gap-2 text-slate-500 text-sm" role="status" aria-label="Submitting answer">
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-sky-600" />
              Submitting your answer...
            </div>
          )}
        </div>
      )}

      {/* ── STAGE: Documents ─────────────────────────────────────── */}
      {stage === 'documents' && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Medical Documents</h1>
          <p className="text-slate-500 mb-6">
            Upload any medical reports, prescriptions, or test results. This is optional — you can skip this step.
          </p>

          {!intakeSkipped && !intakeVisible && (
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm text-center">
              <p className="text-lg text-slate-700 font-medium mb-4">Do you have any previous medical documents to share?</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={openIntake}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors focus:outline-none focus:ring-4 focus:ring-sky-300"
                  aria-label="Yes, upload documents"
                >
                  Yes, upload documents
                </button>
                <button
                  onClick={() => setIntakeSkipped(true)}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 px-6 rounded-xl border-2 border-slate-300 hover:border-slate-400 transition-colors focus:outline-none focus:ring-4 focus:ring-slate-300"
                  aria-label="No, continue without uploading"
                >
                  No — continue
                </button>
              </div>
            </div>
          )}

          {intakeVisible && (
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">Upload Documents</h2>
                <button
                  onClick={() => { setIntakeVisible(false); setIntakeSkipped(true) }}
                  className="text-sm text-slate-500 hover:text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-sky-300 rounded"
                >
                  Skip for now &rarr;
                </button>
              </div>

              <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-6 text-center mb-4">
                <label htmlFor="intake-file" className="cursor-pointer">
                  <div className="text-3xl mb-2">{'\uD83D\uDCC4'}</div>
                  <p className="font-medium text-slate-700">
                    {intakeFile ? intakeFile.name : 'Choose a file to upload'}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">PDF, JPG, or PNG — up to 10 MB</p>
                </label>
                <input
                  id="intake-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg"
                  onChange={e => setIntakeFile(e.target.files?.[0] || null)}
                  className="sr-only"
                />
              </div>

              <div className="flex gap-2 mb-4">
                <input
                  placeholder="Document title (optional)"
                  value={intakeTitle}
                  onChange={e => setIntakeTitle(e.target.value)}
                  className="flex-1 border-2 border-slate-300 p-3 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
                  aria-label="Document title"
                />
                <button
                  disabled={!intakeFile || intakeUploading}
                  onClick={uploadIntakeDoc}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300"
                >
                  {intakeUploading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                      Uploading...
                    </span>
                  ) : 'Upload'}
                </button>
              </div>

              {intakeError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4" role="alert">
                  {intakeError}
                </div>
              )}

              {intakeDocs.length > 0 && (
                <div className="space-y-3 mb-4">
                  {intakeDocs.map((d: any) => (
                    <div key={d.id} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 truncate">{d.title}</div>
                          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${intakeStatusColor(d)}`}>
                            {intakeStatusLabel(d)}
                          </span>
                          {d.uploadedAt && (
                            <span className="text-xs text-slate-400 ml-2">
                              {new Date(d.uploadedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a
                            href={`/api/patient/documents/${d.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-sky-600 hover:text-sky-800 font-medium focus:outline-none focus:ring-2 focus:ring-sky-300 rounded"
                          >
                            View
                          </a>
                          {d.processing?.status === 'FAILED' && (
                            <button
                              onClick={() => retryIntakeDoc(d.id)}
                              className="text-sm font-medium px-3 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </div>
                      {d.processing?.status === 'FAILED' && d.processing?.error && (
                        <div className="text-sm text-red-600 mt-2 p-2 bg-red-50 rounded-lg">
                          Processing failed. You can retry or continue without this document.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {hasActiveIntakeProcessing && (
                <div className="flex items-center gap-2 text-sm text-amber-600 mb-4 p-3 bg-amber-50 rounded-lg" role="status">
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-amber-300 border-t-amber-600" />
                  Your document is still being processed. You can continue without waiting.
                </div>
              )}

              <button
                onClick={() => { setIntakeVisible(false); setIntakeSkipped(true) }}
                className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors focus:outline-none focus:ring-4 focus:ring-sky-300"
              >
                Continue
              </button>
            </div>
          )}

          {/* Finish button */}
          {!sessionData?.session?.report && (intakeSkipped || intakeVisible) && (
            <div className="mt-6">
              <button
                onClick={finish}
                disabled={loading}
                className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white text-lg font-semibold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-sky-300"
                aria-label="Finish and create symptom report"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                    Preparing your report...
                  </span>
                ) : (
                  'Finish and Create Report'
                )}
              </button>
              {finishError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mt-3" role="alert">
                  {finishError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── STAGE: Review ────────────────────────────────────────── */}
      {stage === 'review' && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Review & Submit</h1>
          <p className="text-slate-500 mb-6">
            Your symptom report is ready. Choose a hospital and submit your consultation request.
          </p>

          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">{'\u2705'}</span>
              <div>
                <h2 className="font-semibold text-green-800">Report Created</h2>
                <p className="text-sm text-green-700">Your doctor will review this before your consultation.</p>
              </div>
            </div>
          </div>

          {!showHospitalPickerForStandard && !submitted && (
            <button
              onClick={() => { setShowHospitalPickerForStandard(true); openHospitalPicker() }}
              className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white text-lg font-semibold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all focus:outline-none focus:ring-4 focus:ring-sky-300"
              aria-label="Select hospital and submit"
            >
              Select Hospital & Submit
            </button>
          )}

          {showHospitalPickerForStandard && !submitted && (
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Choose a Hospital</h3>
              {locationDenied && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm mb-4">
                  Location permission denied. You can search manually below.
                </div>
              )}

              {hospitals === null && (
                <div className="flex items-center gap-2 text-slate-500 py-4">
                  <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-sky-600" />
                  Finding hospitals...
                </div>
              )}

              {hospitals && hospitals.length === 0 && (
                <p className="text-slate-500 py-4">No hospitals found. Try searching manually.</p>
              )}

              {hospitals && hospitals.length > 0 && (
                <div className="max-h-72 overflow-y-auto pr-1 space-y-2 mb-4" role="radiogroup" aria-label="Hospital list">
                  {hospitals.map((h: any) => (
                    <button
                      key={h.id}
                      onClick={() => setSelectedHospitalId(h.id)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        selectedHospitalId === h.id
                          ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-200'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                      role="radio"
                      aria-checked={selectedHospitalId === h.id}
                      aria-label={`Select ${h.name}`}
                    >
                      <div className="font-semibold text-slate-800">
                        {h.name}
                        {h.distanceMeters != null && (
                          <span className="text-sm font-normal text-slate-500 ml-2">
                            ({Math.round((h.distanceMeters / 1000) * 10) / 10} km)
                          </span>
                        )}
                      </div>
                      {h.address && <div className="text-sm text-slate-500 mt-0.5">{h.address}</div>}
                    </button>
                  ))}
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="hospital-search" className="block text-sm font-medium text-slate-600 mb-1">
                  Or search manually
                </label>
                <div className="flex gap-2">
                  <input
                    id="hospital-search"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') manualSearch() }}
                    placeholder="City or hospital name"
                    className="flex-1 border-2 border-slate-300 p-3 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
                  />
                  <button
                    onClick={manualSearch}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-sky-300"
                  >
                    Search
                  </button>
                </div>
              </div>

              {submitError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mb-4" role="alert">
                  {submitError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  disabled={!selectedHospitalId || submitting}
                  onClick={submitConsultation}
                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-sky-300"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                      Submitting...
                    </span>
                  ) : (
                    'Submit Consultation Request'
                  )}
                </button>
                <button
                  disabled={submitting}
                  onClick={() => { setShowHospitalPickerForStandard(false); setSelectedHospitalId(null) }}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 px-5 rounded-xl border-2 border-slate-300 hover:border-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {submitted && (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 mt-4" role="status">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl" aria-hidden="true">{'\uD83D\uDCE8'}</span>
                <div>
                  <h3 className="font-semibold text-green-800 text-lg">Consultation Request Sent</h3>
                  <p className="text-sm text-green-700">A doctor will review your information and get in touch.</p>
                </div>
              </div>
              <Link
                href="/dashboard/patient"
                className="inline-block mt-3 text-green-700 hover:text-green-900 font-medium focus:outline-none focus:ring-2 focus:ring-green-300 rounded"
              >
                Back to Dashboard &rarr;
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── STAGE: Submitted ─────────────────────────────────────── */}
      {stage === 'submitted' && !submitted && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Consultation Submitted</h1>
          <p className="text-slate-500 mb-4">Your request has been sent to the hospital.</p>
          <Link
            href="/dashboard/patient"
            className="inline-block bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors focus:outline-none focus:ring-4 focus:ring-sky-300"
          >
            Back to Dashboard
          </Link>
        </div>
      )}

      {/* ── Emergency Result (shown at any stage after finish) ────── */}
      {emergencyResult && (
        <div className="mt-6 border-2 rounded-2xl overflow-hidden" role="alert"
          aria-label={`Emergency check result: ${emergencyResult.severity}`}
        >
          {emergencyResult.severity === 'EMERGENCY' && (
            <div className="bg-red-50 border-b-2 border-red-200 p-6">
              <h2 className="text-xl font-bold text-red-800 mb-2">{'\u26A0\uFE0F'} Emergency Detected</h2>
              <p className="text-red-700 text-lg">
                This may be a medical emergency. Please seek immediate medical attention or call emergency services.
              </p>
            </div>
          )}
          {emergencyResult.severity === 'URGENT' && (
            <div className="bg-amber-50 border-b-2 border-amber-200 p-6">
              <h2 className="text-xl font-bold text-amber-800 mb-2">{'\u26A0\uFE0F'} Urgent Attention Needed</h2>
              <p className="text-amber-700 text-lg">
                This may require urgent medical attention. Consider contacting your care provider soon.
              </p>
            </div>
          )}
          {emergencyResult.severity === 'NORMAL' && (
            <div className="bg-green-50 border-b-2 border-green-200 p-6">
              <h2 className="text-lg font-semibold text-green-800">No emergency detected</h2>
            </div>
          )}

          {(emergencyResult.severity === 'URGENT' || emergencyResult.severity === 'EMERGENCY') && !emergencyResult.alert && (
            <div className="p-6 bg-white">
              <p className="text-slate-700 mb-4">
                Choose a nearby hospital to send an alert. We will ask for your location once.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <button
                  onClick={async () => { await openHospitalPicker() }}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors focus:outline-none focus:ring-4 focus:ring-sky-300"
                >
                  Find Nearby Hospitals
                </button>
                <button
                  onClick={async () => {
                    const r = await fetch('/api/emergency/detect', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ sessionId, createAlert: true }),
                    })
                    const j = await r.json()
                    setEmergencyResult(j)
                  }}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 px-6 rounded-xl border-2 border-slate-300 hover:border-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  Create Alert Without Hospital
                </button>
              </div>

              {locationDenied && (
                <p className="text-sm text-slate-500 mb-3">Location permission denied. Search for a hospital manually below.</p>
              )}

              {hospitals && (
                <div className="border border-slate-200 rounded-xl p-4 mb-4">
                  <h3 className="font-semibold text-slate-800 mb-3">Select Hospital</h3>
                  {hospitals.length === 0 && <p className="text-sm text-slate-500">No hospitals found.</p>}
                  <div className="space-y-2">
                    {hospitals.map((h: any) => (
                      <div key={h.id} className="p-3 border border-slate-200 rounded-xl">
                        <div className="font-medium text-slate-800">
                          {h.name}
                          {h.distanceMeters != null && (
                            <span className="text-sm text-slate-500 ml-2">
                              ({Math.round((h.distanceMeters / 1000) * 10) / 10} km)
                            </span>
                          )}
                        </div>
                        {h.address && <div className="text-sm text-slate-500">{h.address}</div>}
                        <div className="flex gap-3 mt-2">
                          {h.phone && (
                            <a className="text-sm text-sky-600 hover:text-sky-800 font-medium" href={`tel:${h.phone}`}>
                              Call
                            </a>
                          )}
                          {h.lat && h.lng && (
                            <a
                              className="text-sm text-sky-600 hover:text-sky-800 font-medium"
                              target="_blank"
                              rel="noreferrer"
                              href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`}
                            >
                              Directions
                            </a>
                          )}
                          <button
                            onClick={async () => {
                              const r = await fetch('/api/emergency/detect', {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ sessionId, createAlert: true, hospitalId: h.id }),
                              })
                              const j = await r.json()
                              setEmergencyResult(j)
                            }}
                            className="text-sm font-medium px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                          >
                            Route to this hospital
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!hospitals && (
                <div>
                  <label htmlFor="emergency-search" className="block text-sm font-medium text-slate-600 mb-1">
                    Or search manually
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="emergency-search"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') manualSearch() }}
                      placeholder="City or hospital name"
                      className="flex-1 border-2 border-slate-300 p-3 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
                    />
                    <button
                      onClick={manualSearch}
                      className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-sky-300"
                    >
                      Search
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {emergencyResult.alert && (
            <div className="p-4 bg-slate-50">
              <p className="text-sm text-slate-600">
                Alert created at {new Date(emergencyResult.alert.createdAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Back link ────────────────────────────────────────────── */}
      {stage !== 'start' && (
        <div className="mt-8 pt-4 border-t border-slate-200">
          <Link
            href="/dashboard/patient"
            className="text-sm text-slate-500 hover:text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-sky-300 rounded"
          >
            &larr; Back to Dashboard
          </Link>
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
  const intent = parsePreconsultIntent((ctx.query as Record<string, string | string[]>) || {})
  return { props: { newFlow: intent.newFlow, initialSessionId: intent.sessionId } }
}
