import { canJoinConsultation, consultationStatusLabel } from '../src/lib/consultationStatus'

describe('canJoinConsultation', () => {
  test('joinable statuses return true', () => {
    expect(canJoinConsultation('READY')).toBe(true)
    expect(canJoinConsultation('SCHEDULED')).toBe(true)
    expect(canJoinConsultation('IN_PROGRESS')).toBe(true)
  })

  test('non-joinable statuses return false', () => {
    expect(canJoinConsultation('PENDING')).toBe(false)
    expect(canJoinConsultation('REQUESTED')).toBe(false)
    expect(canJoinConsultation('COMPLETED')).toBe(false)
    expect(canJoinConsultation('CANCELLED')).toBe(false)
  })

  test('missing or unknown statuses return false', () => {
    expect(canJoinConsultation(null)).toBe(false)
    expect(canJoinConsultation(undefined)).toBe(false)
    expect(canJoinConsultation('')).toBe(false)
  })
})

describe('consultationStatusLabel', () => {
  test('maps known statuses to human labels', () => {
    expect(consultationStatusLabel('IN_PROGRESS')).toBe('In Progress')
    expect(consultationStatusLabel('READY')).toBe('Ready')
    expect(consultationStatusLabel('SCHEDULED')).toBe('Scheduled')
    expect(consultationStatusLabel('REQUESTED')).toBe('Waiting for Doctor')
    expect(consultationStatusLabel('PENDING')).toBe('Waiting for Doctor')
    expect(consultationStatusLabel('COMPLETED')).toBe('Completed')
    expect(consultationStatusLabel('CANCELLED')).toBe('Cancelled')
  })

  test('falls back to Unknown for missing values', () => {
    expect(consultationStatusLabel(null)).toBe('Unknown')
    expect(consultationStatusLabel(undefined)).toBe('Unknown')
    expect(consultationStatusLabel('')).toBe('Unknown')
  })
})