import {
  aggregateTranscriptResults,
  canUseSpeechRecognition,
  canUseSpeechSynthesis,
  createRecognizer,
} from '../src/lib/voice'

type Listener = ((ev?: any) => void) | null

class FakeSpeechRecognition {
  lang = ''
  interimResults = false
  maxAlternatives = 1
  onstart: Listener = null
  onresult: Listener = null
  onend: Listener = null
  onerror: Listener = null
  startCalls = 0
  stopCalls = 0
  abortCalls = 0
  throwOnStart = false
  throwOnStop = false

  static instances: FakeSpeechRecognition[] = []

  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }

  start() {
    this.startCalls += 1
    if (this.throwOnStart) throw new Error('recognition already started')
    if (this.onstart) this.onstart()
  }

  stop() {
    this.stopCalls += 1
    if (this.throwOnStop) throw new Error('no recognition started')
  }

  abort() {
    this.abortCalls += 1
  }

  emitResult(transcript: string, isFinal: boolean) {
    if (this.onresult) {
      this.onresult({ resultIndex: 0, results: [{ isFinal, 0: { transcript } }] })
    }
  }

  emitError(error: string) {
    if (this.onerror) this.onerror({ error })
  }

  emitEnd() {
    if (this.onend) this.onend()
  }
}

describe('aggregateTranscriptResults', () => {
  test('combines interim and final results', () => {
    const ev = {
      resultIndex: 0,
      results: [
        { isFinal: false, 0: { transcript: 'head' } },
        { isFinal: true, 0: { transcript: 'ache' } },
      ],
    }
    expect(aggregateTranscriptResults(ev as any)).toEqual({ interim: 'head', final: 'ache' })
  })

  test('respects resultIndex', () => {
    const ev = {
      resultIndex: 1,
      results: [
        { isFinal: false, 0: { transcript: 'skip' } },
        { isFinal: true, 0: { transcript: 'kept' } },
      ],
    }
    expect(aggregateTranscriptResults(ev as any)).toEqual({ interim: '', final: 'kept' })
  })

  test('returns empty strings for empty results', () => {
    expect(aggregateTranscriptResults({ resultIndex: 0, results: [] } as any)).toEqual({
      interim: '',
      final: '',
    })
  })
})

describe('voice.ts feature detection', () => {
  const realWindow = (global as any).window

  afterEach(() => {
    (global as any).window = realWindow
  })

  test('reports no support without window APIs', () => {
    (global as any).window = {}
    expect(canUseSpeechRecognition()).toBe(false)
    expect(canUseSpeechSynthesis()).toBe(false)
  })

  test('reports support when SpeechRecognition is present', () => {
    (global as any).window = { SpeechRecognition: FakeSpeechRecognition }
    expect(canUseSpeechRecognition()).toBe(true)
  })
})

describe('createRecognizer lifecycle', () => {
  const realWindow = (global as any).window

  beforeEach(() => {
    FakeSpeechRecognition.instances = []
    ;(global as any).window = { SpeechRecognition: FakeSpeechRecognition }
  })

  afterEach(() => {
    (global as any).window = realWindow
  })

  test('returns unsupported handle when API is missing', () => {
    ;(global as any).window = {}
    const r = createRecognizer({ onResult: jest.fn() })
    expect(r.isSupported).toBe(false)
    expect(r.isListening()).toBe(false)
    expect(() => r.start()).not.toThrow()
    expect(() => r.stop()).not.toThrow()
  })

  test('configures en-IN recognition and delivers result/end callbacks', () => {
    const onResult = jest.fn()
    const onEnd = jest.fn()
    const r = createRecognizer({ onResult, onEnd })
    expect(r.isSupported).toBe(true)
    const inst = FakeSpeechRecognition.instances[0]
    expect(inst.lang).toBe('en-IN')
    expect(inst.interimResults).toBe(true)
    expect(inst.maxAlternatives).toBe(1)

    r.start()
    inst.emitResult('head', false)
    expect(onResult).toHaveBeenLastCalledWith('head', false)
    inst.emitResult('headache', true)
    expect(onResult).toHaveBeenLastCalledWith('headache', true)
    inst.emitEnd()
    expect(onEnd).toHaveBeenCalled()
    expect(r.isListening()).toBe(false)
  })

  test('final transcript is delivered before onend and remains after', () => {
    const onResult = jest.fn()
    const onEnd = jest.fn()
    const r = createRecognizer({ onResult, onEnd })
    r.start()
    const inst = FakeSpeechRecognition.instances[0]
    inst.emitResult('two days', true)
    inst.emitEnd()
    expect(onResult).toHaveBeenLastCalledWith('two days', true)
    expect(onEnd).toHaveBeenCalled()
    expect(r.isListening()).toBe(false)
  })

  test('does not forward empty interim results', () => {
    const onResult = jest.fn()
    createRecognizer({ onResult }).start()
    FakeSpeechRecognition.instances[0].emitResult('', false)
    expect(onResult).not.toHaveBeenCalled()
  })

  test('ignores a second start while already listening', () => {
    const r = createRecognizer({ onResult: jest.fn() })
    r.start()
    r.start()
    expect(FakeSpeechRecognition.instances[0].startCalls).toBe(1)
  })

  test('discards the previous recognizer before starting a new one', () => {
    const onResultA = jest.fn()
    const onEndA = jest.fn()
    const a = createRecognizer({ onResult: onResultA, onEnd: onEndA })
    a.start()
    const instA = FakeSpeechRecognition.instances[0]

    const onEndB = jest.fn()
    const b = createRecognizer({ onResult: jest.fn(), onEnd: onEndB })
    b.start()

    expect(instA.abortCalls).toBeGreaterThanOrEqual(1)
    expect(instA.onend).toBeNull()

    // Stale events from the discarded session must never reach either callback set.
    instA.emitEnd()
    instA.emitResult('stale', true)
    expect(onEndA).not.toHaveBeenCalled()
    expect(onResultA).not.toHaveBeenCalled()
    expect(b.isListening()).toBe(true)
  })

  test('forwards onerror information to the caller', () => {
    const onError = jest.fn()
    const r = createRecognizer({ onResult: jest.fn(), onError })
    r.start()
    FakeSpeechRecognition.instances[0].emitError('not-allowed')
    expect(onError).toHaveBeenCalled()
    expect(onError.mock.calls[0][0]).toMatchObject({ error: 'not-allowed' })
  })

  test('surfaces start failure and recovers on a later recognizer', () => {
    const onError = jest.fn()
    const r = createRecognizer({ onResult: jest.fn(), onError })
    FakeSpeechRecognition.instances[0].throwOnStart = true
    r.start()

    expect(onError).toHaveBeenCalled()
    expect(r.isListening()).toBe(false)

    const r2 = createRecognizer({ onResult: jest.fn() })
    r2.start()
    expect(FakeSpeechRecognition.instances[1].startCalls).toBe(1)
    expect(r2.isListening()).toBe(true)
  })

  test('stop() stops the underlying recognizer', () => {
    const r = createRecognizer({ onResult: jest.fn() })
    r.start()
    r.stop()
    expect(FakeSpeechRecognition.instances[0].stopCalls).toBe(1)
    expect(r.isListening()).toBe(false)
  })

  test('stop() tolerates a recognizer that was never started', () => {
    const r = createRecognizer({ onResult: jest.fn() })
    FakeSpeechRecognition.instances[0].throwOnStop = true
    expect(() => r.stop()).not.toThrow()
  })

  test('natural silence end clears listening so the patient can restart or type', () => {
    const onEnd = jest.fn()
    const r = createRecognizer({ onResult: jest.fn(), onEnd })
    r.start()
    expect(r.isListening()).toBe(true)
    FakeSpeechRecognition.instances[0].emitEnd()
    expect(onEnd).toHaveBeenCalled()
    expect(r.isListening()).toBe(false)
  })
})