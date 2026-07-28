import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from './locales/pt-BR.json'
import en from './locales/en.json'

const LANGUAGE_STORAGE_KEY = 'wifi-viewer-language'

function detectInitialLanguage(): 'pt-BR' | 'en' {
  const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY)

  if (savedLanguage === 'pt-BR' || savedLanguage === 'en') {
    return savedLanguage
  }

  return navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': {
      translation: ptBR
    },
    en: {
      translation: en
    }
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})

i18n.on('languageChanged', (language) => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
})

export default i18n