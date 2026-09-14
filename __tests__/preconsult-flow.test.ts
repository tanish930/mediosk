import { parsePreconsultIntent } from '../src/lib/preconsultFlow'

describe('parsePreconsultIntent', () => {
  test('bare path resumes the latest session (default)', () => {
    expect(parsePreconsultIntent({})).toEqual({ newFlow: false, sessionId: null })
  })

  test('?new=1 requests a brand-new flow with no auto-resume', () => {
    expect(parsePreconsultIntent({ new: '1' })).toEqual({ newFlow: true, sessionId: null })
  })

  test('?new=true also requests a new flow', () => {
    expect(parsePreconsultIntent({ new: 'true' })).toEqual({ newFlow: true, sessionId: null })
  })

  test('?session=<id> operates on that exact session', () => {
    expect(parsePreconsultIntent({ session: 'session-123' })).toEqual({ newFlow: false, sessionId: 'session-123' })
  })

  test('an explicit session id wins over the new-flow flag', () => {
    expect(parsePreconsultIntent({ new: '1', session: 'session-123' })).toEqual({
      newFlow: false,
      sessionId: 'session-123',
    })
  })

  test('array query values use the first element', () => {
    expect(parsePreconsultIntent({ new: ['1', '0'], session: ['session-456'] })).toEqual({
      newFlow: false,
      sessionId: 'session-456',
    })
    expect(parsePreconsultIntent({ new: ['1'] })).toEqual({ newFlow: true, sessionId: null })
  })

  test('empty values are treated as absent', () => {
    expect(parsePreconsultIntent({ new: '', session: '' })).toEqual({ newFlow: false, sessionId: null })
  })
})