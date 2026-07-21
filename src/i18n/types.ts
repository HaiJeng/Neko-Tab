export type SupportedLanguage = 'en' | 'zh'

export interface LanguageOption {
  code: SupportedLanguage
  /** Display label shown in the language selector (in its own language). */
  label: string
  /** BCP 47 locale used for Intl / toLocale* date & time formatting. */
  locale: string
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'zh', label: '简体中文', locale: 'zh-CN' },
]

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en'

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some(l => l.code === value)
}

export function localeFor(language: SupportedLanguage): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === language)?.locale ?? 'en-US'
}
