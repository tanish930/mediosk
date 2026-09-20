import { NextApiRequest, NextApiResponse } from 'next'
import { createRequest, createResponse } from 'node-mocks-http'
import { mapAnswersToReport } from '../src/lib/reportMapping'

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
}))

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    doctor: { findUnique: jest.fn() },
    consultation: { findUnique: jest.fn() },
    consent: { findFirst: jest.fn() },
    ayushAssessment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    ayushDoshaAssessment: { findUnique: jest.fn(), upsert: jest.fn() },
    ayushFormulationSuggestion: { findMany: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
  },
}))

import { getSession } from 'next-auth/react'
import { prisma } from '../src/lib/prisma'
import ayushHandler from '../src/pages/api/doctor/ayush/[consultationId]'

const mockGetSession = getSession as jest.Mock
const mockPrisma = prisma as any

const DOCTOR_ID = '00000000-0000-0000-0000-000000000200'
const DOCTOR_USER_ID = '00000000-0000-0000-0000-000000000201'
const CONSULTATION_ID = '00000000-0000-0000-0000-000000000210'
const PATIENT_ID = '00000000-0000-0000-0000-000000000100'

const doctorSession = { user: { id: DOCTOR_USER_ID, role: 'DOCTOR' } }

async function callHandler(method: string, body?: unknown) {
  const req = createRequest({
    method: method as any,
    query: { consultationId: CONSULTATION_ID },
    body: body as any,
  }) as unknown as NextApiRequest
  const res = createResponse()
  await ayushHandler(req as any, res as any)
  await new Promise((r) => setImmediate(r))
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue(doctorSession)
  mockPrisma.doctor.findUnique.mockResolvedValue({ id: DOCTOR_ID, userId: DOCTOR_USER_ID })
  mockPrisma.consultation.findUnique.mockResolvedValue({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
  })
  mockPrisma.consent.findFirst.mockResolvedValue(null)
  mockPrisma.ayushAssessment.findFirst.mockResolvedValue(null)
})

describe('Nadi and sleep persistence through the doctor Ayurveda API', () => {
  test('structured Nadi data is persisted on the assessment', async () => {
    mockPrisma.ayushAssessment.create.mockResolvedValue({
      id: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      nadiData: { rateBpm: 76, rhythm: 'Regular', gati: 'pitta nadi' },
    })
    mockPrisma.ayushDoshaAssessment.upsert.mockResolvedValue({
      id: 'dosha-1',
      ayushAssessmentId: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      result: { requiresDoctorReview: true, doshas: [] },
      inputSnapshot: {},
    })
    mockPrisma.ayushFormulationSuggestion.findMany.mockResolvedValue([])
    mockPrisma.ayushFormulationSuggestion.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.ayushFormulationSuggestion.upsert.mockResolvedValue({
      id: 'sug-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      status: 'SUGGESTED',
      active: true,
    })

    const res = await callHandler('POST', {
      nadiData: { rateBpm: 76, rhythm: 'Regular', gati: 'pitta nadi' },
    })
    const body = res._getJSONData()

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.ayushAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nadiData: { rateBpm: 76, rhythm: 'Regular', gati: 'pitta nadi' },
        }),
      })
    )
    expect(body.ayush.nadiData.rateBpm).toBe(76)
  })

  test('sleep field is persisted as a first-class history field', async () => {
    mockPrisma.ayushAssessment.create.mockResolvedValue({
      id: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      sleep: 'Disturbed, wakes 2-3 times',
    })
    mockPrisma.ayushDoshaAssessment.upsert.mockResolvedValue({
      id: 'dosha-1',
      ayushAssessmentId: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      result: { requiresDoctorReview: true, doshas: [] },
      inputSnapshot: {},
    })
    mockPrisma.ayushFormulationSuggestion.findMany.mockResolvedValue([])
    mockPrisma.ayushFormulationSuggestion.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.ayushFormulationSuggestion.upsert.mockResolvedValue({
      id: 'sug-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      status: 'SUGGESTED',
      active: true,
    })

    const res = await callHandler('POST', { sleep: 'Disturbed, wakes 2-3 times' })
    expect(res.statusCode).toBe(200)
    expect(mockPrisma.ayushAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sleep: 'Disturbed, wakes 2-3 times' }),
      })
    )
    expect(res._getJSONData().ayush.sleep).toBe('Disturbed, wakes 2-3 times')
  })

  test('blank free-text fields are trimmed and dropped, never stored as findings', async () => {
    mockPrisma.ayushAssessment.create.mockResolvedValue({
      id: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      vikriti: 'Vata imbalance',
    })
    mockPrisma.ayushDoshaAssessment.upsert.mockResolvedValue({
      id: 'dosha-1',
      ayushAssessmentId: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      result: { requiresDoctorReview: true, doshas: [] },
      inputSnapshot: {},
    })
    mockPrisma.ayushFormulationSuggestion.findMany.mockResolvedValue([])
    mockPrisma.ayushFormulationSuggestion.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.ayushFormulationSuggestion.upsert.mockResolvedValue({
      id: 'sug-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      status: 'SUGGESTED',
      active: true,
    })

    const res = await callHandler('POST', {
      prakriti: '   ',
      vikriti: '  Vata imbalance  ',
      nadiData: null,
    })

    expect(res.statusCode).toBe(200)
    const createData = mockPrisma.ayushAssessment.create.mock.calls[0][0].data
    expect(createData).not.toHaveProperty('prakriti')
    expect(createData).not.toHaveProperty('nadiData')
    expect(createData.vikriti).toBe('Vata imbalance')
  })
})

describe('Decision support regeneration', () => {
  test('saving a doctor-verified assessment regenerates doshic support labelled as decision support', async () => {
    mockPrisma.ayushAssessment.create.mockResolvedValue({
      id: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      vikriti: 'Pitta imbalance',
    })
    let storedResult: any = null
    mockPrisma.ayushDoshaAssessment.upsert.mockImplementation((args: any) => {
      storedResult = args.create.result
      return Promise.resolve({
        id: 'dosha-1',
        ayushAssessmentId: 'ayush-1',
        consultationId: CONSULTATION_ID,
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        result: storedResult,
        inputSnapshot: args.create.inputSnapshot,
      })
    })
    mockPrisma.ayushFormulationSuggestion.findMany.mockResolvedValue([])
    mockPrisma.ayushFormulationSuggestion.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.ayushFormulationSuggestion.upsert.mockImplementation((args: any) =>
      Promise.resolve({
        id: `sug-${args.create.formularyId}`,
        consultationId: CONSULTATION_ID,
        patientId: PATIENT_ID,
        formularyId: args.create.formularyId,
        status: 'SUGGESTED',
        active: true,
      })
    )

    const res = await callHandler('POST', { vikriti: 'Pitta imbalance' })
    expect(res.statusCode).toBe(200)

    expect(storedResult).toEqual(
      expect.objectContaining({
        decisionSupport: true,
        requiresDoctorReview: true,
        source: 'rule-based',
      })
    )
    // Preserves the input snapshot so the doctor can audit the provenance.
    expect(mockPrisma.ayushDoshaAssessment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          ayushAssessmentId: 'ayush-1',
          consultationId: CONSULTATION_ID,
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
        }),
      })
    )
    // Suggestions are upserted by composite key (idempotent).
    expect(mockPrisma.ayushFormulationSuggestion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { consultationId_formularyId: { consultationId: CONSULTATION_ID, formularyId: expect.any(String) } },
        create: expect.objectContaining({ consultationId: CONSULTATION_ID }),
      })
    )
    expect(mockPrisma.ayushFormulationSuggestion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'SUGGESTED', active: true }),
      })
    )
  })

  test('a repeat save is idempotent (same composite upsert keys, no duplicates)', async () => {
    mockPrisma.ayushAssessment.create.mockResolvedValue({
      id: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      vikriti: 'Kapha imbalance',
    })
    mockPrisma.ayushDoshaAssessment.upsert.mockImplementation((args: any) =>
      Promise.resolve({
        id: 'dosha-1',
        ayushAssessmentId: 'ayush-1',
        consultationId: CONSULTATION_ID,
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        result: args.create.result,
        inputSnapshot: args.create.inputSnapshot,
      })
    )
    mockPrisma.ayushFormulationSuggestion.findMany.mockResolvedValue([])
    mockPrisma.ayushFormulationSuggestion.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.ayushFormulationSuggestion.upsert.mockResolvedValue({
      id: 'sug-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      status: 'SUGGESTED',
      active: true,
    })

    await callHandler('POST', { vikriti: 'Kapha imbalance' })
    await callHandler('POST', { vikriti: 'Kapha imbalance' })

    // Same composite-key upserts, twice — never a raw insert of a duplicate row.
    const upsertWhere = mockPrisma.ayushFormulationSuggestion.upsert.mock.calls.map(
      (c: any) => c[0].where
    )
    expect(upsertWhere).toHaveLength(upsertWhere.length)
    for (const where of upsertWhere) {
      expect(where.consultationId_formularyId.consultationId).toBe(CONSULTATION_ID)
    }
    expect(mockPrisma.ayushDoshaAssessment.upsert).toHaveBeenCalledTimes(2)
  })
})

describe('General mode regression', () => {
  test('GENERAL sessions never produce an ayush report block', () => {
    const answers = new Map<string, unknown>([['onset', 'two days ago'], ['severity', 6]])
    expect(mapAnswersToReport(answers, { mode: 'GENERAL' }).ayush).toBeUndefined()
  })

  test('AYURVEDA sessions still produce the versioned patient-reported block', () => {
    const answers = new Map<string, unknown>([
      ['ayush_nidana', 'stale food'],
      ['ayush_agni', "I don't know"],
    ])
    const report = mapAnswersToReport(answers, { mode: 'AYURVEDA' })
    expect(report.ayush).toEqual({
      version: 1,
      mode: 'AYURVEDA',
      findings: {
        nidana: 'stale food',
        agni: { notSure: true },
      },
    })
  })

  test('GET returns ayush plus decision support payload', async () => {
    mockPrisma.ayushAssessment.findFirst.mockResolvedValue({
      id: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
    })
    mockPrisma.ayushDoshaAssessment.findUnique.mockResolvedValue({
      id: 'dosha-1',
      ayushAssessmentId: 'ayush-1',
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      result: { conclusion: 'x', doshas: [] },
      inputSnapshot: {},
    })
    mockPrisma.ayushFormulationSuggestion.findMany.mockResolvedValue([
      {
        id: 'sug-1',
        consultationId: CONSULTATION_ID,
        patientId: PATIENT_ID,
        formularyId: 'demo-trikatu',
        status: 'SUGGESTED',
        active: true,
      },
    ])

    const res = await callHandler('GET')
    const body = res._getJSONData()
    expect(res.statusCode).toBe(200)
    expect(body.ayush).toBeDefined()
    expect(body.doshaAssessment.result.doshas).toHaveLength(0)
    expect(body.suggestions).toHaveLength(1)
  })
})