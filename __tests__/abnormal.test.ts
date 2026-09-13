import {
  assessAbnormalValue
} from '../src/lib/abnormal'

describe('assessAbnormalValue', () => {
  test('detects a low value', () => {
    expect(assessAbnormalValue('9.2', '12-16')).toEqual({
      status: 'LOW',
      reason: 'Value is below reference range 12-16'
    })
  })

  test('detects a high value', () => {
    expect(assessAbnormalValue('18', '12-16')).toEqual({
      status: 'HIGH',
      reason: 'Value is above reference range 12-16'
    })
  })

  test('detects a normal value', () => {
    expect(assessAbnormalValue('14', '12-16')).toEqual({
      status: 'NORMAL',
      reason: 'Value is within reference range 12-16'
    })
  })

  test('supports en dash ranges', () => {
    expect(assessAbnormalValue('14', '12 – 16').status).toBe('NORMAL')
  })

  test('supports lower bound', () => {
    expect(assessAbnormalValue('3', '>= 5').status).toBe('LOW')
    expect(assessAbnormalValue('6', '>= 5').status).toBe('NORMAL')
  })

  test('supports upper bound', () => {
    expect(assessAbnormalValue('6', '< 5').status).toBe('HIGH')
    expect(assessAbnormalValue('4', '< 5').status).toBe('NORMAL')
  })

  test('returns unknown without a reference range', () => {
    expect(assessAbnormalValue('140/90', undefined).status).toBe('UNKNOWN')
  })

  test('returns unknown for an unrecognized range', () => {
    expect(assessAbnormalValue('10', 'normal')).toEqual({
      status: 'UNKNOWN',
      reason: 'Reference range format not recognized'
    })
  })

  test('returns unknown for non-numeric values', () => {
    expect(assessAbnormalValue('positive', '0-10').status).toBe('UNKNOWN')
  })
})
