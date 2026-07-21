import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSettings } from '../hooks/useLocalStorage'
import { setActiveLanguage, t as translate, type TranslationKey } from './translate'
import { DEFAULT_LANGUAGE, isSupportedLanguage, localeFor, type SupportedLanguage } from './types'

interface LanguageContextValue {
  language: SupportedLanguage
  /** BCP 47 locale for Intl / toLocale* formatting. */
  locale: string
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [settings] = useSettings()
  const language = isSupportedLanguage(settings.language) ? settings.language : DEFAULT_LANGUAGE

  // Keep the module-level active language (used by the bare t() and non-React
  // code) in sync with settings before children render.
  setActiveLanguage(language)

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: localeFor(language),
    // Bind through the module function so it always reads the current language.
    t: (key, vars) => translate(key, vars),
  }), [language])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useTranslation must be used within a LanguageProvider')
  }
  return ctx
}
