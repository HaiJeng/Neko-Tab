import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from './types'

/**
 * Maps the browser's preferred language to a supported locale.
 * Matches on the primary subtag (e.g. `zh-CN` → `zh`), falling back to English.
 */
export function detectBrowserLanguage(): SupportedLanguage {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE

  const candidates = [navigator.language, ...(navigator.languages ?? [])]
  for (const candidate of candidates) {
    if (!candidate) continue
    const primary = candidate.toLowerCase().split('-')[0]
    const match = SUPPORTED_LANGUAGES.find(l => l.code === primary)
    if (match) return match.code
  }

  return DEFAULT_LANGUAGE
}
