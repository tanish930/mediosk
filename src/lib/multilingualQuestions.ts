import { isValidLanguage, type LanguageCode } from './languages'

// Multilingual catalog for the adaptive pre-consultation question bank.
//
// Keys are language-neutral (they match the `key` produced by
// adaptiveQuestioning.ts). Each entry holds the exact existing English
// wording as the default text, with hand-written Hindi and Marathi
// equivalents. Where the adaptive engine varies the wording per clinical
// domain, those variants live in `byDomain`.

export type QuestionSection =
  | 'presenting_complaint'
  | 'symptom_detail'
  | 'systems_review'
  | 'past_history'
  | 'ayurveda_history'
  | 'ashtavidha'
  | 'dashavidha'

type Texts = Record<LanguageCode, string>

// Ayurvedic grouping for patient-reported history questions. TRIVIDHA is part
// of the taxonomy but is purely observational/doctor-side and must never be
// attached to a patient-facing question.
export type AyurvedaGroup =
  | 'AYURVEDA_HISTORY'
  | 'TRIVIDHA'
  | 'ASHTAVIDHA'
  | 'DASHAVIDHA'

export interface MultilingualQuestionEntry {
  section: QuestionSection
  texts: Texts
  byDomain?: Partial<Record<string, Texts>>
  byMode?: { AYURVEDA: Texts }
  ayurvedaGroup?: AyurvedaGroup
}

export const SECTION_LABELS: Record<QuestionSection, Texts> = {
  presenting_complaint: { en: 'Presenting complaint', hi: 'मुख्य समस्या', mr: 'मुख्य तक्रार' },
  symptom_detail: { en: 'Symptom detail', hi: 'लक्षण विवरण', mr: 'लक्षण तपशील' },
  systems_review: { en: 'Systems review', hi: 'प्रणाली जांच', mr: 'प्रणाली तपासणी' },
  past_history: { en: 'Medical history', hi: 'चिकित्सा इतिहास', mr: 'वैद्यकीय इतिहास' },
  ayurveda_history: { en: 'Ayurvedic history', hi: 'आयुर्वेदिक इतिहास', mr: 'आयुर्वेदिक इतिहास' },
  ashtavidha: { en: 'Ashtavidha', hi: 'अष्टविधा', mr: 'अष्टविधा' },
  dashavidha: { en: 'Dashavidha', hi: 'दशविधा', mr: 'दशविधा' },
}

const weaknessEntry: MultilingualQuestionEntry = {
  section: 'symptom_detail',
  texts: {
    en: 'Any weakness or numbness?',
    hi: 'क्या कोई कमजोरी या सुन्नपन है?',
    mr: 'काही कमजोरी किंवा सुन्नपणा आहे का?',
  },
}

export const QUESTION_CATALOG: Record<string, MultilingualQuestionEntry> = {
  chief_complaint: {
    section: 'presenting_complaint',
    texts: {
      en: 'Please describe your main complaint in a sentence.',
      hi: 'कृपया अपनी मुख्य समस्या एक वाक्य में बताएं।',
      mr: 'कृपया तुमची मुख्य तक्रार एका वाक्यात सांगा.',
    },
    byDomain: {
      respiratory: {
        en: 'What respiratory symptom brought you here (e.g., cough, breathlessness, chest pain)?',
        hi: 'आपको यहाँ किस श्वसन संबंधी लक्षण ने लाया है (जैसे, खांसी, सांस फूलना, सीने में दर्द)?',
        mr: 'कोणत्या श्वसनाच्या लक्षणामुळे तुम्ही येथे आलात (उदा. खोकला, श्वास लागणे, छातीत दुखणे)?',
      },
      gastrointestinal: {
        en: 'What abdominal or digestive symptom are you experiencing (e.g., pain, vomiting, diarrhea)?',
        hi: 'आपको कौन सा पेट या पाचन संबंधी लक्षण महसूस हो रहा है (जैसे, दर्द, उल्टी, दस्त)?',
        mr: 'तुम्हाला कोणते पोट किंवा पचनसंस्थेचे लक्षण जाणवत आहे (उदा. दुखणे, उलट्या, जुलाब)?',
      },
      neurology: {
        en: 'What neurological symptom are you experiencing (e.g., headache, dizziness, numbness)?',
        hi: 'आपको कौन सा तंत्रिका संबंधी लक्षण महसूस हो रहा है (जैसे, सिरदर्द, चक्कर आना, सुन्न होना)?',
        mr: 'तुम्हाला कोणते मज्जातंतू संबंधी लक्षण जाणवत आहे (उदा. डोकेदुखी, चक्कर येणे, सुन्न होणे)?',
      },
      musculoskeletal: {
        en: 'Which joint, muscle, or bone symptom are you experiencing?',
        hi: 'आपको कौन सा जोड़, मांसपेशी या हड्डी से संबंधित लक्षण महसूस हो रहा है?',
        mr: 'तुम्हाला कोणते संधी, स्नायू किंवा हाडाचे लक्षण जाणवत आहे?',
      },
    },
    byMode: {
      AYURVEDA: {
        en: 'Please describe your main health concern in a sentence.',
        hi: 'कृपया अपनी मुख्य स्वास्थ्य चिंता एक वाक्य में बताएं।',
        mr: 'कृपया तुमची मुख्य आरोग्याची चिंता एका वाक्यात सांगा.',
      },
    },
  },

  onset: {
    section: 'symptom_detail',
    texts: {
      en: 'When did this symptom start?',
      hi: 'यह लक्षण कब शुरू हुआ?',
      mr: 'हे लक्षण कधी सुरू झाले?',
    },
    byDomain: {
      respiratory: {
        en: 'When did your breathing difficulty or cough start?',
        hi: 'आपकी सांस लेने में तकलीफ या खांसी कब शुरू हुई?',
        mr: 'तुमचा श्वास घेण्यातील त्रास किंवा खोकला कधी सुरू झाला?',
      },
      gastrointestinal: {
        en: 'When did this digestive issue or pain start?',
        hi: 'यह पाचन संबंधी समस्या या दर्द कब शुरू हुआ?',
        mr: 'ही पचनशक्तीची समस्या किंवा दुखणे कधी सुरू झाले?',
      },
      neurology: {
        en: 'When did this headache, dizziness, or numbness start?',
        hi: 'यह सिरदर्द, चक्कर या सुन्नपन कब शुरू हुआ?',
        mr: 'ही डोकेदुखी, चक्कर किंवा सुन्नपणा कधी सुरू झाला?',
      },
      musculoskeletal: {
        en: 'When did this joint or muscle pain start?',
        hi: 'यह जोड़ या मांसपेशी का दर्द कब शुरू हुआ?',
        mr: 'हे संधी किंवा स्नायूचे दुखणे कधी सुरू झाले?',
      },
    },
  },

  duration: {
    section: 'symptom_detail',
    texts: {
      en: 'How long has this symptom been occurring?',
      hi: 'यह लक्षण कितने समय से हो रहा है?',
      mr: 'हे लक्षण किती काळापासून येत आहे?',
    },
    byDomain: {
      respiratory: {
        en: 'How long has this breathing pattern or cough lasted?',
        hi: 'यह सांस लेने की तकलीफ या खांसी कितने समय से है?',
        mr: 'हा श्वास घेण्यातील त्रास किंवा खोकला किती काळापासून आहे?',
      },
      gastrointestinal: {
        en: 'How long has this pain or discomfort lasted?',
        hi: 'यह दर्द या परेशानी कितने समय से है?',
        mr: 'हे दुखणे किंवा अस्वस्थता किती काळापासून आहे?',
      },
      neurology: {
        en: 'How long did or does the episode last?',
        hi: 'यह लक्षण कितने समय तक रहा / रहता है?',
        mr: 'हे लक्षण किती काळ राहिले / राहते?',
      },
      musculoskeletal: {
        en: 'How long have you had this stiffness or pain?',
        hi: 'यह अकड़न या दर्द कितने समय से है?',
        mr: 'हा कडकपणा किंवा दुखणे किती काळापासून आहे?',
      },
    },
  },

  location: {
    section: 'symptom_detail',
    texts: {
      en: 'Where exactly on your body is this felt?',
      hi: 'यह आपके शरीर के किस हिस्से में महसूस होता है?',
      mr: 'हे तुमच्या शरीरात नेमके कुठे जाणवते?',
    },
    byDomain: {
      respiratory: {
        en: 'Do you feel the discomfort mainly in your chest, throat, or nose?',
        hi: 'क्या आपको यह तकलीफ मुख्य रूप से छाती, गले या नाक में महसूस होती है?',
        mr: 'ही अस्वस्थता मुख्यतः छातीत, घशात की नाकात जाणवते का?',
      },
      gastrointestinal: {
        en: 'Where exactly in your abdomen is the pain located (e.g., upper, lower, left, right)?',
        hi: 'पेट में दर्द वास्तव में कहाँ है (जैसे, ऊपर, नीचे, बाएँ, दाएँ)?',
        mr: 'दुखणे पोटात नेमके कुठे आहे (उदा., वर, खाली, डावीकडे, उजवीकडे)?',
      },
      neurology: {
        en: 'Where is the head pain, numbness, or weakness located?',
        hi: 'सिरदर्द, सुन्नपन या कमजोरी शरीर के किस हिस्से में है?',
        mr: 'डोकेदुखी, सुन्नपणा किंवा कमजोरी शरीरात कुठे आहे?',
      },
      musculoskeletal: {
        en: 'Which specific joint or muscle is affected?',
        hi: 'कौन सा विशेष जोड़ या मांसपेशी प्रभावित है?',
        mr: 'कोणता विशिष्ट सांधा किंवा स्नायू प्रभावित आहे?',
      },
    },
  },

  severity: {
    section: 'symptom_detail',
    texts: {
      en: 'How severe is the problem on a scale of 1-10?',
      hi: '1 से 10 के पैमाने पर यह समस्या कितनी गंभीर है?',
      mr: '1 ते 10 च्या प्रमाणात ही समस्या किती गंभीर आहे?',
    },
    byDomain: {
      respiratory: {
        en: 'On a scale of 1-10, how severe is your breathlessness or chest discomfort?',
        hi: '1 से 10 के पैमाने पर, आपकी सांस फूलने या सीने की तकलीफ कितनी गंभीर है?',
        mr: '1 ते 10 च्या प्रमाणात, तुमचा श्वास लागणे किंवा छातीतील अस्वस्थता किती गंभीर आहे?',
      },
      gastrointestinal: {
        en: 'On a scale of 1-10, how severe is the abdominal pain or discomfort?',
        hi: '1 से 10 के पैमाने पर, पेट का दर्द या परेशानी कितनी गंभीर है?',
        mr: '1 ते 10 च्या प्रमाणात, पोटातील दुखणे किंवा अस्वस्थता किती गंभीर आहे?',
      },
      neurology: {
        en: 'On a scale of 1-10, how severe is this symptom?',
        hi: '1 से 10 के पैमाने पर, यह लक्षण कितना गंभीर है?',
        mr: '1 ते 10 च्या प्रमाणात, हे लक्षण किती गंभीर आहे?',
      },
      musculoskeletal: {
        en: 'On a scale of 1-10, how severe is the joint or muscle pain?',
        hi: '1 से 10 के पैमाने पर, जोड़ों या मांसपेशियों का दर्द कितना गंभीर है?',
        mr: '1 ते 10 च्या प्रमाणात, सांध्यांचे किंवा स्नायूंचे दुखणे किती गंभीर आहे?',
      },
    },
  },

  character: {
    section: 'symptom_detail',
    texts: {
      en: 'How would you describe the feeling (e.g., sharp, dull, throbbing, constant, intermittent)?',
      hi: 'आप इस अनुभव का वर्णन कैसे करेंगे (जैसे, तेज, हलका, धड़कता हुआ, लगातार, रुक-रुक कर)?',
      mr: 'हा अनुभव तुम्ही कसा सांगाल (उदा., तीव्र, मंद, धडधडणारा, सतत, मधूनमधून)?',
    },
    byDomain: {
      respiratory: {
        en: 'Is the cough dry or wet? Is the breathlessness constant or does it come in spells?',
        hi: 'क्या खांसी सूखी है या गीली है? क्या सांस फूलना लगातार है या बार-बार आता है?',
        mr: 'खोकला कोरडा आहे का ओला? श्वास लागणे सतत आहे का केवळ काही वेळ येते?',
      },
      gastrointestinal: {
        en: 'Describe the pain character (e.g., burning, cramping, sharp, dull ache).',
        hi: 'दर्द की प्रकृति बताएं (जैसे, जलन, ऐंठन, तेज, हलका दर्द)।',
        mr: 'दुखण्याचे स्वरूप सांगा (उदा., जळजळ, आकुंचन, तीव्र, मंद दुखणे).',
      },
      neurology: {
        en: 'Is the headache throbbing, band-like, or sharp? Is the dizziness spinning or lightheadedness?',
        hi: 'क्या सिरदर्द धड़कता हुआ, बंद जैसा या तेज है? क्या चक्कर घूमती है या सिर हलका महसूस होता है?',
        mr: 'डोकेदुखी धडधडणारी, पट्टीसारखी की तीव्र आहे का? चक्कर फिरत आहे का डोके हलके वाटते?',
      },
      musculoskeletal: {
        en: 'Is the pain sharp, burning, stiff, or a dull ache?',
        hi: 'क्या दर्द तेज, जलन, अकड़न वाला या हलका है?',
        mr: 'दुखणे तीव्र, जळजळीत, कडक का मंद आहे?',
      },
    },
  },

  fever: {
    section: 'symptom_detail',
    texts: {
      en: 'Do you have a fever?',
      hi: 'क्या आपको बुखार है?',
      mr: 'तुम्हाला ताप आहे का?',
    },
  },

  fever_details: {
    section: 'symptom_detail',
    texts: {
      en: 'What is your temperature if known, and how long have you had the fever?',
      hi: 'अगर पता है तो आपका तापमान कितना है, और बुखार कितने समय से है?',
      mr: 'माहीत असल्यास तुमचे तापमान किती आहे आणि ताप किती काळापासून आहे?',
    },
  },

  sputum: {
    section: 'symptom_detail',
    texts: {
      en: 'Do you produce sputum (cough up phlegm)?',
      hi: 'क्या आपको खांसी में कफ निकलता है?',
      mr: 'तुम्हाला खोकल्यावर कफ (श्लेष्मा) येतो का?',
    },
  },

  sputum_details: {
    section: 'symptom_detail',
    texts: {
      en: 'What color is the sputum? Is there any blood in it?',
      hi: 'कफ किस रंग का है? क्या इसमें खून है?',
      mr: 'कफ कोणत्या रंगाचा आहे? त्यात रक्त आहे का?',
    },
  },

  nausea_vomiting: {
    section: 'symptom_detail',
    texts: {
      en: 'Are you experiencing any nausea or vomiting?',
      hi: 'क्या आपको मतली या उल्टी हो रही है?',
      mr: 'तुम्हाला मळमळ किंवा उलट्या होत आहेत का?',
    },
  },

  vomiting_details: {
    section: 'symptom_detail',
    texts: {
      en: 'How many times have you vomited, and can you keep fluids down?',
      hi: 'आपने कितनी बार उल्टी की है, और क्या आप तरल पदार्थ पी पा रहे हैं?',
      mr: 'तुम्ही किती वेळा उलटी केली आणि तुम्हाला द्रव तोंडात सहन होतात का?',
    },
  },

  diarrhea: {
    section: 'symptom_detail',
    texts: {
      en: 'Are you experiencing diarrhea?',
      hi: 'क्या आपको दस्त (डायरिया) है?',
      mr: 'तुम्हाला जुलाब (अतिसार) आहे का?',
    },
  },

  diarrhea_details: {
    section: 'symptom_detail',
    texts: {
      en: 'How frequent are the loose stools? Is there any blood or mucus?',
      hi: 'पतले दस्त कितनी बार हो रहे हैं? क्या उनमें खून या बलगम है?',
      mr: 'सैल जुलाब किती वेळा होत आहेत? त्यात रक्त किंवा श्लेष्मा आहे का?',
    },
  },

  seizure: {
    section: 'symptom_detail',
    texts: {
      en: 'Have you had any seizures?',
      hi: 'क्या आपको कभी मिर्गी का दौरा / झटके आए हैं?',
      mr: 'तुम्हाला कधी झटके (अपस्मार) आले आहेत का?',
    },
  },

  seizure_details: {
    section: 'symptom_detail',
    texts: {
      en: 'When did the seizure occur? Was there loss of consciousness?',
      hi: 'दौरा कब आया? क्या बेहोशी हुई थी?',
      mr: 'झटका कधी आला? तेव्हा भान हरपले होते का?',
    },
  },

  weakness_numbness: weaknessEntry,
  weakness: weaknessEntry,

  weakness_details: {
    section: 'symptom_detail',
    texts: {
      en: 'Which part of your body is weak or numb? Is it on one side or both?',
      hi: 'शरीर का कौन सा हिस्सा कमजोर या सुन्न है? क्या यह एक तरफ है या दोनों तरफ?',
      mr: 'तुमच्या शरीरातील कोणता भाग कमजोर किंवा सुन्न आहे? ते एका बाजूला आहे का दोन्ही बाजूला?',
    },
  },

  swelling_redness: {
    section: 'symptom_detail',
    texts: {
      en: 'Do you have swelling, redness, or warmth in the joint or muscle?',
      hi: 'क्या जोड़ या मांसपेशी में सूजन, लालिमा या गर्मी महसूस होती है?',
      mr: 'सांध्यात किंवा स्नायूत सूज, लालसरपणा किंवा उष्णता जाणवते का?',
    },
  },

  injury: {
    section: 'symptom_detail',
    texts: {
      en: 'Was this caused by a recent injury, fall, or physical trauma?',
      hi: 'क्या यह हाल ही में हुई चोट, गिरने या शारीरिक आघात के कारण हुआ?',
      mr: 'हे अलीकडे झालेल्या दुखापत, पडणे किंवा शारीरिक आघातामुळे घडले का?',
    },
  },

  associated_symptoms: {
    section: 'symptom_detail',
    texts: {
      en: 'Are there any other symptoms or details you want to add?',
      hi: 'क्या आप कोई अन्य लक्षण या जानकारी जोड़ना चाहते हैं?',
      mr: 'तुम्हाला इतर कोणतीही लक्षणे किंवा माहिती जोडायची आहे का?',
    },
    byDomain: {
      general: {
        en: 'Are you experiencing any other symptoms (like fever, nausea, dizziness)?',
        hi: 'क्या आपको कोई अन्य लक्षण महसूस हो रहे हैं (जैसे, बुखार, मतली, चक्कर)?',
        mr: 'तुम्हाला इतर लक्षणे जाणवत आहेत का (उदा., ताप, मळमळ, चक्कर)?',
      },
    },
  },

  aggravating: {
    section: 'symptom_detail',
    texts: {
      en: 'What makes the symptom worse?',
      hi: 'किस चीज़ से यह लक्षण और बढ़ जाता है?',
      mr: 'कशामुळे हे लक्षण आणखी वाढते?',
    },
    byDomain: {
      respiratory: {
        en: 'What makes your breathing or cough worse (e.g., lying down, exertion, cold air)?',
        hi: 'किस चीज़ से आपकी सांस लेने की तकलीफ या खांसी बढ़ती है (जैसे, लेटना, परिश्रम, ठंडी हवा)?',
        mr: 'कशामुळे तुमचा श्वास घेण्यातील त्रास किंवा खोकला वाढतो (उदा., झोपणे, श्रम, थंड हवा)?',
      },
      gastrointestinal: {
        en: 'What makes the abdominal pain or symptoms worse (e.g., eating, movement, pressure)?',
        hi: 'किस चीज़ से पेट का दर्द या लक्षण बढ़ते हैं (जैसे, खाना, हिलना-डुलना, दबाव)?',
        mr: 'कशामुळे पोटातील दुखणे किंवा लक्षणे वाढतात (उदा., खाणे, हालचाल, दाब)?',
      },
      neurology: {
        en: 'What makes your headache or neurological symptoms worse (e.g., bright light, noise, movement)?',
        hi: 'किस चीज़ से आपका सिरदर्द या तंत्रिका संबंधी लक्षण बढ़ते हैं (जैसे, तेज रोशनी, शोर, हलचल)?',
        mr: 'कशामुळे तुमची डोकेदुखी किंवा मज्जासंस्थेची लक्षणे वाढतात (उदा., तेज प्रकाश, आवाज, हालचाल)?',
      },
      musculoskeletal: {
        en: 'What movements or physical activities make the pain worse?',
        hi: 'कौन सी हरकतें या शारीरिक गतिविधियां दर्द बढ़ाती हैं?',
        mr: 'कोणत्या हालचाली किंवा शारीरिक क्रियांमुळे दुखणे वाढते?',
      },
    },
  },

  relieving: {
    section: 'symptom_detail',
    texts: {
      en: 'What makes the symptom better or provides relief?',
      hi: 'किस चीज़ से यह लक्षण कम होता है या राहत मिलती है?',
      mr: 'कशामुळे हे लक्षण कमी होते किंवा आराम मिळतो?',
    },
    byDomain: {
      respiratory: {
        en: 'What helps your breathing or cough (e.g., sitting up, steam, inhaler, rest)?',
        hi: 'किस चीज़ से आपकी सांस या खांसी में राहत मिलती है (जैसे, बैठ जाना, भाप, इन्हेलर, आराम)?',
        mr: 'कशामुळे तुमच्या श्वासाला किंवा खोकल्याला आराम मिळतो (उदा., बसणे, वाफ, इन्हेलर, विश्रांती)?',
      },
      gastrointestinal: {
        en: 'What helps relieve your abdominal pain (e.g., passing gas, lying still, vomiting)?',
        hi: 'किस चीज़ से पेट के दर्द में राहत मिलती है (जैसे, गैस निकलना, स्थिर लेटना, उल्टी)?',
        mr: 'कशामुळे पोटातील दुखणे शमते (उदा., गॅस जाणे, शांत झोपणे, उलटी)?',
      },
      neurology: {
        en: 'What helps relieve your symptoms (e.g., lying in a dark room, quiet, sleep, medication)?',
        hi: 'किस चीज़ से आपके लक्षण कम होते हैं (जैसे, अंधेरे कमरे में लेटना, शांति, नींद, दवा)?',
        mr: 'कशामुळे तुमची लक्षणे कमी होतात (उदा., अंधाऱ्या खोलीत झोपणे, शांतता, झोप, औषध)?',
      },
      musculoskeletal: {
        en: 'What helps relieve the joint or muscle pain (e.g., rest, heat, ice, stretching)?',
        hi: 'किस चीज़ से जोड़ों या मांसपेशियों के दर्द में राहत मिलती है (जैसे, आराम, गर्मी, बर्फ, स्ट्रेचिंग)?',
        mr: 'कशामुळे सांध्यांचे किंवा स्नायूंचे दुखणे कमी होते (उदा., विश्रांती, उष्णता, बर्फ, ताणणे)?',
      },
    },
  },

  past_medical_history: {
    section: 'past_history',
    texts: {
      en: 'Do you have any ongoing medical conditions (e.g., Diabetes, Hypertension, Asthma)?',
      hi: 'क्या आपको कोई लंबे समय से चल रही बीमारी है (जैसे, मधुमेह, उच्च रक्तचाप, अस्थमा)?',
      mr: 'तुम्हाला दीर्घकाळ सुरू असलेले आजार आहेत का (उदा., मधुमेह, उच्च रक्तदाब, दमा)?',
    },
  },

  past_surgical_history: {
    section: 'past_history',
    texts: {
      en: 'Have you had any surgeries or major procedures in the past?',
      hi: 'क्या आपकी पहले कभी कोई सर्जरी या बड़ी प्रक्रिया हुई है?',
      mr: 'तुमची पूर्वी कधी शस्त्रक्रिया किंवा मोठी प्रक्रिया झाली आहे का?',
    },
  },

  medication_history: {
    section: 'past_history',
    texts: {
      en: 'Are you currently taking any regular medications or supplements?',
      hi: 'क्या आप अभी कोई नियमित दवा या सप्लीमेंट ले रहे हैं?',
      mr: 'तुम्ही सध्या कोणतीही नियमित औषधे किंवा पूरक आहार घेत आहात का?',
    },
  },

  allergy_history: {
    section: 'past_history',
    texts: {
      en: 'Do you have any known allergies (medications, food, or environmental)?',
      hi: 'क्या आपको कोई ज्ञात एलर्जी है (दवाओं, भोजन या पर्यावरण से)?',
      mr: 'तुम्हाला कोणतीही ज्ञात ऍलर्जी आहे का (औषधे, अन्न किंवा पर्यावरण)?',
    },
  },

  family_history: {
    section: 'past_history',
    texts: {
      en: 'Is there a history of similar symptoms or major illnesses in your family?',
      hi: 'क्या आपके परिवार में ऐसे ही लक्षण या गंभीर बीमारियों का इतिहास है?',
      mr: 'तुमच्या कुटुंबात अशाच लक्षणांचा किंवा गंभीर आजारांचा इतिहास आहे का?',
    },
  },

  personal_social_history: {
    section: 'past_history',
    texts: {
      en: 'Please tell us about your lifestyle (e.g., smoking, alcohol consumption, diet, or occupation).',
      hi: 'कृपया अपनी जीवनशैली के बारे में बताएं (जैसे, धूम्रपान, शराब का सेवन, आहार या व्यवसाय)।',
      mr: 'कृपया तुमच्या जीवनशैलीबद्दल सांगा (उदा., धूम्रपान, मद्यपान, आहार किंवा व्यवसाय).',
    },
  },

  review_of_systems: {
    section: 'systems_review',
    texts: {
      en: 'Are you experiencing any other symptoms unrelated to your main complaint (e.g., weight loss, fatigue, appetite changes)?',
      hi: 'क्या आपको आपकी मुख्य समस्या से अलग कोई अन्य लक्षण महसूस हो रहे हैं (जैसे, वजन घटना, थकान, भूख में बदलाव)?',
      mr: 'तुमच्या मुख्य तक्रारीशी संबंधित नसलेली इतर लक्षणे जाणवत आहेत का (उदा., वजन कमी होणे, थकवा, भूक बदलणे)?',
    },
  },

  // ── AYURVEDA patient-reported history ─────────────────────────────
  // These are asked ONLY in AYURVEDA-mode sessions. They capture
  // self-reported / self-observable information and prior knowledge. No
  // categorical clinical option sets are offered: the patient answers in
  // their own words or chooses Not sure / Prefer not to answer. Clinical
  // appraisal items (Trividha observation, Sara, Samhanana, Pramana, Nadi,
  // Jihva, Drika, Shabda, Sparsha, Koshtha classification, etc.) are
  // doctor-side and never asked here.

  ayush_nidana: {
    section: 'ayurveda_history',
    ayurvedaGroup: 'AYURVEDA_HISTORY',
    texts: {
      en: 'What do you think may have caused or started this problem? Describe it in your own words as best as you can.',
      hi: 'आपको क्या लगता है कि इस समस्या का कारण क्या हो सकता है या यह कैसे शुरू हुई? इसे अपने शब्दों में जितना हो सके बताएं।',
      mr: 'तुम्हाला काय वाटते की या समस्येचे कारण काय असू शकेल किंवा ती कशी सुरू झाली? तुमच्या शब्दांत शक्य तितके सांगा.',
    },
  },

  ayush_agni: {
    section: 'ayurveda_history',
    ayurvedaGroup: 'AYURVEDA_HISTORY',
    texts: {
      en: 'How would you describe your appetite and digestion at present? (For example, hungry as usual, poor appetite, heavy feeling after meals.)',
      hi: 'इस समय आपकी भूख और पाचन कैसा है? (उदाहरण के लिए, हमेशा की तरह भूख, कम भूख, खाने के बाद भारीपन।)',
      mr: 'सध्या तुमची भूक आणि पचनशक्ती कशी आहे? (उदाहरणार्थ, नेहमीप्रमाणे भूक, कमी भूक, जेवणानंतर जडपणा.)',
    },
  },

  ayush_koshtha: {
    section: 'ayurveda_history',
    ayurvedaGroup: 'AYURVEDA_HISTORY',
    texts: {
      en: 'How would you describe your usual bowel habit? (For example, regular, once every few days, loose most days.)',
      hi: 'आपकी आमतौर पर शौच की आदत कैसी रहती है? (उदाहरण के लिए, नियमित, कुछ दिनों में एक बार, अधिकतर दिन पतला।)',
      mr: 'तुमची नेहमीची शौचाची सवय कशी आहे? (उदाहरणार्थ, नियमित, काही दिवसांनी एकदा, बहुतेक दिवस सैल.)',
    },
  },

  ayush_ahara_vihara: {
    section: 'ayurveda_history',
    ayurvedaGroup: 'AYURVEDA_HISTORY',
    texts: {
      en: 'Describe your usual food, sleep, and daily routine (for example, what you usually eat, your sleep timings, and physical activity).',
      hi: 'अपने सामान्य भोजन, नींद और दिनचर्या के बारे में बताएं (उदाहरण के लिए, आप आमतौर पर क्या खाते हैं, सोने का समय और शारीरिक गतिविधि)।',
      mr: 'तुमचे नेहमीचे अन्न, झोप आणि दिनचर्या सांगा (उदाहरणार्थ, तुम्ही सहसा काय खाता, झोपेची वेळ आणि शारीरिक हालचाल).',
    },
  },

  ayush_samprapti: {
    section: 'ayurveda_history',
    ayurvedaGroup: 'AYURVEDA_HISTORY',
    texts: {
      en: 'How has this problem developed since it began? (For example, slowly over days, sudden, coming and going.)',
      hi: 'शुरू होने के बाद यह समस्या कैसे बढ़ी? (उदाहरण के लिए, दिनों में धीरे-धीरे, अचानक, आना-जाना।)',
      mr: 'सुरू झाल्यापासून ही समस्या कशी वाढली? (उदाहरणार्थ, दिवसांत हळूहळू, अचानक, येण्या-जाण्या.)',
    },
  },

  // Ashtavidha — only the patient-observable elements (mala / mutra) are
  // asked. Nadi, Jihva, Drika, Shabda and Sparsha are clinical examinations
  // and remain doctor-side.
  ayush_mala: {
    section: 'ashtavidha',
    ayurvedaGroup: 'ASHTAVIDHA',
    texts: {
      en: 'Have you noticed any change in your stool (bowel movements) with this problem? Describe in your own words.',
      hi: 'क्या आपको इस समस्या के साथ शौच (मल त्याग) में कोई बदलाव दिखा? अपने शब्दों में बताएं।',
      mr: 'या समस्येसह तुमच्या शौचात (मलविसर्जनात) काही बदल जाणवला का? तुमच्या शब्दांत सांगा.',
    },
  },

  ayush_mutra: {
    section: 'ashtavidha',
    ayurvedaGroup: 'ASHTAVIDHA',
    texts: {
      en: 'Have you noticed any change in your urine with this problem? Describe in your own words.',
      hi: 'क्या आपको इस समस्या के साथ पेशाब में कोई बदलाव दिखा? अपने शब्दों में बताएं।',
      mr: 'या समस्येसह तुमच्या लघवीत काही बदल जाणवला का? तुमच्या शब्दांत सांगा.',
    },
  },

  // Dashavidha — only recollection of prior knowledge and plain
  // self-observable facts. No classification is inferred.
  ayush_prakriti: {
    section: 'dashavidha',
    ayurvedaGroup: 'DASHAVIDHA',
    texts: {
      en: 'Has an Ayurvedic practitioner ever told you your Prakriti (body constitution)? If yes, describe it in your own words. Otherwise you can say Not sure.',
      hi: 'क्या किसी आयुर्वेदिक चिकित्सक ने कभी आपकी प्रकृति (शरीर की प्रकृति) बताई है? यदि हां, तो अपने शब्दों में बताएं। अन्यथा आप पता नहीं कह सकते हैं।',
      mr: 'कधी एखाद्या आयुर्वेदिक वैद्याने तुमची प्रकृती (शरीराची प्रकृती) सांगितली आहे का? असल्यास तुमच्या शब्दांत सांगा. नसल्यास माहीत नाही सांगू शकता.',
    },
  },

  ayush_vikriti: {
    section: 'dashavidha',
    ayurvedaGroup: 'DASHAVIDHA',
    texts: {
      en: 'Have you ever been told about an imbalance of Vata, Pitta, or Kapha in relation to this or any past illness? If yes, describe it in your own words, or say Not sure.',
      hi: 'क्या आपको कभी बताया गया है कि इस बीमारी या किसी पिछली बीमारी से वात, पित्त या कफ का असंतुलन था? यदि हां, तो अपने शब्दों में बताएं, या पता नहीं कहें।',
      mr: 'या आजाराशी किंवा मागील आजाराशी संबंधित वात, पित्त किंवा कफ यांचे असंतुलन असल्याचे तुम्हाला कधी सांगितले आहे का? असल्यास तुमच्या शब्दांत सांगा किंवा माहीत नाही म्हणा.',
    },
  },

  ayush_vaya: {
    section: 'dashavidha',
    ayurvedaGroup: 'DASHAVIDHA',
    texts: {
      en: 'What is your age? You can also describe how fit you generally feel at this age.',
      hi: 'आपकी उम्र कितनी है? आप यह भी बता सकते हैं कि इस उम्र में आप सामान्यतः कितना स्वस्थ महसूस करते हैं।',
      mr: 'तुमचे वय किती आहे? तुम्ही हेही सांगू शकता की या वयात तुम्ही साधारणपणे किती तंदुरुस्त वाटत.',
    },
  },

  ayush_satmya: {
    section: 'dashavidha',
    ayurvedaGroup: 'DASHAVIDHA',
    texts: {
      en: 'What foods or habits are you most used to or comfortable with? (For example, daily tea, spicy or oily food, fasting.)',
      hi: 'कौन से भोजन या आदतें आपको सबसे अच्छी तरह से सूट करती हैं या जिनके आप आदी हैं? (उदाहरण के लिए, रोज़ चाय, तीखा या तला भोजन, उपवास।)',
      mr: 'कोणते अन्न किंवा सवयी तुम्हाला सर्वात सवयीच्या आहेत किंवा आरामदायक वाटतात? (उदाहरणार्थ, रोजचा चहा, तिखट किंवा तळलेले अन्न, उपवास.)',
    },
  },

  ayush_sattva: {
    section: 'dashavidha',
    ayurvedaGroup: 'DASHAVIDHA',
    texts: {
      en: 'How would you describe your sleep, mood, and memory at present?',
      hi: 'इस समय आपकी नींद, मनोदशा और याददाश्त कैसी है?',
      mr: 'सध्या तुमची झोप, मनःस्थिती आणि स्मरणशक्ती कशी आहे?',
    },
  },

  ayush_vyayama_shakti: {
    section: 'dashavidha',
    ayurvedaGroup: 'DASHAVIDHA',
    texts: {
      en: 'How much physical activity or exertion can you usually manage before feeling tired?',
      hi: 'थकान महसूस होने से पहले आप सामान्यतः कितनी शारीरिक गतिविधि या परिश्रम कर सकते हैं?',
      mr: 'थकवा जाणवण्यापूर्वी तुम्ही सहसा किती शारीरिक हालचाल किंवा श्रम करू शकता?',
    },
  },
}

// Browser locales used for STT (speech-to-text) and read-aloud (text-to-speech).
// English uses Indian English to stay consistent with the existing recognizer.
export function sttLocale(lang: string | null | undefined): string {
  switch (lang) {
    case 'hi':
      return 'hi-IN'
    case 'mr':
      return 'mr-IN'
    default:
      return 'en-IN'
  }
}

export function readAloudLocale(lang: string | null | undefined): string {
  switch (lang) {
    case 'hi':
      return 'hi-IN'
    case 'mr':
      return 'mr-IN'
    default:
      return 'en-IN'
  }
}

export function getQuestionSection(key: string | null | undefined): QuestionSection | null {
  if (!key) return null
  return QUESTION_CATALOG[key]?.section ?? null
}

// Returns the catalog text for a question key in the requested language,
// preferring the per-domain variant when one exists. Falls back to the
// exact English wording used by the adaptive engine. Null for unknown keys.
export function getQuestionText(
  key: string | null | undefined,
  lang: string | null | undefined,
  domain?: string | null,
  mode?: string | null
): string | null {
  if (!key) return null
  const entry = QUESTION_CATALOG[key]
  if (!entry) return null

  const normalized: LanguageCode = isValidLanguage(lang) ? lang : 'en'
  const modeVariant =
    mode === 'AYURVEDA' && entry.byMode?.AYURVEDA
      ? entry.byMode.AYURVEDA
      : undefined
  const domainVariant = domain && entry.byDomain ? entry.byDomain[domain] : undefined
  const candidate = modeVariant?.[normalized] ?? domainVariant?.[normalized] ?? entry.texts[normalized]
  return candidate ?? entry.texts.en
}

export function getSectionLabel(section: QuestionSection, lang: string | null | undefined): string {
  const normalized: LanguageCode = isValidLanguage(lang) ? lang : 'en'
  return SECTION_LABELS[section][normalized] ?? SECTION_LABELS[section].en
}