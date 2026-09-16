import {
  isDontKnowResponse,
  isPreferNotToAnswer,
  isSkipResponse,
  DONT_KNOW_VALUE,
  PREFER_NOT_TO_ANSWER_VALUE,
} from '../src/lib/responseQualifiers'

describe('Response Qualifiers', () => {
  describe('isDontKnowResponse', () => {
    test('recognises standard English phrases', () => {
      expect(isDontKnowResponse("I don't know")).toBe(true)
      expect(isDontKnowResponse('Dont know')).toBe(true)
      expect(isDontKnowResponse('not sure')).toBe(true)
      expect(isDontKnowResponse('no idea')).toBe(true)
      expect(isDontKnowResponse('')).toBe(false)
      expect(isDontKnowResponse(null)).toBe(false)
    })

    test('recognises Hindi phrases', () => {
      expect(isDontKnowResponse('मुझे नहीं पता')).toBe(true)
      expect(isDontKnowResponse('नहीं पता')).toBe(true)
      expect(isDontKnowResponse('pata nahi')).toBe(true)
      expect(isDontKnowResponse('nahi pata')).toBe(true)
    })

    test('recognises Marathi phrases', () => {
      expect(isDontKnowResponse('मला माहित नाही')).toBe(true)
      expect(isDontKnowResponse('mahit nahi')).toBe(true)
    })

    test('returns false for normal symptom text', () => {
      expect(isDontKnowResponse('sharp pain in left knee')).toBe(false)
      expect(isDontKnowResponse('chest pain')).toBe(false)
      expect(isDontKnowResponse(7)).toBe(false)
    })
  })

  describe('isPreferNotToAnswer', () => {
    test('recognises standard phrases', () => {
      expect(isPreferNotToAnswer('Prefer not to answer')).toBe(true)
      expect(isPreferNotToAnswer('PREFER NOT TO ANSWER')).toBe(true)
      expect(isPreferNotToAnswer('skip')).toBe(true)
      expect(isPreferNotToAnswer('rather not say')).toBe(true)
    })

    test('recognises Hindi phrases', () => {
      expect(isPreferNotToAnswer('नहीं बताना चाहते')).toBe(true)
      expect(isPreferNotToAnswer('nahi batana')).toBe(true)
    })

    test('recognises Marathi phrases', () => {
      expect(isPreferNotToAnswer('सांगायचं नाही')).toBe(true)
      expect(isPreferNotToAnswer('sangaychay nahi')).toBe(true)
    })

    test('returns false for normal text', () => {
      expect(isPreferNotToAnswer('I take paracetamol')).toBe(false)
      expect(isPreferNotToAnswer(0)).toBe(false)
    })
  })

  describe('isSkipResponse', () => {
    test('is the union of the two qualifiers', () => {
      expect(isSkipResponse(DONT_KNOW_VALUE)).toBe(true)
      expect(isSkipResponse(PREFER_NOT_TO_ANSWER_VALUE)).toBe(true)
      expect(isSkipResponse('I have headache')).toBe(false)
    })
  })
})