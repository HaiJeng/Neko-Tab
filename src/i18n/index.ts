export { t, setActiveLanguage, getActiveLanguage } from './translate'
export type { TranslationKey } from './translate'
export { LanguageProvider, useTranslation } from './LanguageProvider'
export { detectBrowserLanguage } from './detect'
export {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  localeFor,
  type SupportedLanguage,
  type LanguageOption,
} from './types'
