import { QuestionType } from '@prisma/client'

export interface AnsweredQuestion {
  key: string
  value: any
}

export interface AdaptiveQuestion {
  key: string
  text: string
  type: QuestionType
}

// Check if any answer indicates an emergency (Red Flags)
export function checkEmergencyRedFlags(answers: AnsweredQuestion[], complaint: string): boolean {
  const combinedText = [
    complaint,
    ...answers.map(a => typeof a.value === 'string' ? a.value : '')
  ].join(' ').toLowerCase()

  const emergencyPatterns = [
    'chest pain',
    'shortness of breath',
    'breathless',
    'unconscious',
    'loss of consciousness',
    'severe bleeding',
    'heavy bleeding',
    'severe head injury',
    'sudden weakness',
    'sudden numbness',
    'slurred speech'
  ]

  // Check for negations
  const negationPatterns = ['no ', 'not ', 'none ', 'without ', 'never ', "don't ", "doesn't "]
  
  for (const p of emergencyPatterns) {
    if (combinedText.includes(p)) {
      // Check if it's negated
      let isNegated = false
      for (const neg of negationPatterns) {
        if (combinedText.includes(neg + p)) {
          isNegated = true
          break
        }
      }
      if (!isNegated) return true
    }
  }

  // Also check if severity is extremely high
  const severityAnswer = answers.find(a => a.key === 'severity')
  if (severityAnswer) {
    const sevNum = Number(severityAnswer.value)
    if (!Number.isNaN(sevNum) && sevNum >= 9) {
      return true
    }
  }

  return false
}

// Standard follow-ups to ask based on domain
export function getNextAdaptiveQuestion(
  domain: string,
  answers: AnsweredQuestion[],
  complaint: string
): AdaptiveQuestion | null {
  // If emergency red flag is found, halt questioning (return null to finish early)
  if (checkEmergencyRedFlags(answers, complaint)) {
    return null
  }

  const answeredKeys = new Set(answers.map(a => a.key))

  // Helper to find an answer value by key
  const getVal = (key: string) => answers.find(a => a.key === key)?.value

  // Step 1: Chief complaint is usually the start.
  if (!answeredKeys.has('chief_complaint')) {
    const text = domain === 'respiratory'
      ? 'What respiratory symptom brought you here (e.g., cough, breathlessness, chest pain)?'
      : domain === 'gastrointestinal'
      ? 'What abdominal or digestive symptom are you experiencing (e.g., pain, vomiting, diarrhea)?'
      : domain === 'neurology'
      ? 'What neurological symptom are you experiencing (e.g., headache, dizziness, numbness)?'
      : domain === 'musculoskeletal'
      ? 'Which joint, muscle, or bone symptom are you experiencing?'
      : 'Please describe your main complaint in a sentence.'
    return { key: 'chief_complaint', text, type: 'TEXT' }
  }

  // Step 2: Onset
  if (!answeredKeys.has('onset')) {
    const text = domain === 'respiratory'
      ? 'When did your breathing difficulty or cough start?'
      : domain === 'gastrointestinal'
      ? 'When did this digestive issue or pain start?'
      : domain === 'neurology'
      ? 'When did this headache, dizziness, or numbness start?'
      : domain === 'musculoskeletal'
      ? 'When did this joint or muscle pain start?'
      : 'When did this symptom start?'
    return { key: 'onset', text, type: 'TEXT' }
  }

  // Step 3: Duration
  if (!answeredKeys.has('duration')) {
    const text = domain === 'respiratory'
      ? 'How long has this breathing pattern or cough lasted?'
      : domain === 'gastrointestinal'
      ? 'How long has this pain or discomfort lasted?'
      : domain === 'neurology'
      ? 'How long did or does the episode last?'
      : domain === 'musculoskeletal'
      ? 'How long have you had this stiffness or pain?'
      : 'How long has this symptom been occurring?'
    return { key: 'duration', text, type: 'TEXT' }
  }

  // Step 4: Location
  if (!answeredKeys.has('location')) {
    const text = domain === 'respiratory'
      ? 'Do you feel the discomfort mainly in your chest, throat, or nose?'
      : domain === 'gastrointestinal'
      ? 'Where exactly in your abdomen is the pain located (e.g., upper, lower, left, right)?'
      : domain === 'neurology'
      ? 'Where is the head pain, numbness, or weakness located?'
      : domain === 'musculoskeletal'
      ? 'Which specific joint or muscle is affected?'
      : 'Where exactly on your body is this felt?'
    return { key: 'location', text, type: 'TEXT' }
  }

  // Step 5: Severity
  if (!answeredKeys.has('severity')) {
    const text = domain === 'respiratory'
      ? 'On a scale of 1-10, how severe is your breathlessness or chest discomfort?'
      : domain === 'gastrointestinal'
      ? 'On a scale of 1-10, how severe is the abdominal pain or discomfort?'
      : domain === 'neurology'
      ? 'On a scale of 1-10, how severe is this symptom?'
      : domain === 'musculoskeletal'
      ? 'On a scale of 1-10, how severe is the joint or muscle pain?'
      : 'How severe is the problem on a scale of 1-10?'
    return { key: 'severity', text, type: 'NUMBER' }
  }

  // Step 6: Character/Quality
  if (!answeredKeys.has('character')) {
    const text = domain === 'respiratory'
      ? 'Is the cough dry or wet? Is the breathlessness constant or does it come in spells?'
      : domain === 'gastrointestinal'
      ? 'Describe the pain character (e.g., burning, cramping, sharp, dull ache).'
      : domain === 'neurology'
      ? 'Is the headache throbbing, band-like, or sharp? Is the dizziness spinning or lightheadedness?'
      : domain === 'musculoskeletal'
      ? 'Is the pain sharp, burning, stiff, or a dull ache?'
      : 'How would you describe the feeling (e.g., sharp, dull, throbbing, constant, intermittent)?'
    return { key: 'character', text, type: 'TEXT' }
  }

  // Step 7: Associated symptoms & conditional follow-ups based on domain
  if (domain === 'respiratory') {
    if (!answeredKeys.has('fever')) {
      return { key: 'fever', text: 'Do you have a fever?', type: 'YESNO' }
    }
    if (getVal('fever') === true && !answeredKeys.has('fever_details')) {
      return { key: 'fever_details', text: 'What is your temperature if known, and how long have you had the fever?', type: 'TEXT' }
    }

    if (!answeredKeys.has('sputum')) {
      return { key: 'sputum', text: 'Do you produce sputum (cough up phlegm)?', type: 'YESNO' }
    }
    if (getVal('sputum') === true && !answeredKeys.has('sputum_details')) {
      return { key: 'sputum_details', text: 'What color is the sputum? Is there any blood in it?', type: 'TEXT' }
    }
  }

  if (domain === 'gastrointestinal') {
    if (!answeredKeys.has('nausea_vomiting')) {
      return { key: 'nausea_vomiting', text: 'Are you experiencing any nausea or vomiting?', type: 'YESNO' }
    }
    if (getVal('nausea_vomiting') === true && !answeredKeys.has('vomiting_details')) {
      return { key: 'vomiting_details', text: 'How many times have you vomited, and can you keep fluids down?', type: 'TEXT' }
    }

    if (!answeredKeys.has('diarrhea')) {
      return { key: 'diarrhea', text: 'Are you experiencing diarrhea?', type: 'YESNO' }
    }
    if (getVal('diarrhea') === true && !answeredKeys.has('diarrhea_details')) {
      return { key: 'diarrhea_details', text: 'How frequent are the loose stools? Is there any blood or mucus?', type: 'TEXT' }
    }
  }

  if (domain === 'neurology') {
    if (!answeredKeys.has('seizure')) {
      return { key: 'seizure', text: 'Have you had any seizures?', type: 'YESNO' }
    }
    if (getVal('seizure') === true && !answeredKeys.has('seizure_details')) {
      return { key: 'seizure_details', text: 'When did the seizure occur? Was there loss of consciousness?', type: 'TEXT' }
    }

    if (!answeredKeys.has('weakness_numbness')) {
      return { key: 'weakness_numbness', text: 'Any weakness or numbness?', type: 'YESNO' }
    }
    if (getVal('weakness_numbness') === true && !answeredKeys.has('weakness_details')) {
      return { key: 'weakness_details', text: 'Which part of your body is weak or numb? Is it on one side or both?', type: 'TEXT' }
    }
  }

  if (domain === 'musculoskeletal') {
    if (!answeredKeys.has('swelling_redness')) {
      return { key: 'swelling_redness', text: 'Do you have swelling, redness, or warmth in the joint or muscle?', type: 'YESNO' }
    }
    if (!answeredKeys.has('injury')) {
      return { key: 'injury', text: 'Was this caused by a recent injury, fall, or physical trauma?', type: 'YESNO' }
    }
  }

  // Ask general associated symptoms if not already asked/covered
  if (!answeredKeys.has('associated_symptoms')) {
    const text = domain === 'general'
      ? 'Are you experiencing any other symptoms (like fever, nausea, dizziness)?'
      : 'Are there any other symptoms or details you want to add?'
    return { key: 'associated_symptoms', text, type: 'TEXT' }
  }

  // Step 8: Aggravating & Relieving
  if (!answeredKeys.has('aggravating')) {
    const text = domain === 'respiratory'
      ? 'What makes your breathing or cough worse (e.g., lying down, exertion, cold air)?'
      : domain === 'gastrointestinal'
      ? 'What makes the abdominal pain or symptoms worse (e.g., eating, movement, pressure)?'
      : domain === 'neurology'
      ? 'What makes your headache or neurological symptoms worse (e.g., bright light, noise, movement)?'
      : domain === 'musculoskeletal'
      ? 'What movements or physical activities make the pain worse?'
      : 'What makes the symptom worse?'
    return { key: 'aggravating', text, type: 'TEXT' }
  }

  if (!answeredKeys.has('relieving')) {
    const text = domain === 'respiratory'
      ? 'What helps your breathing or cough (e.g., sitting up, steam, inhaler, rest)?'
      : domain === 'gastrointestinal'
      ? 'What helps relieve your abdominal pain (e.g., passing gas, lying still, vomiting)?'
      : domain === 'neurology'
      ? 'What helps relieve your symptoms (e.g., lying in a dark room, quiet, sleep, medication)?'
      : domain === 'musculoskeletal'
      ? 'What helps relieve the joint or muscle pain (e.g., rest, heat, ice, stretching)?'
      : 'What makes the symptom better or provides relief?'
    return { key: 'relieving', text, type: 'TEXT' }
  }

  // Step 9: Comprehensive History Taking
  if (!answeredKeys.has('past_medical_history')) {
    return { key: 'past_medical_history', text: 'Do you have any ongoing medical conditions (e.g., Diabetes, Hypertension, Asthma)?', type: 'TEXT' }
  }

  if (!answeredKeys.has('past_surgical_history')) {
    return { key: 'past_surgical_history', text: 'Have you had any surgeries or major procedures in the past?', type: 'TEXT' }
  }

  if (!answeredKeys.has('medication_history')) {
    return { key: 'medication_history', text: 'Are you currently taking any regular medications or supplements?', type: 'TEXT' }
  }

  if (!answeredKeys.has('allergy_history')) {
    return { key: 'allergy_history', text: 'Do you have any known allergies (medications, food, or environmental)?', type: 'TEXT' }
  }

  if (!answeredKeys.has('family_history')) {
    return { key: 'family_history', text: 'Is there a history of similar symptoms or major illnesses in your family?', type: 'TEXT' }
  }

  if (!answeredKeys.has('personal_social_history')) {
    return { key: 'personal_social_history', text: 'Please tell us about your lifestyle (e.g., smoking, alcohol consumption, diet, or occupation).', type: 'TEXT' }
  }

  if (!answeredKeys.has('review_of_systems')) {
    return { key: 'review_of_systems', text: 'Are you experiencing any other symptoms unrelated to your main complaint (e.g., weight loss, fatigue, appetite changes)?', type: 'TEXT' }
  }

  return null
}
