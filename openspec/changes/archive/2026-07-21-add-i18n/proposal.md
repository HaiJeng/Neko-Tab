## Why

All UI text in Neko-Tab is hardcoded in English across ~23 components, and date/time formatting is pinned to `'en-US'` locale strings. Non-English users cannot use the extension in their language, and there is no mechanism to add translations. Adding internationalization opens the extension to a wider audience with minimal runtime cost.

## What Changes

- Introduce a lightweight i18n layer: a `t(key)` translation function backed by locale JSON dictionaries, with a React hook/context so components re-render on language change.
- Add a `language` field to `Settings` (default: browser-detected, fallback `en`), persisted via the existing `useLocalStorage` settings object.
- Add a language selector to the Settings panel.
- Extract hardcoded UI strings from components into locale dictionaries (start with `en` as the source-of-truth, plus one additional locale — `zh` — as the reference translation).
- Replace hardcoded `'en-US'` in date/time formatting (Clock, and any other `toLocale*` calls) with the active locale.
- Pre-warm the selected language before React mounts (mirroring the existing theme pre-warm via `window.__NEKO_SETTINGS__`) to avoid a flash of untranslated content.

## Capabilities

### New Capabilities
- `internationalization`: Locale management, translation lookup (`t` function + React hook), language selection/persistence, browser-language detection, and locale-aware date/time formatting.

### Modified Capabilities
<!-- No existing OpenSpec specs in openspec/specs/ — nothing to modify. -->

## Impact

- **New code**: `src/i18n/` (translation function, context/provider, hook, locale JSON files for `en`/`zh`).
- **Types**: `Settings` gains a `language` field (`src/types.ts`); `DEFAULT_SETTINGS` updated (`src/hooks/useLocalStorage.ts`).
- **Components**: ~23 `.tsx` files have strings extracted and replaced with `t()` calls; `Clock.tsx` date/time formatting becomes locale-aware; a language selector added to the Settings panel.
- **Boot path**: `index.html` / `main.tsx` pre-warm updated to seed the active language alongside theme.
- **No new heavy dependency**: implement a minimal in-repo i18n utility rather than pulling in `react-intl`/`i18next` (keeps bundle small per web performance budget); revisit if pluralization/interpolation needs grow.
- **No backend impact**: all state remains client-side in `localStorage`.
