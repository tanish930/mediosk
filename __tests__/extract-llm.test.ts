import * as llm from '../src/lib/llm'
import { extractFromText } from '../src/lib/extract'

describe('LLM Medical Extraction', () => {
  const originalEnv = process.env
  let fetchSpy: jest.Mock

  beforeAll(() => {
    process.env = { ...originalEnv, LLM_API_KEY: 'test-key', LLM_PROVIDER: 'openai' }
  })

  beforeEach(() => {
    fetchSpy = jest.fn()
    global.fetch = fetchSpy as any
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('valid extraction (Diabetes + Telmisartan)', async () => {
    const mockOutput = JSON.stringify({
      diagnoses: ['Diabetes Mellitus Type 2'],
      medicines: [{ name: 'Telmisartan', dosage: '40mg', frequency: 'once daily' }]
    })
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: mockOutput } }] })
    })

    const result = await llm.extractMedicalDataLLM('Patient has Diabetes Mellitus Type 2. Prescribed Telmisartan 40mg once daily.')
    
    expect(result.diagnoses).toContain('Diabetes Mellitus Type 2')
    expect(result.medicines?.[0].name).toBe('Telmisartan')
    expect(result.medicines?.[0].dosage).toBe('40mg')
  })

  test('strict grounding: BP 140/90 should not invent "Hypertension"', async () => {
    const mockOutput = JSON.stringify({
      investigations: [{ name: 'Blood Pressure', value: '140/90', unit: 'mmHg' }],
      diagnoses: [] 
    })
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: mockOutput } }] })
    })

    const result = await llm.extractMedicalDataLLM('Vitals: BP 140/90, Pulse 72.')
    
    expect(result.investigations?.[0].name).toBe('Blood Pressure')
    expect(result.investigations?.[0].value).toBe('140/90')
    expect(result.diagnoses || []).not.toContain('Hypertension')
  })

  test('partial/unreadable data handling', async () => {
    const mockOutput = JSON.stringify({
      medicines: [{ name: 'Telmi...', dosage: '40mg' }]
    })
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: mockOutput } }] })
    })

    const result = await llm.extractMedicalDataLLM('Medicine: Telmi... 40mg')
    expect(result.medicines?.[0].name).toBe('Telmi...')
  })

  test('empty text handling', async () => {
    const result = await llm.extractMedicalDataLLM('   ')
    expect(result).toEqual({})
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('fallback mechanism: regex extraction used when LLM fails', async () => {
    fetchSpy.mockRejectedValue(new Error('API Timeout'))
    
    const text = 'Diagnosis: Hypertension\nDate: 2026-09-12'
    const result = await llm.extractMedicalData(text)
    
    // Assert actual fallback behavior matches existing regex logic
    expect(result).toEqual(extractFromText(text))
  })

  test('fallback mechanism: regex extraction used when LLM returns invalid JSON', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'This is not JSON' } }] })
    })
    
    const text = 'Diagnosis: Diabetes'
    const result = await llm.extractMedicalData(text)
    
    // Assert actual fallback behavior matches existing regex logic
    expect(result).toEqual(extractFromText(text))
  })
})
