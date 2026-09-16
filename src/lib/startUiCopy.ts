import { isValidLanguage, type LanguageCode } from './languages'

// Localized user-facing copy for the Start New Consultation stage of the
// pre-consultation page. The whole stage re-renders instantly when the
// patient changes the consultation language, so every visible string lives
// here instead of being scattered through the JSX.
//
// The language selector's own names are the native ones (English / हिन्दी /
// मराठी) and are identical regardless of the active UI language.

export interface StartUiCopy {
  pageTitle: string
  intro: string
  languageQuestion: string
  languageNote: string
  concernLabel: string
  readAloud: string
  reading: string
  complaintHint: string
  complaintPlaceholder: string
  beginButton: string
  starting: string
  readFirstQuestionAria: string
  errorSessionLoad: string
  errorActiveConsultation: string
  errorStartFailed: string
  errorConnectFailed: string
  languageNames: Record<LanguageCode, string>
}

const en: StartUiCopy = {
  pageTitle: 'Start New Consultation',
  intro:
    'Start a brand-new visit by telling us what is bothering you. This helps your doctor prepare. Your previous consultations stay safe and unchanged.',
  languageQuestion: 'In what language would you like to answer these questions?',
  languageNote:
    'The health questions will be shown and read aloud in your chosen language. Your answers are still recorded for your doctor in English.',
  concernLabel: 'What is your main health concern?',
  readAloud: 'Read Aloud',
  reading: 'Reading...',
  complaintHint:
    'Write as much or as little as you can. You can describe pain, symptoms, or anything unusual.',
  complaintPlaceholder: 'For example: I have had a headache for 3 days',
  beginButton: 'Begin New Visit',
  starting: 'Starting...',
  readFirstQuestionAria: 'Read the first question aloud',
  errorSessionLoad:
    'We could not load that consultation. You can start a new consultation instead.',
  errorActiveConsultation:
    'A consultation with your doctor is already in progress. Finish or leave it before starting a new consultation.',
  errorStartFailed: 'Could not start pre-consultation. Please try again.',
  errorConnectFailed:
    'Could not connect to the server. Please check your connection and try again.',
  languageNames: { en: 'English', hi: 'हिन्दी', mr: 'मराठी' },
}

const hi: StartUiCopy = {
  pageTitle: 'नया परामर्श शुरू करें',
  intro:
    'हमें बताएं कि आपको क्या परेशानी है, इससे नई मुलाकात शुरू करें। इससे आपके डॉक्टर को तैयारी करने में मदद मिलती है। आपके पिछले परामर्श सुरक्षित और अपरिवर्तित रहते हैं।',
  languageQuestion: 'आप इन सवालों का जवाब किस भाषा में देना चाहेंगे?',
  languageNote:
    'स्वास्थ्य प्रश्न आपकी चुनी हुई भाषा में दिखाए और पढ़े जाएंगे। आपके उत्तर आपके डॉक्टर के लिए अंग्रेज़ी में दर्ज किए जाते हैं।',
  concernLabel: 'आपकी मुख्य स्वास्थ्य समस्या क्या है?',
  readAloud: 'ज़ोर से पढ़ें',
  reading: 'पढ़ा जा रहा है...',
  complaintHint:
    'आप जितना चाहें उतना लिखें। आप दर्द, लक्षण या कोई भी असामान्य बात बता सकते हैं।',
  complaintPlaceholder: 'उदाहरण के लिए: मुझे 3 दिनों से सिरदर्द है',
  beginButton: 'नई मुलाकात शुरू करें',
  starting: 'शुरू हो रहा है...',
  readFirstQuestionAria: 'पहला प्रश्न ज़ोर से पढ़ें',
  errorSessionLoad:
    'हम उस परामर्श को लोड नहीं कर सके। आप इसके बजाय एक नया परामर्श शुरू कर सकते हैं।',
  errorActiveConsultation:
    'आपके डॉक्टर के साथ एक परामर्श पहले से चालू है। नया परामर्श शुरू करने से पहले उसे पूरा करें या छोड़ दें।',
  errorStartFailed: 'प्री-परामर्श शुरू नहीं हो सका। कृपया फिर से प्रयास करें।',
  errorConnectFailed:
    'सर्वर से संपर्क नहीं हो सका। कृपया अपना कनेक्शन जांचें और फिर से प्रयास करें।',
  languageNames: { en: 'English', hi: 'हिन्दी', mr: 'मराठी' },
}

const mr: StartUiCopy = {
  pageTitle: 'नवीन सल्ला सुरू करा',
  intro:
    'नवीन भेट सुरू करण्यासाठी तुम्हाला काय त्रास होत आहे ते आम्हाला सांगा. यामुळे तुमच्या डॉक्टरांना तयारी करण्यास मदत होते. तुमचे मागील सल्ले सुरक्षित आणि अपरिवर्तित राहतात.',
  languageQuestion: 'तुम्हाला या प्रश्नांची उत्तरे कोणत्या भाषेत द्यायची आहेत?',
  languageNote:
    'आरोग्याचे प्रश्न तुमच्या निवडलेल्या भाषेत दिसतील आणि मोठ्याने वाचले जातील. तुमची उत्तरे तुमच्या डॉक्टरांसाठी इंग्रजीत नोंदवली जातात.',
  concernLabel: 'तुमची प्रमुख आरोग्याची तक्रार काय आहे?',
  readAloud: 'मोठ्याने वाचा',
  reading: 'वाचले जात आहे...',
  complaintHint:
    'तुम्ही जितके हवे तितके लिहा. तुम्ही वेदना, लक्षणे किंवा काहीही असामान्य सांगू शकता.',
  complaintPlaceholder: 'उदाहरणार्थ: मला ३ दिवसांपासून डोकेदुखी आहे',
  beginButton: 'नवीन भेट सुरू करा',
  starting: 'सुरू होत आहे...',
  readFirstQuestionAria: 'पहिला प्रश्न मोठ्याने वाचा',
  errorSessionLoad:
    'आम्हाला तो सल्ला लोड करता आला नाही. त्याऐवजी तुम्ही नवीन सल्ला सुरू करू शकता.',
  errorActiveConsultation:
    'तुमच्या डॉक्टरांसोबत एक सल्ला आधीच सुरू आहे. नवीन सल्ला सुरू करण्यापूर्वी तो पूर्ण करा किंवा सोडा.',
  errorStartFailed: 'प्री-सल्लामसलत सुरू होऊ शकली नाही. कृपया पुन्हा प्रयत्न करा.',
  errorConnectFailed:
    'सर्व्हरशी संपर्क होऊ शकला नाही. कृपया तुमचे कनेक्शन तपासून पुन्हा प्रयत्न करा.',
  languageNames: { en: 'English', hi: 'हिन्दी', mr: 'मराठी' },
}

export const START_UI_COPY: Record<LanguageCode, StartUiCopy> = { en, hi, mr }

export function startUiCopy(lang: string | null | undefined): StartUiCopy {
  return isValidLanguage(lang) ? START_UI_COPY[lang] : START_UI_COPY.en
}