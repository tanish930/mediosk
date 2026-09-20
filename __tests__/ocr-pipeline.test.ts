import { prisma } from '../src/lib/prisma'
import { runOCR } from '../src/lib/ocr'
import { extractMedicalData } from '../src/lib/llm'
import { extractFromText } from '../src/lib/extract'
import {
  buildTimelineEntries,
  processOnce,
  STALE_PROCESSING_MS,
  PROCESSING_FAILED_MESSAGE,
  OCR_PROCESSING_FAILED_MESSAGE,
  EXTRACTION_FAILED_MESSAGE,
  EMPTY_OCR_MESSAGE,
} from '../src/scripts/processJobs'

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    documentProcessing: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    medicalDocument: {
      findUnique: jest.fn(),
    },
    extractedMedicalData: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    medicalTimeline: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('../src/lib/ocr', () => ({
  runOCR: jest.fn(),
}))

jest.mock('../src/lib/llm', () => ({
  extractMedicalData: jest.fn(),
}))

const mockedPrisma = {
  documentProcessing: {
    findFirst: prisma.documentProcessing.findFirst as jest.Mock,
    update: prisma.documentProcessing.update as jest.Mock,
  },
  medicalDocument: {
    findUnique: prisma.medicalDocument.findUnique as jest.Mock,
  },
  extractedMedicalData: {
    deleteMany: prisma.extractedMedicalData.deleteMany as jest.Mock,
    create: prisma.extractedMedicalData.create as jest.Mock,
  },
  medicalTimeline: {
    deleteMany: prisma.medicalTimeline.deleteMany as jest.Mock,
    createMany: prisma.medicalTimeline.createMany as jest.Mock,
  },
  $transaction: prisma.$transaction as jest.Mock,
}

const mockedRunOCR = runOCR as jest.MockedFunction<typeof runOCR>

const mockedExtractMedicalData =
  extractMedicalData as jest.MockedFunction<typeof extractMedicalData>

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    documentId: 'doc-1',
    status: 'PENDING',
    error: null,
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    updatedAt: new Date('2026-09-20T10:00:00.000Z'),
    ...overrides,
  } as any
}

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    patientId: 'patient-1',
    url: '/uploads/patient-1/document.pdf',
    ...overrides,
  } as any
}

beforeEach(() => {
  jest.clearAllMocks()

  mockedPrisma.documentProcessing.findFirst.mockResolvedValue(null)
  mockedPrisma.documentProcessing.update.mockResolvedValue({} as any)
  mockedPrisma.medicalDocument.findUnique.mockResolvedValue(
    makeDocument()
  )
  mockedPrisma.extractedMedicalData.deleteMany.mockResolvedValue({ count: 0 })
  mockedPrisma.extractedMedicalData.create.mockResolvedValue({} as any)
  mockedPrisma.medicalTimeline.deleteMany.mockResolvedValue({ count: 0 })
  mockedPrisma.medicalTimeline.createMany.mockResolvedValue({ count: 0 })
  mockedPrisma.$transaction.mockResolvedValue([] as any)

  mockedRunOCR.mockResolvedValue({
    text: 'Hemoglobin: 13.8 g/dL',
    provider: 'mock',
  } as any)

  mockedExtractMedicalData.mockResolvedValue({
    investigations: [
      {
        name: 'Hemoglobin',
        value: '13.8',
        unit: 'g/dL',
      },
    ],
  })
})

describe('processOnce OCR success path', () => {
  test('processes a queued document and stores extraction and timeline', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob() as any
    )

    mockedPrisma.medicalDocument.findUnique.mockResolvedValue(
      makeDocument() as any
    )

    mockedRunOCR.mockResolvedValue({
      text: 'Hemoglobin: 13.8 g/dL',
      provider: 'mock',
    } as any)

    mockedExtractMedicalData.mockResolvedValue({
      investigations: [
        {
          name: 'Hemoglobin',
          value: '13.8',
          unit: 'g/dL',
        },
      ],
    })

    await processOnce()

    expect(mockedRunOCR).toHaveBeenCalledWith(
      '/uploads/patient-1/document.pdf'
    )

    expect(mockedExtractMedicalData).toHaveBeenCalledWith(
      'Hemoglobin: 13.8 g/dL'
    )

    expect(mockedPrisma.$transaction).toHaveBeenCalled()

    expect(mockedPrisma.documentProcessing.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: { status: 'COMPLETED' },
      })
    )
  })

  test('does not invent clinical content when extraction is empty', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob() as any
    )

    mockedRunOCR.mockResolvedValue({
      text: 'This is a synthetic document with no clinical content.',
      provider: 'mock',
    } as any)

    mockedExtractMedicalData.mockResolvedValue({})

    await processOnce()

    expect(mockedPrisma.extractedMedicalData.create).toHaveBeenCalledWith({
      data: {
        documentId: 'doc-1',
        extracted: {},
      },
    })

    expect(mockedPrisma.medicalTimeline.createMany).not.toHaveBeenCalled()

    expect(mockedPrisma.documentProcessing.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: { status: 'COMPLETED' },
      })
    )
  })

  test('returns false when there is no pending job', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(null)

    await expect(processOnce()).resolves.toBe(false)

    expect(mockedRunOCR).not.toHaveBeenCalled()
    expect(mockedExtractMedicalData).not.toHaveBeenCalled()
  })
})

describe('empty OCR handling', () => {
  test('fails safely when OCR returns empty text', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob() as any
    )

    mockedRunOCR.mockResolvedValue({
      text: '',
      provider: 'mock',
    } as any)

    await processOnce()

    expect(mockedExtractMedicalData).not.toHaveBeenCalled()

    expect(mockedPrisma.documentProcessing.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: {
          status: 'FAILED',
          error: EMPTY_OCR_MESSAGE,
        },
      })
    )
  })
})

describe('OCR provider failure', () => {
  test('marks job failed with safe OCR error', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob() as any
    )

    mockedRunOCR.mockRejectedValue(
      new Error('OCR provider internal secret failure')
    )

    await processOnce()

    expect(mockedExtractMedicalData).not.toHaveBeenCalled()

    expect(mockedPrisma.documentProcessing.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: {
          status: 'FAILED',
          error: OCR_PROCESSING_FAILED_MESSAGE,
        },
      })
    )
  })
})

describe('medical extraction failure', () => {
  test('marks job failed with safe extraction error', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob() as any
    )

    mockedRunOCR.mockResolvedValue({
      text: 'Hemoglobin: 13.8 g/dL',
      provider: 'mock',
    } as any)

    mockedExtractMedicalData.mockRejectedValue(
      new Error('LLM provider internal error')
    )

    await processOnce()

    expect(mockedPrisma.documentProcessing.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: {
          status: 'FAILED',
          error: EXTRACTION_FAILED_MESSAGE,
        },
      })
    )
  })
})

describe('downstream transaction failure', () => {
  test('marks job failed when database transaction fails', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob() as any
    )

    mockedPrisma.$transaction.mockRejectedValue(
      new Error('database transaction failed')
    )

    await processOnce()

    expect(mockedPrisma.documentProcessing.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: {
          status: 'FAILED',
          error: PROCESSING_FAILED_MESSAGE,
        },
      })
    )
  })
})

describe('retry and reprocessing idempotency', () => {
  test('reprocessing replaces previous extraction and timeline entries', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob() as any
    )

    mockedRunOCR.mockResolvedValue({
      text: 'Hemoglobin: 13.8 g/dL',
      provider: 'mock',
    } as any)

    mockedExtractMedicalData.mockResolvedValue({
      investigations: [
        {
          name: 'Hemoglobin',
          value: '13.8',
          unit: 'g/dL',
        },
      ],
    })

    await processOnce()

    expect(mockedPrisma.extractedMedicalData.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
    })

    expect(mockedPrisma.medicalTimeline.deleteMany).toHaveBeenCalledWith({
      where: { sourceDocumentId: 'doc-1' },
    })

    expect(mockedPrisma.extractedMedicalData.create).toHaveBeenCalled()
  })

  test('completed jobs are not automatically reprocessed', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(null)

    await processOnce()

    expect(mockedRunOCR).not.toHaveBeenCalled()
    expect(mockedExtractMedicalData).not.toHaveBeenCalled()
  })

  test('failed jobs are not automatically reprocessed unless requeued', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(null)

    await processOnce()

    expect(mockedRunOCR).not.toHaveBeenCalled()
  })
})

describe('worker selection', () => {
  test('selects the oldest pending job', async () => {
    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob({
        id: 'oldest-job',
        createdAt: new Date('2026-09-20T09:00:00.000Z'),
      }) as any
    )

    await processOnce()

    expect(mockedPrisma.documentProcessing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'asc' },
      })
    )
  })

  test('does not process a non-stale processing job', async () => {
    const recent = new Date()

    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob({
        status: 'PROCESSING',
        updatedAt: recent,
      }) as any
    )

    await processOnce()

    expect(mockedRunOCR).not.toHaveBeenCalled()
  })
})

describe('stale processing reclamation', () => {
  test('marks stale processing jobs as failed', async () => {
    const staleDate = new Date(
      Date.now() - STALE_PROCESSING_MS - 60_000
    )

    mockedPrisma.documentProcessing.findFirst.mockResolvedValue(
      makeJob({
        status: 'PROCESSING',
        updatedAt: staleDate,
      }) as any
    )

    await processOnce()

    expect(mockedRunOCR).not.toHaveBeenCalled()

    expect(mockedPrisma.documentProcessing.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'FAILED',
        error: PROCESSING_FAILED_MESSAGE,
      },
    })
  })
})

describe('buildTimelineEntries', () => {
  test('maps diagnoses to diagnosis timeline entries', () => {
    const entries = buildTimelineEntries(
      {
        id: 'doc-1',
        patientId: 'patient-1',
      },
      {
        diagnoses: ['Hypertension'],
      }
    )

    expect(entries).toEqual([
      expect.objectContaining({
        patientId: 'patient-1',
        title: 'Hypertension',
        entryType: 'DIAGNOSIS',
        sourceDocumentId: 'doc-1',
      }),
    ])
  })

  test('maps medicines to medicine timeline entries', () => {
    const entries = buildTimelineEntries(
      {
        id: 'doc-1',
        patientId: 'patient-1',
      },
      {
        medicines: [
          {
            name: 'Paracetamol',
            dosage: '500 mg',
            frequency: 'twice a day',
          },
        ],
      }
    )

    expect(entries).toEqual([
      expect.objectContaining({
        patientId: 'patient-1',
        title: 'Paracetamol 500 mg',
        entryType: 'MEDICINE',
        sourceDocumentId: 'doc-1',
      }),
    ])
  })

  test('maps procedures to procedure timeline entries', () => {
    const entries = buildTimelineEntries(
      {
        id: 'doc-1',
        patientId: 'patient-1',
      },
      {
        procedures: [
          {
            name: 'Appendectomy',
            date: '2026-09-18',
          },
        ],
      }
    )

    expect(entries).toEqual([
      expect.objectContaining({
        patientId: 'patient-1',
        title: 'Appendectomy',
        entryType: 'PROCEDURE',
        sourceDocumentId: 'doc-1',
      }),
    ])
  })

  test('maps investigations and preserves abnormal status', () => {
    const entries = buildTimelineEntries(
      {
        id: 'doc-1',
        patientId: 'patient-1',
      },
      {
        investigations: [
          {
            name: 'Fasting Blood Glucose',
            value: '108',
            unit: 'mg/dL',
            referenceRange: '70-99',
          },
        ],
      }
    )

    expect(entries).toEqual([
      expect.objectContaining({
        patientId: 'patient-1',
        title: 'Fasting Blood Glucose: 108 mg/dL',
        details: expect.stringContaining('HIGH'),
        entryType: 'INVESTIGATION',
        sourceDocumentId: 'doc-1',
      }),
    ])
  })

  test('marks unknown investigation status when reference range is unavailable', () => {
    const entries = buildTimelineEntries(
      {
        id: 'doc-1',
        patientId: 'patient-1',
      },
      {
        investigations: [
          {
            name: 'Hemoglobin',
            value: '13.8',
            unit: 'g/dL',
          },
        ],
      }
    )

    expect(entries).toEqual([
      expect.objectContaining({
        patientId: 'patient-1',
        title: 'Hemoglobin: 13.8 g/dL',
        details: 'AI/OCR Generated — investigation',
        entryType: 'INVESTIGATION',
      }),
    ])
  })

  test('returns an empty array for empty extraction', () => {
    const entries = buildTimelineEntries(
      {
        id: 'doc-1',
        patientId: 'patient-1',
      },
      {}
    )

    expect(entries).toEqual([])
  })
})

describe('vertical laboratory OCR extraction', () => {
  test('reconstructs investigations, medication, clinical note, and date from OCR.Space output', () => {
    const ocrText = `DEMO MEDICAL LABORATORY REPORT
Patient: Aarav Sharma
Report date: 18 September 2026
Complete Blood Count (CBC)
Investigation
Result
Hemoglobin
13.8
Total WBC Count
7200
Platelet Count
245000
Fasting Blood Glucose
108
Unit
g/dL
cells/uL
cells/uL
mg/dL
Clinical note: Patient reports mild fatigue for approximately one week.
Current medication: Paracetamol 500 mg, as needed for fever.
Important: Synthetic document created only for software testing.
Reference Range
12.0-16.0
4000-11000
150000-450000
70-99`

    const result = extractFromText(ocrText)

    expect(result.investigations).toEqual([
      {
        name: 'Hemoglobin',
        value: '13.8',
        unit: 'g/dL',
        referenceRange: '12.0-16.0',
      },
      {
        name: 'Total WBC Count',
        value: '7200',
        unit: 'cells/uL',
        referenceRange: '4000-11000',
      },
      {
        name: 'Platelet Count',
        value: '245000',
        unit: 'cells/uL',
        referenceRange: '150000-450000',
      },
      {
        name: 'Fasting Blood Glucose',
        value: '108',
        unit: 'mg/dL',
        referenceRange: '70-99',
      },
    ])

    expect(result.medicines).toEqual([
      {
        name: 'Paracetamol',
        dosage: '500 mg',
        frequency: 'as needed for fever',
      },
    ])

    expect(result.findings).toEqual([
      'Patient reports mild fatigue for approximately one week.',
    ])

    expect(result.dates).toEqual(['18 September 2026'])
  })
})