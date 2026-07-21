import { en, type TranslationKey } from './locales/en'
import { zh } from './locales/zh'
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from './types'

const DICTIONARIES: Record<SupportedLanguage, Record<string, string>> = {
  en,
  zh,
}

// Module-level active language so t() works before (and outside of) React.
// Kept in sync by LanguageProvider and the boot-path pre-warm.
let activeLanguage: SupportedLanguage = DEFAULT_LANGUAGE

export function setActiveLanguage(language: SupportedLanguage): void {
  if (isSupportedLanguage(language)) {
    activeLanguage = language
  }
}

export function getActiveLanguage(): SupportedLanguage {
  return activeLanguage
}

/** Replaces `{name}` placeholders in a string with values from `vars`. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match
  )
}

/**
 * Translates a key for the active language.
 * Fallback chain: active locale → English → the raw key (so gaps are visible).
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const value =
    DICTIONARIES[activeLanguage]?.[key] ??
    DICTIONARIES.en[key] ??
    key
  return interpolate(value, vars)
}

export type { TranslationKey }
