# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Neko-Tab is a Chrome/Firefox MV3 extension that overrides the browser new tab page with a terminal-style start page (React + TypeScript + Vite). There is no backend and no test suite — all state lives in `localStorage` / `chrome.storage.local`, and "correctness" is verified by a clean TypeScript build plus manual load-unpacked testing.

## Commands

```bash
npm install                        # install deps
npm run dev                        # Vite dev server (browser-only; chrome.* APIs are absent, so extension features no-op)
npm run build                      # tsc typecheck + vite build → dist/ (also runs manifest injection)
./node_modules/.bin/vite build     # build without the tsc gate (rarely needed; prefer npm run build)
npm run preview                    # serve the built dist/
```

- **There are no lint or test commands** — `npm run build` (which runs `tsc &&` first) is the only gate. Zero TypeScript errors is required before pushing.
- To load the extension: `npm run build`, then Chrome/Edge → Extensions → Load unpacked → select `dist/`.
- Dev server is only useful for pure UI work; anything touching `chrome.*` (tabs, history, identity, blocking) must be tested as a loaded unpacked extension.

## Runtime State Architecture

There is no state-management library and no server. `useLocalStorage<T>(key, default)` (`src/hooks/useLocalStorage.ts`) is the backbone of all persistent state. Understand these behaviors before touching state:

- **Deep-merge on read:** stored objects are merged over the default value, so adding a new field to `DEFAULT_SETTINGS` is safe for existing users — old data won't clobber it. Migrations for renamed/moved keys are done inline in the read initializer (see the `showGoogleCalendar` → `connectors['google-calendar']` migration).
- **Cross-component sync:** every write dispatches a `neko-storage-sync` CustomEvent (same tab) and the native `storage` event (other tabs). Multiple `useLocalStorage` instances on the same key stay in sync automatically. Don't build your own sync — reuse the hook.
- **Settings pre-warm:** `index.html`/`main.tsx` seed `window.__NEKO_SETTINGS__` before React mounts so the correct theme paints instantly. The settings hook reads that first to avoid a flash. The inline `<style>` in `index.html` is CSP-hashed (see MV3 rules below) — changing it requires updating the hash.
- Two storage layers coexist: **React UI state** uses `localStorage` (keys table below); the **background service worker** (`public/background.js`, focus-mode blocking) uses `chrome.storage.local` with its own keys (`focusBlocking`, `neko_startup_sites`, `focus-distraction-log:*`). They communicate via `chrome.runtime.sendMessage` and `chrome.storage.local.onChanged`, not shared reads.

## CSS Architecture

`src/index.css` is a **pure `@import` manifest** — never add rules there. Each concern has its own file in `src/styles/`; add a new file and an `@import` line. Themes live in `themes.css` / `themes-animated.css` and are applied by setting a class on the root `.app` div (`settings.theme`).

## Core Principles
When working with this codebase, prioritize readability over cleverness. Ask clarifying questions before making architectural changes.

## Branch & PR Workflow

**Always work in a feature branch. Never commit directly to `main`.**

```bash
git checkout main && git pull origin main
git checkout -b <type>/<short-description>
# do the work
git push origin <branch-name>
# open PR on GitHub — review and merge is up to Raj
```

Branch naming:
- `feat/` — new feature
- `fix/` — bug fix
- `chore/` — cleanup, refactoring, non-functional changes
- `docs/` — documentation only

**CLAUDE.md is the only file that can be updated directly on `main`.**

PR descriptions should clearly state:
- What changed and why
- Any side effects or things to watch out for
- If it closes an issue, mention it (`Closes #N`)

---

## 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked
- No abstractions for single-use code
- No "flexibility" or "configurability" that wasn't requested
- No error handling for impossible scenarios
- If you write 200 lines and it could be 50, rewrite it

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting
- Don't refactor things that aren't broken
- Match existing style, even if you'd do it differently
- If you notice unrelated dead code, mention it — don't delete it without asking

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused
- Don't remove pre-existing dead code unless explicitly asked

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## Workflow Patterns

### Research → Plan → Code → Commit → PR
1. **Research**: Read relevant files, understand context
2. **Plan**: State approach before coding
3. **Code**: Implement on a feature branch
4. **Build**: Run `./node_modules/.bin/vite build` to verify no errors
5. **Commit**: Clear commit messages describing the change
6. **PR**: Push branch and open a PR — Raj reviews and merges

## Code Standards

- Use clear, descriptive variable and function names
- Write self-documenting code with minimal comments
- Comments should explain "why", not "what"
- Keep functions small and focused on single responsibility
- Prefer composition over inheritance
- Follow existing patterns in the codebase
- Always run a build before pushing — zero TypeScript errors required


## Project Structure

```
src/
  components/   # React components, one per file
  connectors/   # Third-party integration modules, one folder per connector
    types.ts    # Connector interface and helpers
    registry.ts # Registry that collects all connectors
    google-calendar/  # Google Calendar connector (reference implementation)
  hooks/        # useLocalStorage, useSettings, useBookmarks, useTime
  utils/        # imageToAscii
  types.ts      # Shared TypeScript interfaces
  styles/       # Split CSS files, imported via index.css manifest
  index.css     # Pure @import manifest — do not add styles here directly
  App.tsx       # Root layout
public/
  manifest.json # Chrome Extension MV3 — placeholders injected at build time
  background.js # Service worker (focus mode blocking)
  dist.pem      # Extension private key — DO NOT regenerate, DO NOT commit changes
screenshots/    # Only image.png and terminal.png are used in README
docs/
  superpowers/
    specs/      # Design docs and specs
```

## Build System & Manifest Injection

`vite.config.ts` runs a `closeBundle` plugin that builds `dist/manifest.json` from the template in `public/`:

- **Google OAuth2**: Parses `manifest.json` as JSON. If `GOOGLE_CLIENT_ID` is present in `.env.local`, it's injected into the `oauth2.client_id` field. If missing, the entire `oauth2` block is deleted and `"identity"` is removed from permissions — making the extension fully functional without Calendar.
- **Extension key**: If `GOOGLE_EXTENSION_KEY` is valid base64, it's set as `manifest.key`. Otherwise the `key` field is stripped entirely (safe for local dev without OAuth).
- Errors in manifest injection are logged but do NOT fail the build — contributors should always get a working build.

`.env.local.example` documents the optional variables. Never hardcode client IDs in source.

## Chrome Extension — MV3 Rules

These are hard constraints. Violating them causes silent failures and extension instability:

**CSP (Content Security Policy)**
- `manifest.json` must declare `content_security_policy.extension_pages` explicitly
- Inline `<style>` blocks in `index.html` require their SHA-256 hash in the CSP `style-src`
- When adding or changing the inline style block, get the hash from the Chrome extension error console and add it: `'sha256-XXXX='`
- Current required hash: `sha256-9h6cMlG+wehv5PIl9iqaQcU8WSqE0ANpgmuDQF5LX6I=` (matches the instant-background `<style>` in `index.html`)
- External font loading (`fonts.googleapis.com`, `fonts.gstatic.com`, `cdn.jsdelivr.net`) must be in `style-src` / `font-src`
- Do NOT add `<link rel="preconnect">` or `<link rel="dns-prefetch">` to `index.html` for external domains — MV3 CSP blocks them on extension pages and Chrome logs violations that accumulate and destabilize the extension

**Google Identity / OAuth**
- The OAuth client in Google Cloud Console must be type **"Chrome extension"**, not "Web application"
- For Chrome extension type clients, Google handles the redirect URI automatically — do NOT manually add `chromiumapp.org` URIs
- The `Item ID` field in the Cloud Console must match the unpacked extension ID (derived from `dist.pem`)
- Extension ID is stable as long as the `key` field is present in `manifest.json`
- `dist.pem` is the private key that determines the extension ID — never regenerate it

**`chrome.identity` usage**
- `getAuthToken({ interactive: false })` on mount will fail silently at browser startup (cold token cache)
- Do NOT write `CALENDAR_CONNECTED=false` to localStorage on `lastError` — this causes Chrome to re-validate OAuth on every new tab and destabilizes the extension
- Only set `CALENDAR_CONNECTED=false` on explicit user disconnect, not on transient errors


## Extension Persistence (Unpacked / Dev)

Chrome and Brave do NOT persist unpacked extensions across restarts if the extension registration is stale or corrupt. Symptoms:
- Extension disappears from `chrome://extensions` after browser restart
- `chrome://extensions` shows `newtab` override as `[]` (empty)
- Extension ID is not present in `~/.config/google-chrome/Default/Extensions/`

**Root causes and fixes:**

1. **Missing `key` in built manifest** — without `key`, Chrome assigns a random ID each install. The `key` must be the base64 public key derived from `dist.pem`. The Vite build pipeline handles this automatically from `.env.local`.

2. **CSP violations on extension page load** — inline styles or external preconnect links that violate the CSP cause Chrome to log errors on every new tab. Accumulation of these errors causes Chrome to drop the extension after restart. Fix: ensure CSP includes the correct SHA-256 hash for inline styles and remove all external preconnect/dns-prefetch links from `index.html`.

3. **Stale/duplicate extension entry in browser Preferences** — if the extension was loaded before the `key` was set, a stale entry with a different ID may conflict. Fix: remove the stale entry from `~/.config/google-chrome/Default/Preferences` or `~/.config/BraveSoftware/Brave-Browser/Default/Preferences` using the Python cleanup script below, then reload unpacked.

**Cleanup script for stale Preferences entries:**
```python
import json, shutil

# Use the correct path for your browser:
# Chrome:  ~/.config/google-chrome/Default/Preferences
# Brave:   ~/.config/BraveSoftware/Brave-Browser/Default/Preferences
path = "/home/rajauluddin/.config/BraveSoftware/Brave-Browser/Default/Preferences"
shutil.copy(path, path + ".bak")

with open(path) as f:
    prefs = json.load(f)

ext_id = "bjmcgcoepohfafggeieneebblajgijcb"
settings = prefs["extensions"]["settings"]
if ext_id in settings:
    del settings[ext_id]

for section in ["settings", "settings_encrypted_hash"]:
    macs = prefs.get("protection", {}).get("macs", {}).get("extensions", {}).get(section, {})
    if ext_id in macs:
        del macs[ext_id]

with open(path, "w") as f:
    json.dump(prefs, f, separators=(',', ':'))
```
Run with browser fully closed. Then reopen and Load unpacked → `dist/`.

**Extension ID:** `bjmcgcoepohfafggeieneebblajgijcb` (stable, derived from `dist.pem`)


## localStorage Keys

| Key | Contents |
|---|---|
| `startpage-settings` | Main Settings object (connector configs are under `connectors.{id}`) |
| `neko-bookmarks` | BookmarkCategory[] |
| `neko-bg-image` | base64 background image |
| `neko-scratchpad` | notes text |
| `neko-checklist` | CheckItem[] |
| `neko-journal` | Record<YYYY-MM-DD, string> |
| `neko-daily-goal` | { text, date } |
| `neko-aliases` | UrlAlias[] |
| `neko-recent` | RecentItem[] (last 10 launches) |
| `neko-timer-start` | timestamp or null |
| `neko-font` | selected font family string |
| `neko-gh-streak-{user}` | cached GitHub streak data |
| `neko-calendar-connected` | `'true'` or `'false'` string |
| `neko-calendar-last-event` | JSON CalendarEvent or absent |

## Connector System (Integrations)

Connectors live in `src/connectors/<name>/` and follow a standard `Connector` interface (`src/connectors/types.ts`):

```typescript
interface Connector {
  id: string
  name: string
  description: string
  placement: 'center-widget' | ConnectorPlacement[]
  defaultConfig: Record<string, unknown>
  Widget?: React.ComponentType              // Rendered on new tab page
  SettingsWidget?: React.ComponentType      // Rendered in Settings → Integrations
  oauth2ClientIdPlaceholder?: string        // For Google OAuth (chrome.identity)
  oauth2Scopes?: string[]
  manifestPermissions?: string[]            // Extra permissions needed
}
```

The registry (`src/connectors/registry.ts`) collects all connectors. The app and settings panel iterate the registry rather than hardcoding individual integrations.

### Adding a new connector
1. Create `src/connectors/<name>/` with `index.ts`, your hooks, components
2. Export a `Connector` object from `index.ts`
3. Import and add it to the `connectors` array in `registry.ts`
4. That's it — build, app, and settings pick it up automatically

### Google Calendar (reference connector)
- Hook: `src/connectors/google-calendar/useGoogleCalendar.ts`
- Widget: `src/connectors/google-calendar/UpcomingEvent.tsx`
- Settings: `src/connectors/google-calendar/settings.tsx`
- OAuth client ID injected at build time from `.env.local` → `GOOGLE_CLIENT_ID`
- Calendar permission scope: `https://www.googleapis.com/auth/calendar.events.readonly`
- Token is fetched non-interactively on mount; interactive only on explicit user connect
- `CALENDAR_CONNECTED` localStorage key is used to pre-reserve UI space before token is confirmed — do not reset it on transient startup errors

## PR Review Checklist for Contributors

When reviewing PRs that touch the extension manifest or OAuth:
- [ ] No hardcoded client IDs or API keys in source files
- [ ] `.env.local` values accessed via `import.meta.env.VITE_*` or Vite build injection only
- [ ] No `<link rel="preconnect">` to external domains added to `index.html`
- [ ] If inline styles are added/changed in `index.html`, the CSP hash must be updated
- [ ] `chrome.identity` error handlers do not write negative state to localStorage on transient failures
- [ ] Extension key (`dist.pem`) not regenerated or modified

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current


---

# Appended Project Rules (from ~/.claude/rules-archive)

> Source: typescript/, react/, web/. Overlapping topics (coding-style, security, testing) are intentionally omitted — they are covered by the global zh rules.
---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Patterns

> This file extends [common/patterns.md](../common/patterns.md) with TypeScript/JavaScript specific content.

## API Response Format

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}
```

## Custom Hooks Pattern

```typescript
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
```

## Repository Pattern

```typescript
interface Repository<T> {
  findAll(filters?: Filters): Promise<T[]>
  findById(id: string): Promise<T | null>
  create(data: CreateDto): Promise<T>
  update(id: string, data: UpdateDto): Promise<T>
  delete(id: string): Promise<void>
}
```
---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/components/**/*.js"
  - "**/app/**/*.tsx"
  - "**/pages/**/*.tsx"
---
# React Patterns

> This file extends [typescript/patterns.md](../typescript/patterns.md) and [common/patterns.md](../common/patterns.md) with React specific content. For hook-specific rules see [hooks.md](./hooks.md).

## Container / Presentational Split

Container components own data fetching, state, and side effects. Presentational components receive props and render — no service calls, no hooks beyond local UI state.

```tsx
// Container — owns data
export function UserPage({ userId }: { userId: string }) {
  const { data: user, isLoading } = useUser(userId);
  if (isLoading) return <Spinner />;
  if (!user) return <NotFound />;
  return <UserCard user={user} onSelect={handleSelect} />;
}

// Presentational — pure
export function UserCard({ user, onSelect }: { user: User; onSelect: (id: string) => void }) {
  return <button onClick={() => onSelect(user.id)}>{user.name}</button>;
}
```

## State Location Decision Tree

1. Used by one component → `useState` inside it
2. Used by parent + a few children → lift to nearest common ancestor, pass via props
3. Used across distant branches → React Context **for low-frequency reads only** (theme, auth, locale)
4. High-frequency updates shared across the tree → external store (Zustand, Jotai, Redux Toolkit)
5. Server-derived data → server-state library (TanStack Query, SWR, RSC fetch) — not application state

Context misused for frequently changing values causes every consumer to re-render on every update.

## Server / Client Component Boundary (RSC, Next.js App Router)

- Server Components are the default — they run on the server, do not ship to the client, and can `await` directly
- Client Components opt in with `"use client"` at the top of the file
- Data flows down: a Server Component can render a Client Component and pass serializable props
- A Client Component cannot import a Server Component, but it can receive one via `children` or named slots

```tsx
// Server (default)
export default async function Page() {
  const user = await fetchUser();
  return <UserClient user={user} />;
}

// Client
"use client";
export function UserClient({ user }: { user: User }) {
  const [tab, setTab] = useState("profile");
  return <Tabs value={tab} onChange={setTab}>{user.name}</Tabs>;
}
```

- Never import `"server-only"` packages (DB clients, secrets) from a Client Component file — wrap them in a Server Component or Server Action
- Mark sensitive modules with `import "server-only"` so the bundler errors if a client file imports them

## Suspense + Error Boundaries

Every Suspense boundary needs an Error Boundary above it. The pair handles both states.

```tsx
<ErrorBoundary fallback={<ErrorView />}>
  <Suspense fallback={<Skeleton />}>
    <UserDetails id={id} />
  </Suspense>
</ErrorBoundary>
```

- Place Suspense boundaries close to where data is needed, not at the route root
- Multiple narrower boundaries reveal loaded content progressively
- Error Boundary must be a Class Component (React 19 has no functional equivalent yet) OR use a library wrapper such as `react-error-boundary`

## Forms

### Uncontrolled (React 19 + form actions)

Prefer uncontrolled inputs with form actions when the form has a clear submit step. The browser owns the value; React reads it via `FormData` on submit.

```tsx
async function action(formData: FormData) {
  "use server";
  await saveUser({ name: String(formData.get("name")) });
}

export function UserForm() {
  return (
    <form action={action}>
      <input name="name" required />
      <button type="submit">Save</button>
    </form>
  );
}
```

### Controlled

Use controlled inputs when the value drives other UI, requires real-time validation, or formatting.

```tsx
const [email, setEmail] = useState("");
return <input value={email} onChange={(e) => setEmail(e.target.value)} />;
```

### Form Libraries

For complex forms (multi-step, dynamic field arrays, cross-field validation), use a library:

- React Hook Form — minimal re-renders, uncontrolled-first
- TanStack Form — typed, framework-agnostic
- Final Form — when subscription-based re-renders matter

## Data Fetching

| Strategy | When |
|---|---|
| RSC fetch (`await` in Server Component) | Per-request data in Next.js App Router, no client-side cache needed |
| TanStack Query | Client-side cache, mutations, optimistic updates, polling |
| SWR | Lightweight cache + revalidation, simpler than TanStack Query |
| `fetch` in `useEffect` | Avoid — race conditions, no cache, no retry. Only acceptable for one-off fire-and-forget |

Never fetch in a `useEffect` when a real cache library is available — they handle deduping, cache invalidation, error retry, and Suspense integration.

## Lists and Keys

- `key` must be stable across renders — never `index` for any list that can reorder, insert, or delete
- `key` must be unique among siblings, not globally
- A reordered list with index keys causes state in child components to attach to the wrong row

## Composition over Inheritance

- Pass `children` for slot-style composition
- Pass render-prop functions for parameterized rendering
- Pass component types for plug-in points: `renderItem={UserRow}`
- Never extend a component class to specialize behavior

## Compound Components

For related controls (Tabs, Accordion, Menu), use compound components sharing state via Context:

```tsx
<Tabs defaultValue="profile">
  <Tabs.List>
    <Tabs.Trigger value="profile">Profile</Tabs.Trigger>
    <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="profile"><ProfileForm /></Tabs.Panel>
  <Tabs.Panel value="settings"><SettingsForm /></Tabs.Panel>
</Tabs>
```

## Portals

Use `createPortal` for modals, tooltips, toast containers — anything that must escape the parent's `overflow: hidden` or `z-index` stacking context. Render to a stable DOM node mounted in `index.html`.

## Refs and Forwarding (React 19+)

React 19 lets function components accept `ref` as a regular prop — `forwardRef` is no longer required.

```tsx
export function Input({ ref, ...rest }: { ref?: React.Ref<HTMLInputElement> } & InputProps) {
  return <input ref={ref} {...rest} />;
}
```

Older codebases on React 18 still need `forwardRef`.

## Out of Scope (Pointer Sections)

### Next.js (App Router)

- Server Actions, Route Handlers, Middleware, Parallel/Intercepted Routes, streaming Metadata
- Treated as a separate framework concern — when adding deep Next-specific patterns, propose a dedicated `rules/nextjs/` track
- For now follow Next.js official docs for App Router specifics

### React Native

- Platform-specific imports (`Platform.OS`, `.ios.tsx` / `.android.tsx`), `StyleSheet`, navigation libraries (React Navigation, Expo Router)
- Treated as a separate track — `rules/react-native/` is not yet present
- React core hooks/patterns from this file still apply

## Skill Reference

For React-specific deep dives see `skills/react-patterns/SKILL.md`. For cross-framework frontend concerns see `skills/frontend-patterns/SKILL.md`. For accessibility see `skills/accessibility/SKILL.md`.
---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/hooks/**/*.ts"
  - "**/hooks/**/*.js"
  - "**/use-*.ts"
  - "**/use-*.tsx"
---
# React Hooks

> This file covers **React hooks** (`useState`, `useEffect`, `useMemo`, `useCallback`, custom hooks) — NOT the Claude Code `hooks/` runtime system. Naming matches the per-language convention `rules/<lang>/hooks.md` used across this repo.
>
> Extends [typescript/patterns.md](../typescript/patterns.md) and [common/patterns.md](../common/patterns.md).

## Rules of Hooks

Enforce `eslint-plugin-react-hooks` with `react-hooks/rules-of-hooks` set to error.

1. Hooks only at the top level of a function component or another hook
2. Never in loops, conditionals, nested functions, or after early returns
3. Always called in the same order on every render
4. Only inside React function components or custom hooks (functions starting with `use`)

```tsx
// WRONG: conditional hook
function Foo({ enabled }: { enabled: boolean }) {
  if (enabled) {
    const [x, setX] = useState(0); // rule violation
  }
}

// CORRECT: hook unconditional, condition inside
function Foo({ enabled }: { enabled: boolean }) {
  const [x, setX] = useState(0);
  if (!enabled) return null;
  return <span>{x}</span>;
}
```

## `useEffect` — When NOT to Use

`useEffect` is for synchronizing with external systems (subscriptions, browser APIs, third-party libraries). It is **not** the right tool for:

- Derived state — compute it during render
- Transforming data for rendering — compute it during render
- Resetting state when a prop changes — use a `key` on the parent or derive from props
- Notifying parents of state changes — call the callback in the event handler
- Initializing app-level singletons — call the function module-side or in `main.tsx`

```tsx
// WRONG: effect for derived state
const [fullName, setFullName] = useState("");
useEffect(() => {
  setFullName(`${first} ${last}`);
}, [first, last]);

// CORRECT: derive during render
const fullName = `${first} ${last}`;
```

## Dependency Arrays

- Always include every reactive value referenced inside the effect/callback
- Enable `react-hooks/exhaustive-deps` lint rule — never silence it without a comment explaining why
- If the dep array grows unwieldy, the effect is doing too much — split it
- Stable identity for functions passed in deps: wrap in `useCallback` only when the function is itself a dependency of another hook or passed to a memoized child

## Cleanup

Every subscription, interval, listener, or in-flight request must clean up.

```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal }).then(handleResponse);
  return () => controller.abort();
}, [url]);
```

```tsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, []);
```

Missing cleanup = race conditions when deps change, memory leaks on unmount.

## `useMemo` and `useCallback` — When Worth It

Default position: **do not memoize**. Add `useMemo` / `useCallback` only when:

1. The value is passed to a `React.memo`-wrapped child as a prop, and identity matters
2. The value is a dependency of another `useEffect` / `useMemo` / `useCallback`
3. The computation is measurably expensive (profile before assuming)

Premature memoization adds noise, hides bugs, and can be slower than the recompute it replaces.

## Custom Hooks

Extract a custom hook when:

- The same hook sequence (state + effect + computed) appears in 2+ components
- The logic has a clear, nameable purpose (`useDebounce`, `useOnClickOutside`, `useLocalStorage`)
- You want to test the logic independently of any component

Do NOT extract when:

- It would have a single caller — inline it
- The "hook" is just `useState` with a different name — adds indirection, no value

```tsx
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
```

## `useState` Patterns

- Initial state from prop only at mount: pass a function `useState(() => computeInitial(prop))` when computation is expensive
- Functional updater when the new state depends on the old: `setCount(c => c + 1)` — never `setCount(count + 1)` inside async or batched contexts
- Group related state into one object only when they always change together; otherwise split into multiple `useState` calls
- Use `useReducer` once state transitions are conditional on the previous state or there are 3+ related values

## `useRef` Patterns

- DOM refs for imperative APIs (focus, scroll, third-party libs)
- Mutable container that does not trigger re-render (timer ids, previous values, "is mounted" flags)
- Never read or write `ref.current` during render — only inside effects or event handlers
- `useImperativeHandle` only when exposing a child API to a parent ref — last-resort escape hatch

## `useSyncExternalStore`

Use this hook to subscribe to any external store (browser API, third-party state lib, custom event emitter). It is the supported way to make external state safe with concurrent rendering.

```tsx
const isOnline = useSyncExternalStore(
  (cb) => {
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
    return () => {
      window.removeEventListener("online", cb);
      window.removeEventListener("offline", cb);
    };
  },
  () => navigator.onLine,
  () => true,
);
```

## React 19 Additions

- `use()` — unwrap promises and contexts inline; usable conditionally (only hook with that property)
- `useFormStatus()` / `useFormState()` (or `useActionState`) — form submission state without prop drilling
- `useOptimistic()` — optimistic UI updates while a server action is pending
- `useTransition()` — mark non-urgent state updates so urgent ones stay responsive

When the project targets React 19+, prefer these over hand-rolled equivalents.

## Stale Closure Trap

Async handlers and intervals capture the values from the render where they were created. Fix by:

1. Using the functional updater form of `setState`
2. Putting the changing value in the dep array of `useEffect` and rebuilding the handler
3. Reading from a ref that is kept in sync

## Lint Configuration

Required rules:

```json
{
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

Treat `exhaustive-deps` warnings as errors in CI for new code.
> This file extends [common/patterns.md](../common/patterns.md) with web-specific patterns.

# Web Patterns

## Component Composition

### Compound Components

Use compound components when related UI shares state and interaction semantics:

```tsx
<Tabs defaultValue="overview">
  <Tabs.List>
    <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
    <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="overview">...</Tabs.Content>
  <Tabs.Content value="settings">...</Tabs.Content>
</Tabs>
```

- Parent owns state
- Children consume via context
- Prefer this over prop drilling for complex widgets

### Render Props / Slots

- Use render props or slot patterns when behavior is shared but markup must vary
- Keep keyboard handling, ARIA, and focus logic in the headless layer

### Container / Presentational Split

- Container components own data loading and side effects
- Presentational components receive props and render UI
- Presentational components should stay pure

## State Management

Treat these separately:

| Concern | Tooling |
|---------|---------|
| Server state | TanStack Query, SWR, tRPC |
| Client state | Zustand, Jotai, signals |
| URL state | search params, route segments |
| Form state | React Hook Form or equivalent |

- Do not duplicate server state into client stores
- Derive values instead of storing redundant computed state

## URL As State

Persist shareable state in the URL:
- filters
- sort order
- pagination
- active tab
- search query

## Data Fetching

### Stale-While-Revalidate

- Return cached data immediately
- Revalidate in the background
- Prefer existing libraries instead of rolling this by hand

### Optimistic Updates

- Snapshot current state
- Apply optimistic update
- Roll back on failure
- Emit visible error feedback when rolling back

### Parallel Loading

- Fetch independent data in parallel
- Avoid parent-child request waterfalls
- Prefetch likely next routes or states when justified
> This file extends [common/patterns.md](../common/patterns.md) with web-specific design-quality guidance.

# Web Design Quality Standards

## Anti-Template Policy

Do not ship generic template-looking UI. Frontend output should look intentional, opinionated, and specific to the product.

### Banned Patterns

- Default card grids with uniform spacing and no hierarchy
- Stock hero section with centered headline, gradient blob, and generic CTA
- Unmodified library defaults passed off as finished design
- Flat layouts with no layering, depth, or motion
- Uniform radius, spacing, and shadows across every component
- Safe gray-on-white styling with one decorative accent color
- Dashboard-by-numbers layouts with sidebar + cards + charts and no point of view
- Default font stacks used without a deliberate reason

### Required Qualities

Every meaningful frontend surface should demonstrate at least four of these:

1. Clear hierarchy through scale contrast
2. Intentional rhythm in spacing, not uniform padding everywhere
3. Depth or layering through overlap, shadows, surfaces, or motion
4. Typography with character and a real pairing strategy
5. Color used semantically, not just decoratively
6. Hover, focus, and active states that feel designed
7. Grid-breaking editorial or bento composition where appropriate
8. Texture, grain, or atmosphere when it fits the visual direction
9. Motion that clarifies flow instead of distracting from it
10. Data visualization treated as part of the design system, not an afterthought

## Before Writing Frontend Code

1. Pick a specific style direction. Avoid vague defaults like "clean minimal".
2. Define a palette intentionally.
3. Choose typography deliberately.
4. Gather at least a small set of real references.
5. Use ECC design/frontend skills where relevant.

## Worthwhile Style Directions

- Editorial / magazine
- Neo-brutalism
- Glassmorphism with real depth
- Dark luxury or light luxury with disciplined contrast
- Bento layouts
- Scrollytelling
- 3D integration
- Swiss / International
- Retro-futurism

Do not default to dark mode automatically. Choose the visual direction the product actually wants.

## Component Checklist

- [ ] Does it avoid looking like a default Tailwind or shadcn template?
- [ ] Does it have intentional hover/focus/active states?
- [ ] Does it use hierarchy rather than uniform emphasis?
- [ ] Would this look believable in a real product screenshot?
- [ ] If it supports both themes, do both light and dark feel intentional?
> This file extends [common/performance.md](../common/performance.md) with web-specific performance content.

# Web Performance Rules

## Core Web Vitals Targets

| Metric | Target |
|--------|--------|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| FCP | < 1.5s |
| TBT | < 200ms |

## Bundle Budget

| Page Type | JS Budget (gzipped) | CSS Budget |
|-----------|---------------------|------------|
| Landing page | < 150kb | < 30kb |
| App page | < 300kb | < 50kb |
| Microsite | < 80kb | < 15kb |

## Loading Strategy

1. Inline critical above-the-fold CSS where justified
2. Preload the hero image and primary font only
3. Defer non-critical CSS or JS
4. Dynamically import heavy libraries

```js
const gsapModule = await import('gsap');
const { ScrollTrigger } = await import('gsap/ScrollTrigger');
```

## Image Optimization

- Explicit `width` and `height`
- `loading="eager"` plus `fetchpriority="high"` for hero media only
- `loading="lazy"` for below-the-fold assets
- Prefer AVIF or WebP with fallbacks
- Never ship source images far beyond rendered size

## Font Loading

- Max two font families unless there is a clear exception
- `font-display: swap`
- Subset where possible
- Preload only the truly critical weight/style

## Animation Performance

- Animate compositor-friendly properties only
- Use `will-change` narrowly and remove it when done
- Prefer CSS for simple transitions
- Use `requestAnimationFrame` or established animation libraries for JS motion
- Avoid scroll handler churn; use IntersectionObserver or well-behaved libraries

## Performance Checklist

- [ ] All images have explicit dimensions
- [ ] No accidental render-blocking resources
- [ ] No layout shifts from dynamic content
- [ ] Motion stays on compositor-friendly properties
- [ ] Third-party scripts load async/defer and only when needed
