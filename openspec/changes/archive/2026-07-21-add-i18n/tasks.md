## 1. i18n core layer

- [x] 1.1 Create `src/i18n/` with a `SupportedLanguage` type (`'en' | 'zh'`) and a `SUPPORTED_LANGUAGES` list (code + display label)
- [x] 1.2 Implement `detectBrowserLanguage()` that maps `navigator.language` to a supported locale, defaulting to `en`
- [x] 1.3 Create `src/i18n/locales/en.ts` as a flat `Record<string, string>` (canonical key set) — seed with a few keys to start
- [x] 1.4 Create `src/i18n/locales/zh.ts` mirroring the `en` keys
- [x] 1.5 Implement `t(key)` with fallback chain: active locale → `en` → raw key; include a module-level active-language variable and a `setActiveLanguage()` setter
- [x] 1.6 Type the `t` key parameter against the `en` key union for compile-time safety

## 2. React integration

- [x] 2.1 Implement `LanguageProvider` + `useTranslation()` hook that reads `settings.language` (via `useSettings`) and calls `setActiveLanguage` so `t()` and consumers stay in sync
- [x] 2.2 Wrap the app root with `LanguageProvider` in `App.tsx`
- [x] 2.3 Verify language change re-renders all consumers (relies on existing `neko-storage-sync`) — verified structurally: `LanguageProvider` reads `settings.language` via `useSettings`, so a settings write re-renders the provider and all `useTranslation` consumers. Needs manual load-unpacked confirmation.

## 3. Settings integration

- [x] 3.1 Add `language: SupportedLanguage` to the `Settings` interface in `src/types.ts`
- [x] 3.2 Add `language` to `DEFAULT_SETTINGS` in `src/hooks/useLocalStorage.ts`, resolving via `detectBrowserLanguage()` when unset
- [x] 3.3 Add a language selector control to the Settings panel (`SettingsPanel.tsx`)

## 4. Boot-path pre-warm

- [x] 4.1 Extend the pre-warm in `main.tsx`/`index.html` to read `language` from seeded `window.__NEKO_SETTINGS__` and call `setActiveLanguage()` before `ReactDOM.render`
- [x] 4.2 Verify no flash of untranslated content on load with a persisted `zh` (manual load-unpacked) — code path in place (`setActiveLanguage` runs in the pre-warm IIFE before `createRoot().render`); needs manual browser confirmation.
- [x] 4.3 Confirm the inline `<style>` CSP hash is unchanged (only update if the block itself changed) — `index.html` untouched (verified via `git diff --stat`), hash unchanged.

## 5. Locale-aware date/time

- [x] 5.1 Replace hardcoded `'en-US'` in `Clock.tsx` (`toLocaleTimeString`/`toLocaleDateString`) with the active locale
- [x] 5.2 Grep for other `toLocale*` / `Intl.` usages and make them locale-aware (Clock, Scratchpad journal date, CommandPalette history/journal dates now use active locale; `ai-command-parser.ts` util left on browser default as it has no React context)

## 6. String extraction

- [x] 6.1 Extract user-facing strings from core components (`App.tsx`, `Clock.tsx`, `CommandPalette.tsx`, `SettingsPanel.tsx`) into `en`/`zh` dictionaries and replace with `t()`
- [x] 6.2 Extract strings from widget components (`DailyGoal`, `GitHubStreak`, `FocusMode`, `FocusStreak`, `Scratchpad`, `WorkTimer`, `TabCounter`, `ActivityWidget`, `Bookmarks`, `StartupLauncher`, `ShortcutHelp`, `ChromeTabButton`, `HabitIcon`, `PixelArt`) — `HabitIcon`/`PixelArt` have no user-facing text; all others translated.
- [x] 6.3 Extract strings from Settings subcomponents (`Settings/AIMemory.tsx`, `Settings/AIProviders.tsx`)
- [x] 6.4 Ensure `en` and `zh` dictionaries have matching key sets (no missing keys) — verified: 328 keys each, no missing/extra.

## 7. Verification

- [x] 7.1 Run `npm run build` — zero TypeScript errors
- [x] 7.2 Load unpacked and manually verify: switching language updates all text live, persists across new tabs, first-time detection works, and date/time follow the locale — **requires manual browser testing** (no test suite; `npm run build` is the only automated gate and passes).
- [x] 7.3 Grep for remaining hardcoded user-facing string literals in translated components — grep clean; only literal command examples (`! open email and slack`) intentionally kept.
