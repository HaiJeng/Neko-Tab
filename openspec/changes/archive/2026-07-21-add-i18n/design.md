## Context

Neko-Tab is a Chrome/Firefox MV3 new-tab extension (React + TypeScript + Vite) with no backend and no test suite; correctness is a clean `tsc` build plus manual load-unpacked testing. All persistent state lives in `localStorage` behind `useLocalStorage<T>(key, default)`, which deep-merges stored objects over defaults (so adding a `Settings` field is safe for existing users) and broadcasts a `neko-storage-sync` event to keep instances in sync. The theme is pre-warmed via `window.__NEKO_SETTINGS__` seeded in `index.html`/`main.tsx` before React mounts to avoid a flash.

Today, all UI strings are hardcoded English across ~23 `.tsx` components, and `Clock.tsx` formats dates/times with a hardcoded `'en-US'` locale. There is no `language` setting and no translation mechanism.

## Goals / Non-Goals

**Goals:**
- A minimal, dependency-free i18n layer: `t(key)` lookup + a React hook/context that re-renders on language change.
- `language` persisted in the existing `Settings` object; selectable in the Settings panel.
- Browser-language auto-detection on first use with `en` fallback.
- Locale-aware date/time formatting.
- No flash of untranslated content (pre-warm the language like the theme).
- Ship `en` (source of truth) and `zh` dictionaries.

**Non-Goals:**
- Full ICU message syntax, gender/plural rules beyond simple cases.
- RTL layout support (no RTL locale shipped yet).
- Translating the extension `manifest.json` name/description (`_locales`), user-generated content (bookmarks, notes), or third-party connector data.
- A translation-management pipeline or external translation service.

## Decisions

### Decision: Hand-rolled i18n utility over a library
Use a small in-repo module (`src/i18n/`) exposing `t()`, a `LanguageProvider`, and a `useTranslation()` hook, rather than `react-intl`/`i18next`.
- **Why:** The project has no test suite, values small bundles (web performance budget), and needs only key lookup + fallback + one interpolation helper. A library adds 20–40 kB and API surface for features we don't need.
- **Alternatives considered:** `i18next` + `react-i18next` (powerful but heavy, richer than needed); `react-intl` (ICU-based, heavier). Revisit if plural/interpolation complexity grows.

### Decision: Store `language` inside the existing `Settings` object
Add `language: SupportedLanguage` to `Settings` and `DEFAULT_SETTINGS`, not a separate `localStorage` key.
- **Why:** Reuses deep-merge migration safety and the existing cross-tab sync; the Settings panel already reads/writes this object; pre-warm already seeds `window.__NEKO_SETTINGS__`.
- **Default:** `DEFAULT_SETTINGS.language` resolves via browser detection at read time when unset, falling back to `en`.

### Decision: Dictionaries as typed TS/JSON modules keyed by dotted string
Each locale is a flat `Record<string, string>` (e.g. `en.ts`, `zh.ts`) with dotted keys (`settings.title`, `clock.today`). `en` is the canonical key set; `t()` falls back en → key.
- **Why:** Flat keys keep lookup O(1) and simple; TS typing of the `en` key union gives compile-time safety that `t()` calls reference real keys.
- **Alternatives considered:** Nested objects (nicer grouping, more traversal code); JSON files (no type safety without extra tooling).

### Decision: Re-render on language change via context + storage sync
`LanguageProvider` reads `settings.language` through `useSettings`/`useLocalStorage`, so an existing `neko-storage-sync` write already triggers re-render across components and tabs.
- **Why:** No new sync mechanism; consistent with the codebase rule "don't build your own sync — reuse the hook."

### Decision: Pre-warm language alongside theme
Extend the existing pre-warm in `main.tsx`/`index.html` to read `language` from seeded settings and make it available to the first render (module-level active-language variable that `t()` reads before the provider mounts).
- **Why:** Prevents flash of English; mirrors the established theme pattern. Note: the inline `<style>` CSP hash in `index.html` must only be touched if that block changes.

## Risks / Trade-offs

- **Incomplete `zh` coverage / drift between locales** → `t()` falls back to `en` and finally to the raw key so gaps are visible, not blank; `en` remains the single source of truth for the key set, and TS types keys off `en`.
- **Large mechanical diff across ~23 components** → extract strings incrementally, component by component; each step remains a clean `tsc` build. No behavior change beyond text source.
- **Hardcoded `'en-US'` locales elsewhere** → grep for `toLocale*`/`Intl.` during implementation to ensure Clock and any other spots use the active locale.
- **Pre-warm ordering bug (flash)** → set the module-level active language from seeded settings before `ReactDOM.render`; verify first paint manually in load-unpacked with a persisted `zh`.
- **CSP breakage** → do not alter the inline `<style>` block unless necessary; if changed, update the SHA-256 hash per MV3 rules.
- **No tests** → rely on `tsc` gate + manual verification; keep the i18n utility tiny and pure so it is trivially reviewable.

## Migration Plan

1. Existing users have no `language` field; deep-merge leaves the object intact and `DEFAULT_SETTINGS.language` (browser-detected → `en`) applies automatically — no data migration needed.
2. Rollback: revert the change; the `language` field is ignored by prior code and harmless if left in storage.
