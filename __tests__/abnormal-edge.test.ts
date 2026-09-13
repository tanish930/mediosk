import { assessAbnormalValue } from '../src/lib/abnormal'

describe('assessAbnormalValue edge cases', () => {
  test('does not classify composite blood pressure values', () => {
    expect(assessAbnormalValue('140/90', '120-129').status).toBe('UNKNOWN')
  })

  test('handles inclusive lower bound equality', () => {
    expect(assessAbnormalValue('5', '>= 5').status).toBe('NORMAL')
  })

  test('handles inclusive upper bound equality', () => {
    expect(assessAbnormalValue('5', '<= 5').status).toBe('NORMAL')
  })

  test('handles exclusive lower bound equality', () => {
    expect(assessAbnormalValue('5', '> 5').status).toBe('LOW')
  })

  test('handles exclusive upper bound equality', () => {
    expect(assessAbnormalValue('5', '< 5').status).toBe('HIGH')
  })
})
