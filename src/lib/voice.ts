// Lightweight voice abstraction using browser Web Speech APIs.
// Exports simple speak() and createRecognizer() for STT.

type RecognitionErrorInfo = {
  error?: string
  message?: string
}

type RecognizerCallbacks = {
  onResult: (transcript: string, isFinal: boolean) => void
  onEnd?: () => void
  onError?: (info: RecognitionErrorInfo) => void
}

export type RecognizerHandle = {
  start: () => void
  stop: () => void
  isSupported: boolean
  isListening: () => boolean
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: Array<{ isFinal?: boolean; 0: { transcript: string } }>
}

type ActiveRecognizer = {
  api: any
}

// The browser allows only a single active SpeechRecognition session at a time.
let active: ActiveRecognizer | null = null

export function aggregateTranscriptResults(ev: SpeechRecognitionEventLike): { interim: string; final: string } {
  let interim = ''
  let final = ''
  for (let i = ev.resultIndex; i < ev.results.length; ++i) {
    const res = ev.results[i]
    if (res.isFinal) final += res[0].transcript
    else interim += res[0].transcript
  }
  return { interim, final }
}

// Tear down the currently active recognition so late onend/onresult/onerror
// events from it can never reach a new session's callbacks.
function discardPreviousRecognizer() {
  const prev = active
  if (!prev) return
  active = null
  const api = prev.api
  api.onstart = null
  api.onresult = null
  api.onend = null
  api.onerror = null
  try { api.abort() } catch (e) { /* not running */ }
  try { api.stop() } catch (e) { /* already stopped */ }
}

export function canUseSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function canUseSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false
  // @ts-ignore
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export async function speak(text: string, lang = 'en-US'): Promise<void> {
  if (!canUseSpeechSynthesis()) return Promise.resolve()
  return new Promise((resolve) => {
    try {
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = lang
      utter.onend = () => resolve()
      utter.onerror = () => resolve()
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
    } catch (e) {
      resolve()
    }
  })
}

export function createRecognizer(callbacks: RecognizerCallbacks): RecognizerHandle {
  const win: any = window as any
  const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition
  if (!SpeechRecognition) {
    return {
      start: () => {},
      stop: () => {},
      isSupported: false,
      isListening: () => false,
    }
  }

  const recog = new SpeechRecognition()
  recog.lang = 'en-IN'
  recog.interimResults = true
  recog.maxAlternatives = 1

  let running = false

  recog.onstart = () => { running = true }

  recog.onresult = (ev: SpeechRecognitionEventLike) => {
    const { interim, final } = aggregateTranscriptResults(ev)
    if (final) callbacks.onResult(final.trim(), true)
    else if (interim.trim()) callbacks.onResult(interim.trim(), false)
  }

  recog.onend = () => {
    if (active && active.api === recog) active = null
    running = false
    if (callbacks.onEnd) callbacks.onEnd()
  }

  recog.onerror = (ev: any) => {
    if (callbacks.onError) {
      callbacks.onError({
        error: ev && ev.error,
        message: ev && (ev.message || ev.error),
      })
    }
  }

  const handle: RecognizerHandle = {
    start: () => {
      if (running || (active && active.api === recog)) return
      discardPreviousRecognizer()
      active = { api: recog }
      running = true
      try {
        recog.start()
      } catch (e) {
        running = false
        if (active && active.api === recog) active = null
        console.error('SpeechRecognition.start failed:', e)
        if (callbacks.onError) {
          callbacks.onError({
            error: 'start_failed',
            message: e instanceof Error ? e.message : 'Speech recognition could not start',
          })
        }
      }
    },
    stop: () => {
      running = false
      if (active && active.api === recog) active = null
      try { recog.stop() } catch (e) { /* already stopped */ }
    },
    isSupported: true,
    isListening: () => running,
  }

  return handle
}