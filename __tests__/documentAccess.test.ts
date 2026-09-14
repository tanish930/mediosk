import { canReadDocument, canAccessSession } from '../src/lib/documentAccess'

describe('documentAccess.canReadDocument', () => {
  test('PATIENT can read their own document', () => {
    expect(
      canReadDocument({ role: 'PATIENT', documentPatientId: 'patient-a', actorPatientId: 'patient-a' })
    ).toBe(true)
  })

  test('PATIENT cannot read another patient document', () => {
    expect(
      canReadDocument({ role: 'PATIENT', documentPatientId: 'patient-a', actorPatientId: 'patient-b' })
    ).toBe(false)
  })

  test('PATIENT without an actor id cannot read', () => {
    expect(canReadDocument({ role: 'PATIENT', documentPatientId: 'patient-a' })).toBe(false)
  })

  test('DOCTOR can read when assigned to the consultation', () => {
    expect(
      canReadDocument({ role: 'DOCTOR', documentPatientId: 'patient-a', assignedToDoctor: true })
    ).toBe(true)
  })

  test('DOCTOR can read when consent granted for the patient', () => {
    expect(
      canReadDocument({ role: 'DOCTOR', documentPatientId: 'patient-a', consentGranted: true })
    ).toBe(true)
  })

  test('DOCTOR cannot read without assignment or consent', () => {
    expect(canReadDocument({ role: 'DOCTOR', documentPatientId: 'patient-a' })).toBe(false)
  })

  test('HOSPITAL role has no document read access in Phase 1', () => {
    expect(canReadDocument({ role: 'HOSPITAL', documentPatientId: 'patient-a' })).toBe(false)
  })

  test('unknown role is denied', () => {
    expect(canReadDocument({ role: 'ADMIN', documentPatientId: 'patient-a' })).toBe(false)
  })
})

describe('documentAccess.canAccessSession', () => {
  test('session owned by the patient is accessible', () => {
    expect(canAccessSession({ session: { patientId: 'patient-a' }, patientId: 'patient-a' })).toBe(true)
  })

  test("session owned by another patient is not accessible", () => {
    expect(canAccessSession({ session: { patientId: 'patient-b' }, patientId: 'patient-a' })).toBe(false)
  })

  test('missing session is not accessible', () => {
    expect(canAccessSession({ session: null, patientId: 'patient-a' })).toBe(false)
  })
})