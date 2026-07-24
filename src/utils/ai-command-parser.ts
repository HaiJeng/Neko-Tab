import type { AIMemory } from '../types'
import type { AIToolName } from '../hooks/useAIProviders'
import { isSafeUrl } from './browser'

export type ToolCallResult =
  | { status: 'done'; label: string; urls?: string[] }
  | { status: 'error'; label: string; error: string }

export type JournalWriter = (updater: (prev: Record<string, string>) => Record<string, string>) => void
export type MemoryWriter = (keyword: string, url: string, source: 'ai') => Promise<unknown> | unknown
export type AliasLookup = (key: string) => string | undefined

/**
 * Execute one tool call from the ai-sdk stream. Called synchronously as the
 * stream emits `tool-call` chunks; the caller renders the return value as a chip.
 */
export async function dispatchToolCall(
  name: AIToolName,
  args: Record<string, unknown>,
  deps: {
    saveMemory: MemoryWriter
    setJournal: JournalWriter
    resolveAlias: AliasLookup
  },
): Promise<ToolCallResult> {
  try {
    switch (name) {
      case 'open_url': {
        const url = String(args.url)
        if (!isSafeUrl(url)) return { status: 'error', label: url, error: 'unsafe url' }
        return { status: 'done', label: url.replace(/^https?:\/\//, '').slice(0, 40), urls: [url] }
      }
      case 'open_tabs': {
        const raw = args.urls as string[]
        const urls = raw.filter(u => typeof u === 'string' && isSafeUrl(u))
        if (urls.length === 0) return { status: 'error', label: 'open_tabs', error: 'no safe urls' }
        return { status: 'done', label: `${urls.length} tabs`, urls }
      }
      case 'open_alias': {
        const key = String(args.key)
        const url = deps.resolveAlias(key)
        if (!url || !isSafeUrl(url)) return { status: 'error', label: key, error: 'alias not found' }
        return { status: 'done', label: `${key} → ${url.replace(/^https?:\/\//, '').slice(0, 30)}`, urls: [url] }
      }
      case 'history_search': {
        if (typeof chrome === 'undefined' || !chrome.history) {
          return { status: 'error', label: String(args.query), error: 'history unavailable' }
        }
        const query = String(args.query)
        const items = await new Promise<chrome.history.HistoryItem[]>(resolve =>
          chrome.history.search({ text: query, maxResults: 1 }, resolve),
        )
        const top = items[0]
        if (!top?.url || !isSafeUrl(top.url)) return { status: 'error', label: query, error: 'no match' }
        return { status: 'done', label: (top.title || top.url).slice(0, 40), urls: [top.url] }
      }
      case 'remember': {
        const keyword = String(args.keyword)
        const url = String(args.url)
        if (!isSafeUrl(url)) return { status: 'error', label: keyword, error: 'unsafe url' }
        await deps.saveMemory(keyword, url, 'ai')
        return { status: 'done', label: `${keyword} → ${url.replace(/^https?:\/\//, '').slice(0, 30)}` }
      }
      case 'save_to_journal': {
        const text = String(args.text)
        const date = String(args.date)
        deps.setJournal(prev => {
          const existing = prev[date] || ''
          const sep = existing ? '\n\n' : ''
          return { ...prev, [date]: existing + sep + `--- AI ---\n${text}` }
        })
        return { status: 'done', label: date }
      }
    }
  } catch (e) {
    return { status: 'error', label: name, error: e instanceof Error ? e.message : String(e) }
  }
  return { status: 'error', label: name, error: 'unknown tool' }
}

/**
 * Fetch recent history entries (default: last 24h) for AI context. Unlike
 * `chrome.history.search` in the palette (which filters by the current query),
 * this returns everything the user visited in the window so the AI can answer
 * "what did I do yesterday" without being handed an empty list.
 */
export async function fetchRecentHistory(hours = 24, max = 40): Promise<{ title: string; url: string; ts: number }[]> {
  if (typeof chrome === 'undefined' || !chrome.history) return []
  try {
    const startTime = Date.now() - hours * 60 * 60 * 1000
    const items = await new Promise<chrome.history.HistoryItem[]>(resolve =>
      chrome.history.search({ text: '', maxResults: max, startTime }, resolve),
    )
    return items
      .filter(i => i.url && !i.url.startsWith('chrome://') && !i.url.startsWith('chrome-extension://'))
      .map(i => ({ title: i.title || i.url!, url: i.url!, ts: i.lastVisitTime || 0 }))
      .sort((a, b) => b.ts - a.ts)
  } catch {
    return []
  }
}

export async function fetchFrequentDestinations(): Promise<AIMemory[]> {
  if (typeof chrome === 'undefined' || !chrome.history) return []

  try {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const items = await new Promise<chrome.history.HistoryItem[]>((resolve) => {
      chrome.history.search({ text: '', maxResults: 200, startTime: thirtyDaysAgo }, resolve)
    })

    const domainMap = new Map<string, Map<string, number>>()
    for (const item of items) {
      if (!item.url || item.url.startsWith('chrome://') || item.url.startsWith('chrome-extension://')) continue
      try {
        const url = new URL(item.url)
        const domain = url.hostname.replace(/^www\./, '')
        if (!domainMap.has(domain)) domainMap.set(domain, new Map())
        const urlMap = domainMap.get(domain)!
        urlMap.set(item.url, (urlMap.get(item.url) || 0) + (item.visitCount || 1))
      } catch { }
    }

    const result: AIMemory[] = []
    for (const [domain, urlMap] of domainMap) {
      let bestUrl = ''
      let bestCount = 0
      for (const [url, count] of urlMap) {
        if (count > bestCount) {
          bestCount = count
          bestUrl = url
        }
      }
      if (bestUrl) {
        result.push({
          keyword: domain,
          url: bestUrl,
          usageCount: bestCount,
          lastUsed: Date.now(),
          source: 'history',
        })
      }
    }

    result.sort((a, b) => b.usageCount - a.usageCount)
    return result.slice(0, 30)
  } catch {
    return []
  }
}

function strip(str: string): string {
  return str.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 200)
}

function friendlyTimeAgo(ts: number): string {
  const diffMin = Math.round((Date.now() - ts) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.round(diffH / 24)
  return `${diffD}d ago`
}

export function buildContext(
  aliases: { key: string; url: string }[],
  categories: { name: string; bookmarks: { title: string; url: string }[] }[],
  tabs: { title: string; url: string }[],
  history: { title: string; url: string; ts?: number }[],
  memories: AIMemory[] = [],
): { aliases: string; bookmarks: string; tabs: string; history: string; memories: string } {
  return {
    aliases: aliases.map(a => `${a.key} -> ${a.url}`).join(', '),
    bookmarks: categories.flatMap(c =>
      c.bookmarks.map(b => `${b.title}: ${b.url}`)
    ).map(s => strip(s)).join('; '),
    tabs: tabs.map(t => strip(t.title)).join(', '),
    history: history.map(h => {
      const ago = h.ts ? friendlyTimeAgo(h.ts) : ''
      return `${ago ? `[${ago}] ` : ''}${strip(h.title)}`
    }).join('; '),
    memories: memories.map(m => `${m.keyword} -> ${m.url}`).join('\n'),
  }
}
