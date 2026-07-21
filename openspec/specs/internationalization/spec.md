## ADDED Requirements

### Requirement: Translation lookup

The system SHALL provide a translation function `t(key)` that returns the string for the given key in the active language, and SHALL fall back to the `en` string when a key is missing in the active locale.

#### Scenario: Key exists in active locale
- **WHEN** the active language is `zh` and a component calls `t('settings.title')` for a key present in the `zh` dictionary
- **THEN** the system returns the Chinese string for that key

#### Scenario: Key missing in active locale
- **WHEN** the active language is `zh` and `t('some.key')` is called for a key absent from the `zh` dictionary but present in `en`
- **THEN** the system returns the `en` string for that key

#### Scenario: Key missing entirely
- **WHEN** `t('nonexistent.key')` is called for a key present in no dictionary
- **THEN** the system returns the key itself (so missing translations are visible, not blank)

### Requirement: Language selection and persistence

The system SHALL allow the user to select a language from the Settings panel, SHALL persist the choice in the `language` field of the settings object in `localStorage`, and SHALL apply the change without requiring a page reload.

#### Scenario: User changes language
- **WHEN** the user selects a different language in the Settings panel
- **THEN** all visible UI text updates to the selected language immediately and the choice is saved to `localStorage`

#### Scenario: Persisted language on next load
- **WHEN** the user has previously selected a language and opens a new tab
- **THEN** the extension renders in the previously selected language

### Requirement: Browser language detection

The system SHALL detect the browser's preferred language on first use (when no language has been persisted) and select a supported locale matching it, defaulting to `en` when no supported match exists.

#### Scenario: Supported browser language
- **WHEN** a new user with browser language `zh-CN` opens the extension for the first time with no stored preference
- **THEN** the extension renders in `zh`

#### Scenario: Unsupported browser language
- **WHEN** a new user with an unsupported browser language opens the extension for the first time with no stored preference
- **THEN** the extension renders in `en`

### Requirement: No flash of untranslated content

The system SHALL apply the active language before React mounts, using the pre-warm mechanism that seeds settings into the page, so the first paint is in the correct language.

#### Scenario: First paint in correct language
- **WHEN** the extension page loads with a persisted non-English language
- **THEN** the first rendered frame shows text in the persisted language with no visible switch from English

### Requirement: Locale-aware date and time formatting

The system SHALL format dates and times using the active locale rather than a hardcoded `en-US` locale.

#### Scenario: Clock formatting follows locale
- **WHEN** the active language is `zh` and the clock is visible
- **THEN** the date and time are formatted according to the `zh` locale conventions

### Requirement: All user-facing UI text is translatable

The system SHALL source user-facing UI strings from locale dictionaries via `t()` rather than hardcoded literals, and SHALL ship complete `en` and `zh` dictionaries.

#### Scenario: No hardcoded English in translated components
- **WHEN** a component in scope renders user-facing text
- **THEN** that text comes from a locale dictionary keyed lookup, not a hardcoded string literal
