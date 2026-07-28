import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useBookmarks, useLocalStorage, useSettings } from '../hooks/useLocalStorage'
import type { UrlAlias, ThemeType } from '../types'
import { Search, Earth } from 'lucide-react'
import { openChromeNewTab } from './ChromeTabButton'
import { AsciiPreviewPanel } from './AsciiPreviewPanel'
import { recordTabUsage } from '../utils/tabUsage'
import { useOpenTabs } from '../hooks/useOpenTabs'
import { useAIProviders, generateAsciiArt, type AIToolName } from '../hooks/useAIProviders'
import { useAIMemory } from '../hooks/useAIMemory'
import { buildContext, fetchFrequentDestinations, fetchRecentHistory, dispatchToolCall } from '../utils/ai-command-parser'
import { isSafeUrl } from '../utils/browser'
import { useTranslation } from '../i18n'
import type { TranslationKey } from '../i18n'
import { SUPPORTED_LANGUAGES } from '../i18n'
import type { ModelMessage } from 'ai'
import ReactMarkdown from 'react-markdown'

type ToolChip = {
  name: AIToolName
  label: string
  status: 'pending' | 'done' | 'error'
  urls?: string[]
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolChip[]
  error?: string
}

interface Result {
  id: string
  label: string
  sub: string
  url?: string
  action?: () => void
  icon: any
  type: 'alias' | 'bookmark' | 'search' | 'url' | 'recent' | 'command' | 'history' | 'calc' | 'tab' | 'ai'
}

interface RecentItem {
  label: string
  url: string
  ts: number
}

const SEARCH_ENGINES: Record<string, { name: string; url: string; labelKey: TranslationKey }> = {
  google:     { name: 'Google',     url: 'https://www.google.com/search?q=',           labelKey: 'cp.engine.google' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=',                 labelKey: 'cp.engine.duckduckgo' },
  baidu:      { name: 'Baidu',      url: 'https://www.baidu.com/s?wd=',                 labelKey: 'cp.engine.baidu' },
  github:     { name: 'GitHub',     url: 'https://github.com/search?q=',                labelKey: 'cp.engine.github' },
  youtube:    { name: 'YouTube',    url: 'https://www.youtube.com/results?search_query=', labelKey: 'cp.engine.youtube' },
}

function fuzzy(str: string, query: string): boolean {
  if (!query) return true
  const s = str.toLowerCase()
  const q = query.toLowerCase()
  let si = 0
  for (let qi = 0; qi < q.length; qi++) {
    while (si < s.length && s[si] !== q[qi]) si++
    if (si >= s.length) return false
    si++
  }
  return true
}

function isUrl(str: string): boolean {
  return /^https?:\/\//i.test(str) || /^[\w-]+\.\w{2,}(\/.*)?$/.test(str)
}

function tryCalc(expr: string): string | null {
  try {
    if (!/^[\d\s+\-*/.^()%]+$/.test(expr)) return null

    const source = expr.replace(/\s+/g, '')
    if (!source) return null

    let index = 0

    const consume = (char: string) => {
      if (source[index] === char) {
        index += 1
        return true
      }
      return false
    }

    const parseNumber = (): number | null => {
      const start = index
      let hasDigit = false

      while (/\d/.test(source[index] || '')) {
        index += 1
        hasDigit = true
      }

      if (source[index] === '.') {
        index += 1
        while (/\d/.test(source[index] || '')) {
          index += 1
          hasDigit = true
        }
      }

      if (!hasDigit) return null
      const value = Number(source.slice(start, index))
      return Number.isFinite(value) ? value : null
    }

    const parsePrimary = (): number | null => {
      if (consume('(')) {
        const value = parseExpression()
        if (value === null || !consume(')')) return null
        return value
      }

      if (consume('+')) return parsePrimary()
      if (consume('-')) {
        const value = parsePrimary()
        return value === null ? null : -value
      }

      return parseNumber()
    }

    const parsePower = (): number | null => {
      const left = parsePrimary()
      if (left === null) return null
      if (!consume('^')) return left

      const right = parsePower()
      if (right === null) return null
      return left ** right
    }

    const parseTerm = (): number | null => {
      let value = parsePower()
      if (value === null) return null

      while (true) {
        if (consume('*')) {
          const rhs = parsePower()
          if (rhs === null) return null
          value *= rhs
          continue
        }
        if (consume('/')) {
          const rhs = parsePower()
          if (rhs === null || rhs === 0) return null
          value /= rhs
          continue
        }
        if (consume('%')) {
          const rhs = parsePower()
          if (rhs === null || rhs === 0) return null
          value %= rhs
          continue
        }
        break
      }

      return value
    }

    const parseExpression = (): number | null => {
      let value = parseTerm()
      if (value === null) return null

      while (true) {
        if (consume('+')) {
          const rhs = parseTerm()
          if (rhs === null) return null
          value += rhs
          continue
        }
        if (consume('-')) {
          const rhs = parseTerm()
          if (rhs === null) return null
          value -= rhs
          continue
        }
        break
      }

      return value
    }

    const result = parseExpression()
    if (result === null || index !== source.length || !isFinite(result)) return null
    return parseFloat(result.toPrecision(12)).toString()
  } catch {
    return null
  }
}

function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayKey(): string {
  return toLocalDateKey(new Date())
}

// ── Slash command data ──

const THEME_LIST: { id: ThemeType; name: string }[] = [
  { id: 'carbon', name: 'Carbon' }, { id: 'paper', name: 'Paper' },
  { id: 'nord', name: 'Nord' }, { id: 'solarized', name: 'Solarized' },
  { id: 'matrix', name: 'Matrix' }, { id: 'dracula', name: 'Dracula' },
  { id: 'monokai', name: 'Monokai' }, { id: 'gruvbox', name: 'Gruvbox' },
  { id: 'tokyo-night', name: 'Tokyo Night' }, { id: 'catppuccin', name: 'Catppuccin' },
  { id: 'one-dark', name: 'One Dark' }, { id: 'rose-pine', name: 'Rosé Pine' },
  { id: 'everforest', name: 'Everforest' },
  { id: 'cyberpunk', name: 'Cyberpunk' }, { id: 'aurora', name: 'Aurora' },
  { id: 'synthwave', name: 'Synthwave' }, { id: 'vaporwave', name: 'Vaporwave' },
  { id: 'retro-terminal', name: 'Retro CRT' }, { id: 'sunset', name: 'Sunset' },
  { id: 'ocean', name: 'Ocean' }, { id: 'midnight', name: 'Midnight' },
  { id: 'chatgpt', name: 'ChatGPT' }, { id: 'claude', name: 'Claude' },
]

const FONT_LIST = [
  'JetBrains Mono', 'Geist Mono', 'Space Mono', 'Fira Code',
  'Cascadia Code', 'IBM Plex Mono', 'Intel One Mono', 'Iosevka',
  'Commit Mono', 'Source Code Pro', 'Inconsolata', 'Hack',
]

const SLASH_COMMANDS: { name: string; descKey: TranslationKey; icon: any; hint?: string }[] = [
  { name: 'chrome-tab', descKey: 'cp.cmd.chromeTab', icon: <Earth size={16} />, hint: '' },
  { name: 'theme', descKey: 'cp.cmd.theme', icon: '◑', hint: '<name>' },
  { name: 'font', descKey: 'cp.cmd.font', icon: '𝐀', hint: '<name>' },
  { name: 'goal', descKey: 'cp.cmd.goal', icon: '▸', hint: '<text>' },
  { name: 'note', descKey: 'cp.cmd.note', icon: '✎', hint: '<text>' },
  { name: 'clock', descKey: 'cp.cmd.clock', icon: '◷', hint: '12h | 24h' },
  { name: 'language', descKey: 'cp.cmd.language', icon: '⌘', hint: '<name>' },
  { name: 'export', descKey: 'cp.cmd.export', icon: '↓' },
  { name: 'clear', descKey: 'cp.cmd.clear', icon: '✕' },
]

export function CommandPalette() {
  const [isFocused, setIsFocused] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [engine, setEngine] = useState('google')
  const [toast, setToast] = useState<string | null>(null)
  const { t: tr } = useTranslation()
  const [historyResults, setHistoryResults] = useState<RecentItem[]>([])
  const { categories } = useBookmarks()
  const [settings, setSettings] = useSettings()
  const [aliases] = useLocalStorage<UrlAlias[]>('neko-aliases', [])
  const [recent, setRecent] = useLocalStorage<RecentItem[]>('neko-recent', [])
  const [, setDailyGoal] = useLocalStorage<{ text: string; date: string } | null>('neko-daily-goal', null)
  const [, setScratchpad] = useLocalStorage<string>('neko-scratchpad', '')
  const { tabs } = useOpenTabs()
  const { providers, activeProvider, streamChat, loadProviders } = useAIProviders()
  const activeProviderConfig = providers.find(p => p.provider === activeProvider) ?? null
  const { memories, saveMemory } = useAIMemory()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [asciiPreview, setAsciiPreview] = useState<{ art: string; description?: string } | null>(null)
  const [aiStreaming, setAiStreaming] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const pendingIdRef = useRef<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, setJournal] = useLocalStorage<Record<string, string>>('neko-journal', {})
  const fetchedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (isFocused && !fetchedRef.current) {
      fetchedRef.current = true
      fetchFrequentDestinations().then(historyMemories => {
        for (const m of historyMemories) {
          saveMemory(m.keyword, m.url, 'history')
        }
      })
    }
  }, [isFocused, saveMemory])

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])

  const addRecent = (label: string, url: string) => {
    setRecent(prev => {
      const filtered = prev.filter(r => r.url !== url)
      return [{ label, url, ts: Date.now() }, ...filtered].slice(0, 10)
    })
  }

  // Search browser history when query changes
  useEffect(() => {
    if (!query.trim() || query.startsWith('/') || query.startsWith('=')) {
      setHistoryResults([])
      return
    }
    if (typeof chrome === 'undefined' || !chrome.history) return
    chrome.history.search(
      { text: query, maxResults: 5, startTime: 0 },
      (items) => {
        if (chrome.runtime.lastError) {
          setHistoryResults([])
          return
        }
        const seen = new Set<string>()
        const mapped = items
          .filter(item => item.url && item.title)
          .map(item => ({ label: item.title!, url: item.url!, ts: item.lastVisitTime || 0 }))
          .filter(item => {
            if (seen.has(item.url)) return false
            seen.add(item.url)
            return true
          })
        setHistoryResults(mapped)
      }
    )
  }, [query])

  // Mirror theme class onto the palette so CSS vars resolve correctly
  const themeClass = settings.theme || 'carbon'

  // Global keyboard shortcuts — focus the input, don't open an overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        setQuery('/')
        setSelected(0)
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        if (query) setQuery('')
        else if (messages.length > 0) { setMessages([]); setAiError(null) }
        else inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [query, messages.length])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const resolveAlias = useCallback((key: string) => {
    return aliases.find(a => a.key === key)?.url
  }, [aliases])

  const sendChat = useCallback(async (userText: string) => {
    if (!activeProvider) {
      setAiError(tr('cp.chat.noProvider'))
      return
    }
    const trimmed = userText.trim()
    if (!trimmed || aiStreaming) return

    setAiError(null)

    const historyForApi: ModelMessage[] = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: trimmed },
    ]
    setMessages(prev => [
      ...prev,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '', toolCalls: [] },
    ])
    setQuery('')
    setSelected(0)
    setAiStreaming(true)

    // Pull recent history (last 48h) at send time so questions like
    // "what did I do yesterday" get real data — historyResults is filtered by
    // the current query and will be empty for open-ended asks.
    const recentHistory = await fetchRecentHistory(48, 40)
    const historyForContext = recentHistory.length > 0
      ? recentHistory
      : historyResults.slice(0, 10).map(h => ({ title: h.label, url: h.url, ts: h.ts }))

    const context = buildContext(
      aliases,
      categories,
      recent.slice(0, 10).map(r => ({ title: r.label, url: r.url })),
      historyForContext,
      memories,
      settings.customAsciiArt ?? settings.asciiArt,
    )

    try {
      const result = await streamChat(historyForApi, context)

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          const delta = chunk.text
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            return [...prev.slice(0, -1), { ...last, content: last.content + delta }]
          })
        } else if (chunk.type === 'tool-call') {
          const toolName = chunk.toolName as AIToolName
          const input = (chunk.input || {}) as Record<string, unknown>
          const displayLabel = String(
            input.url ?? input.key ?? input.query ?? input.keyword ?? input.date ?? toolName,
          )
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            const chip: ToolChip = { name: toolName, label: displayLabel, status: 'pending' }
            return [...prev.slice(0, -1), { ...last, toolCalls: [...(last.toolCalls || []), chip] }]
          })
          const outcome = await dispatchToolCall(toolName, input, {
            saveMemory,
            setJournal,
            resolveAlias,
            onOpenAsciiPreview: ({ art, description }) => setAsciiPreview({ art, description }),
          })
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            const outcomeUrls = outcome.status === 'done' ? outcome.urls : undefined
            const updated = (last.toolCalls || []).map((c, i, arr) =>
              i === arr.length - 1 ? { ...c, status: outcome.status, label: outcome.label, urls: outcomeUrls } : c,
            )
            return [...prev.slice(0, -1), { ...last, toolCalls: updated }]
          })
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        return [...prev.slice(0, -1), { ...last, error: errMsg }]
      })
    } finally {
      setAiStreaming(false)
    }
  }, [activeProvider, aiStreaming, messages, aliases, categories, recent, historyResults, memories, streamChat, saveMemory, setJournal, resolveAlias, tr])

  const results = useMemo<Result[]>(() => {
    const out: Result[] = []

    // ── Slash commands ──
    if (query.startsWith('/')) {
      const raw = query.slice(1)
      const spaceIdx = raw.indexOf(' ')
      const cmdName = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx)
      const args = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1)
      const hasSpace = spaceIdx !== -1

      if (!hasSpace) {
        // Show matching command suggestions
        for (const cmd of SLASH_COMMANDS) {
          if (fuzzy(cmd.name, cmdName)) {
            const item: Result = {
              id: `cmd-${cmd.name}`,
              label: `/${cmd.name}`,
              sub: cmd.hint ? `${tr(cmd.descKey)} — ${cmd.hint}` : tr(cmd.descKey),
              icon: cmd.icon,
              type: 'command',
            }
            switch (cmd.name) {
             case 'export':
                item.action = () => {
                  import('../utils/backup').then(m => m.exportSettings())
                  showToast(tr('cp.toast.exporting'))
                }
                break
              case 'clear':
                item.action = () => {
                  setRecent([])
                  showToast(tr('cp.toast.historyCleared'))
                }
                break
              case 'chrome-tab':
                item.action = () => openChromeNewTab()
                break
            }
            out.push(item)
          }
        }
        return out
      }

      // Command with arguments
      switch (cmdName) {
        case 'theme':
          for (const t of THEME_LIST) {
            if (!args || fuzzy(t.name, args) || fuzzy(t.id, args)) {
              out.push({
                id: `cmd-theme-${t.id}`,
                label: t.name,
                sub: settings.theme === t.id ? tr('cp.current') : tr('cp.applyTheme'),
                icon: '◑',
                type: 'command',
                action: () => {
                  setSettings(prev => ({ ...prev, theme: t.id }))
                  showToast(tr('cp.toast.themeChanged', { name: t.name }))
                },
              })
            }
          }
          break

        case 'font':
          for (const f of FONT_LIST) {
            if (!args || fuzzy(f, args)) {
              out.push({
                id: `cmd-font-${f}`,
                label: f,
                sub: settings.font === f ? tr('cp.current') : tr('cp.applyFont'),
                icon: '𝐀',
                type: 'command',
                action: () => {
                  setSettings(prev => ({ ...prev, font: f }))
                  showToast(tr('cp.toast.fontChanged', { name: f }))
                },
              })
            }
          }
          break

        case 'goal':
          if (args.trim()) {
            out.push({
              id: 'cmd-goal-set',
              label: args.trim().slice(0, 120),
              sub: tr('cp.setGoal'),
              icon: '▸',
              type: 'command',
              action: () => {
                setDailyGoal({ text: args.trim().slice(0, 120), date: todayKey() })
                showToast(tr('cp.toast.goalSet'))
              },
            })
          } else {
            out.push({
              id: 'cmd-goal-hint',
              label: '/goal <text>',
              sub: tr('cp.goalHint'),
              icon: '▸',
              type: 'command',
            })
          }
          break

        case 'note':
          if (args.trim()) {
            out.push({
              id: 'cmd-note-append',
              label: args.trim(),
              sub: tr('cp.appendScratchpad'),
              icon: '✎',
              type: 'command',
              action: () => {
                setScratchpad(prev => prev ? prev + '\n' + args.trim() : args.trim())
                showToast(tr('cp.toast.addedScratchpad'))
              },
            })
          } else {
            out.push({
              id: 'cmd-note-hint',
              label: '/note <text>',
              sub: tr('cp.noteHint'),
              icon: '✎',
              type: 'command',
            })
          }
          break

        case 'clock': {
          const formats: { value: '12h' | '24h'; label: string }[] = [
            { value: '12h', label: tr('settings.pref.clock12h') },
            { value: '24h', label: tr('settings.pref.clock24h') },
          ]
          for (const f of formats) {
            if (!args || fuzzy(f.value, args) || fuzzy(f.label, args)) {
              out.push({
                id: `cmd-clock-${f.value}`,
                label: f.label,
                sub: settings.clockFormat === f.value ? tr('cp.current') : tr('cp.switchFormat'),
                icon: '◷',
                type: 'command',
                action: () => {
                  setSettings(prev => ({ ...prev, clockFormat: f.value }))
                  showToast(tr('cp.toast.clockChanged', { name: f.label }))
                },
              })
            }
          }
          break
        }

        case 'language': {
          for (const lang of SUPPORTED_LANGUAGES) {
            if (!args || fuzzy(lang.label, args) || fuzzy(lang.code, args)) {
              out.push({
                id: `cmd-language-${lang.code}`,
                label: lang.label,
                sub: settings.language === lang.code ? tr('cp.current') : tr('cp.switchLanguage'),
                icon: '⌘',
                type: 'command',
                action: () => {
                  setSettings(prev => ({ ...prev, language: lang.code }))
                  showToast(tr('cp.toast.languageChanged', { name: lang.label }))
                },
              })
            }
          }
          break
        }

        case 'export':
          out.push({
            id: 'cmd-export-run',
            label: tr('cp.exportRun'),
            sub: tr('cp.exportSub'),
            icon: '↓',
            type: 'command',
            action: () => {
              import('../utils/backup').then(m => m.exportSettings())
              showToast(tr('cp.toast.exporting'))
            },
          })
          break

        case 'clear':
          if (!args || fuzzy('recent', args)) {
            out.push({
              id: 'cmd-clear-recent',
              label: tr('cp.clearRecent'),
              sub: tr('cp.itemsCount', { count: recent.length }),
              icon: '✕',
              type: 'command',
              action: () => {
                setRecent([])
                showToast(tr('cp.toast.historyCleared'))
              },
            })
          }
          break
        case 'chrome-tab':
          out.push({
            id: 'cmd-chrome-tab-run',
            label: tr('cp.openChromeTab'),
            sub: tr('cp.chromeTabSub'),
            icon: <Earth size={16} />,
            type: 'command',
            action: () => openChromeNewTab()
          })
          break
      }
      return out
    }

    // ── Normal search (existing logic) ──

    // When empty — show recent first
    if (!query.trim()) {
      for (const r of recent) {
        out.push({ id: `recent-${r.url}`, label: r.label, sub: r.url, url: r.url, icon: '↺', type: 'recent' })
      }
      return out
    }

    // Calculator — prefix with =
    if (query.startsWith('=')) {
      const expr = query.slice(1).trim()
      const calcResult = expr ? tryCalc(expr) : null
      out.push({
        id: '__calc__',
        label: calcResult !== null ? `= ${calcResult}` : '= ...',
        sub: calcResult !== null ? tr('cp.calcCopy') : tr('cp.calcHint'),
        icon: '∑',
        type: 'calc',
        action: calcResult !== null ? () => {
          void navigator.clipboard.writeText(calcResult)
            .then(() => showToast(tr('cp.toast.copied', { value: calcResult })))
            .catch(() => showToast(tr('cp.toast.clipboardFailed')))
        } : undefined,
      })
      return out
    }

    // Exact URL typed
    if (isUrl(query)) {
      const href = /^https?:\/\//i.test(query) ? query : 'https://' + query
      out.push({ id: '__url__', label: query, sub: tr('cp.goToUrl'), url: href, icon: '↗', type: 'url' })
    }

    // Aliases
    for (const a of aliases) {
      if (fuzzy(a.key, query) || fuzzy(a.url, query)) {
        out.push({ id: `alias-${a.key}`, label: a.key, sub: a.url, url: a.url, icon: '→', type: 'alias' })
      }
    }

    // Bookmarks
    for (const cat of categories) {
      for (const bm of cat.bookmarks) {
        if (fuzzy(bm.title, query) || fuzzy(bm.url, query) || fuzzy(cat.name, query)) {
          out.push({ id: bm.id, label: bm.title, sub: `${cat.name} · ${bm.url}`, url: bm.url, icon: '⬡', type: 'bookmark' })
        }
      }
    }

    // Browser history
    const seenUrls = new Set(out.map(r => r.url).filter(Boolean))
    for (const h of historyResults) {
      if (!seenUrls.has(h.url)) {
        out.push({ id: `history-${h.url}`, label: h.label, sub: h.url, url: h.url, icon: '◷', type: 'history' })
        seenUrls.add(h.url)
      }
    }

    // Web search fallback — always show when there's a query
    if (query.trim() && !isUrl(query)) {
      out.push({
        id: '__search__',
        label: tr('cp.search', { query }),
        sub: `${SEARCH_ENGINES[engine].name}`,
        url: SEARCH_ENGINES[engine].url + encodeURIComponent(query),
        icon: '⌕',
        type: 'search',
      })
    }

    // Tab search — when query starts with "> " or when no other results match
    const showTabs = query.startsWith('> ') || (query.trim() && out.length <= 2)
    if (showTabs) {
      const tabQuery = query.replace(/^>\s*/, '').toLowerCase()
      for (const tab of tabs) {
        if (fuzzy(tab.title, tabQuery) || fuzzy(tab.url, tabQuery)) {
          out.push({
            id: `tab-${tab.id}`,
            label: tab.title,
            sub: tab.url,
            url: tab.url,
            icon: tab.favicon ? <img src={tab.favicon} width={16} height={16} /> : '⬡',
            type: 'tab' as const,
          })
        }
      }
    }

    // Ask AI fallback — appended last so local matches keep priority
    if (activeProvider && query.trim() && !query.startsWith('/') && !query.startsWith('=')) {
      out.push({
        id: 'ask-ai',
        label: tr('cp.chat.askAI', { query: query.trim() }),
        sub: aiStreaming ? tr('cp.chat.streaming') : tr('cp.chat.enterHint'),
        icon: aiStreaming ? <span className="cp-dots"><span /><span /><span /></span> : '✦',
        type: 'ai' as const,
        action: aiStreaming ? undefined : () => sendChat(query.trim()),
      })
    }

    return out
  }, [query, categories, aliases, engine, settings.theme, settings.font, settings.clockFormat, settings.language, recent, historyResults, showToast, setSettings, setRecent, setDailyGoal, setScratchpad, tabs, activeProvider, aiStreaming, sendChat, tr])

  useEffect(() => { setSelected(0); pendingIdRef.current = null; setPendingId(null) }, [query])

  useEffect(() => { pendingIdRef.current = null; setPendingId(null) }, [selected])

  useEffect(() => {
    if (!resultsRef.current) return
    const el = resultsRef.current.children[selected] as HTMLElement | undefined
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const launch = (r: Result) => {
    // Command suggestion without action — autocomplete it
    if (r.type === 'command' && !r.action) {
      if (r.id.endsWith('-hint')) return
      setQuery(r.label + ' ')
      return
    }
    if (r.type === 'tab' && r.url) {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.get(Number(r.id.replace('tab-', '')), (tab) => {
          if (chrome.runtime.lastError || !tab) {
            showToast(tr('cp.toast.tabGone'))
            return
          }
          chrome.tabs.highlight({ windowId: tab.windowId, tabs: tab.index })
          chrome.windows.update(tab.windowId, { focused: true })
        })
      }
      setQuery('')
      inputRef.current?.blur()
      return
    }
    if (r.action) {
      if (r.type === 'ai') {
        r.action()
        return
      }
      r.action()
      setQuery('')
      return
    }
    if (r.url) {
      if (!isSafeUrl(r.url)) {
        showToast(tr('cp.toast.invalidUrl'))
        setQuery('')
        return
      }
      if (pendingIdRef.current !== r.id) {
        pendingIdRef.current = r.id
        setPendingId(r.id)
        return
      }
      void recordTabUsage()
      addRecent(r.label, r.url)
      window.location.href = r.url
    }
    setQuery('')
    pendingIdRef.current = null
    setPendingId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.code === 'KeyN')) { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp'   || (e.ctrlKey && e.code === 'KeyP')) {
      // At top of results list with chat chips visible → jump into chips
      if (selected === 0 && messages.length > 0) {
        const chips = chipsRef.current?.querySelectorAll<HTMLButtonElement>('button.cp-tool-chip.clickable')
        const last = chips?.[chips.length - 1]
        if (last) {
          e.preventDefault()
          last.focus()
          return
        }
      }
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    }
    // Tab autocompletes command suggestions
    if (e.key === 'Tab' && results[selected]?.type === 'command' && !results[selected]?.action) {
      e.preventDefault()
      if (results[selected].id.endsWith('-hint')) return
      setQuery(results[selected].label + ' ')
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selected]) {
        launch(results[selected])
      } else if (query.trim() && activeProvider) {
        // No local results — send to AI
        sendChat(query.trim())
      } else if (query.trim()) {
        // No provider configured — fall back to web search
        void recordTabUsage()
        const fallbackUrl = SEARCH_ENGINES[engine].url + encodeURIComponent(query)
        if (isSafeUrl(fallbackUrl)) {
          window.location.href = fallbackUrl
        }
        setQuery('')
      }
    }
  }

  return (
    <>
      <div className={`cp-inline ${themeClass} ${isFocused ? 'focused' : ''} ${messages.length > 0 ? 'has-chat' : ''}`}>
        {messages.length > 0 && (
          <div className="cp-chat" ref={chatRef}>
            <div className="cp-chat-header">
              <span>{tr('cp.chat.turnsLabel', { count: messages.filter(m => m.role === 'user').length })}</span>
              <button
                className="cp-chat-clear"
                onMouseDown={e => { e.preventDefault(); setMessages([]); setAiError(null) }}
              >
                × {tr('cp.chat.clear')}
              </button>
            </div>
            <div className="cp-msg-list">
              {messages.map((m, i) => {
                const isLastAssistant = i === messages.length - 1 && m.role === 'assistant'
                return (
                  <div key={i} className={`cp-msg cp-msg-${m.role}`}>
                    <span className="cp-msg-role">{m.role === 'user' ? 'USER' : 'ASSISTANT'}</span>
                    {m.role === 'assistant' ? (
                      <div className={`cp-msg-content ${aiStreaming && isLastAssistant ? 'streaming' : ''}`}>
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className={`cp-msg-content ${aiStreaming && isLastAssistant ? 'streaming' : ''}`}>
                        {m.content}
                      </span>
                    )}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div className="cp-tool-chips" ref={chipsRef}>
                        {m.toolCalls.map((c, ci) => {
                          const clickable = c.status === 'done' && c.urls && c.urls.length > 0
                          const onChipActivate = clickable ? () => {
                            if (typeof chrome !== 'undefined' && chrome.tabs) {
                              for (const url of c.urls!) chrome.tabs.create({ url })
                            } else {
                              for (const url of c.urls!) window.open(url, '_blank')
                            }
                          } : undefined
                          const onChipKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault()
                              const all = chipsRef.current?.querySelectorAll<HTMLButtonElement>('button.cp-tool-chip.clickable')
                              if (all) {
                                const idx = Array.from(all).indexOf(e.currentTarget)
                                if (idx < all.length - 1) all[idx + 1].focus()
                                else inputRef.current?.focus()
                              }
                              return
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault()
                              const all = chipsRef.current?.querySelectorAll<HTMLButtonElement>('button.cp-tool-chip.clickable')
                              if (all) {
                                const idx = Array.from(all).indexOf(e.currentTarget)
                                if (idx > 0) all[idx - 1].focus()
                                else inputRef.current?.focus()
                              }
                              return
                            }
                          }
                          return clickable ? (
                            <button
                              key={ci}
                              type="button"
                              className={`cp-tool-chip clickable ${c.status === 'pending' ? 'pending' : ''}`}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => onChipActivate?.()}
                              onKeyDown={onChipKeyDown}
                              title={tr('cp.chip.clickToOpen')}
                            >
                              <span className="dot" />
                              {c.name} · {c.label}
                              <span className="cp-chip-arrow">↗</span>
                            </button>
                          ) : (
                            <span
                              key={ci}
                              className={`cp-tool-chip ${c.status === 'pending' ? 'pending' : ''} ${c.status === 'error' ? 'error' : ''}`}
                            >
                              <span className="dot" />
                              {c.name} · {c.label}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {m.error && (
                      <span className="cp-msg-error">⚠ {m.error}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className={`cp-input-row ${isFocused ? 'focused' : ''}`}>
          <Search size={14} className="cp-search-icon" />
          <input
            ref={inputRef}
            className="cp-input"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); pendingIdRef.current = null; setPendingId(null) }}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={tr('cp.trigger.text')}
            spellCheck={false}
          />
          {isFocused && !query.startsWith('/') && (
            <div className="cp-engines">
              {Object.entries(SEARCH_ENGINES).map(([key, val]) => (
                <button
                  key={key}
                  className={`cp-engine-btn ${engine === key ? 'active' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setEngine(key) }}
                  title={val.name}
                >
                  {tr(val.labelKey)}
                </button>
              ))}
            </div>
          )}
          {!isFocused && (
            <span className="cp-trigger-hint">
              <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K</kbd>
              <span className="cp-trigger-sep">/</span>
              <kbd>/</kbd>
            </span>
          )}
          {isFocused && <span className="cp-esc">{tr('cp.esc')}</span>}
        </div>

        {isFocused && results.length > 0 && (
          <div className="cp-results" ref={resultsRef}>
            {results.map((r, i) => {
              const isPending = pendingId === r.id
              return (
              <div
                key={r.id}
                className={`cp-item cp-item-${r.type} ${i === selected ? 'active' : ''} ${isPending ? 'pending-confirm' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onMouseDown={e => { e.preventDefault(); launch(r) }}
              >
                <span className="cp-item-icon">{r.icon}</span>
                <div className="cp-item-text">
                  <span className="cp-item-label">{r.label}</span>
                  <span className="cp-item-sub">
                    {r.sub}
                    {isPending && <span className="cp-confirm-hint"> · {tr('cp.confirmOpen')}</span>}
                  </span>
                </div>
                <span className="cp-item-enter">
                  {r.type === 'command' && !r.action ? '→' : isPending ? '↵↵' : '↵'}
                </span>
              </div>
              )
            })}
          </div>
        )}

        {aiError && (
          <div className="cp-ai-error">⚠️ {aiError}</div>
        )}
      </div>

      {/* Toast feedback for slash commands */}
      {toast && createPortal(
        <div className="cp-toast">{toast}</div>,
        document.body
      )}

      {/* ASCII art preview drawer — mounted only when the AI calls set_ascii_art */}
      {asciiPreview && activeProviderConfig && (
        <AsciiPreviewPanel
          currentArt={settings.customAsciiArt ?? settings.asciiArt ?? ''}
          art={asciiPreview.art}
          description={asciiPreview.description}
          onApply={art => {
            setSettings(s => ({ ...s, customAsciiArt: art, asciiArtSource: 'custom' }))
            setAsciiPreview(null)
          }}
          onClose={() => setAsciiPreview(null)}
          onRequestAI={(currentArt, instruction) =>
            generateAsciiArt(activeProviderConfig, currentArt, instruction)
          }
        />
      )}
    </>
  )
}
