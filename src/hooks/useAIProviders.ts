import { useState, useCallback } from 'react'
import { z } from 'zod'
import type { LanguageModel, ModelMessage } from 'ai'
import type { AIProvider, AIProviderConfig, AIAction } from '../types'

const PROVIDER_DEFAULTS: Record<AIProvider, { name: string; baseUrl: string; model: string }> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-haiku-20240307' },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1', model: 'gemini-2.5-flash' },
  custom: { name: 'Custom API', baseUrl: '', model: '' },
}

function sanitize(str: string): string {
  return str.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 200)
}

function sanitizeLong(str: string): string {
  return str.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 4000)
}

/**
 * Tool schemas exposed to the AI model. ai-sdk validates arguments against these
 * before invoking dispatchToolCall. Text answers are plain assistant content, not
 * a tool — the model only calls a tool when it needs to act on the browser.
 */
export const AI_TOOLS = {
  open_url: {
    description: 'Open a single URL in a new browser tab.',
    inputSchema: z.object({ url: z.string().url() }),
  },
  open_tabs: {
    description: 'Open multiple URLs, each in its own new tab.',
    inputSchema: z.object({ urls: z.array(z.string().url()).min(1).max(10) }),
  },
  open_alias: {
    description: 'Open a saved alias by its key (user-defined shortcut).',
    inputSchema: z.object({ key: z.string().min(1) }),
  },
  history_search: {
    description: 'Search the browser history for a term and open the top match.',
    inputSchema: z.object({ query: z.string().min(1) }),
  },
  remember: {
    description: 'Save a keyword-to-URL memory so future queries know this destination.',
    inputSchema: z.object({ keyword: z.string().min(1), url: z.string().url() }),
  },
  save_to_journal: {
    description: 'Append a text summary to the daily journal.',
    inputSchema: z.object({
      text: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
} as const

export type AIToolName = keyof typeof AI_TOOLS

/**
 * Parse AI response text into AIAction[] with lenient handling:
 * - Strips markdown code fences
 * - Accepts bare JSON array, or object wrapped in { actions: [...] }
 * - Wraps a single object into an array
 * Throws with the actual snippet on failure.
 */
function parseActions(raw: string): AIAction[] {
  let cleaned = raw.trim()

  // Strip markdown code fences (```json ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim()

  // Try array first
  const arrayMatch = cleaned.match(/^\[[\s\S]*\]$/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0])
      if (Array.isArray(parsed)) return parsed as AIAction[]
    } catch { /* fall through */ }
  }

  // Try { actions: [...] }
  try {
    const obj = JSON.parse(cleaned)
    if (obj.actions && Array.isArray(obj.actions)) return obj.actions as AIAction[]
    if (!Array.isArray(obj)) {
      // Single object — wrap in array
      return [obj] as AIAction[]
    }
  } catch { /* fall through */ }

  throw new Error(
    `AI response was not valid JSON. Response received:\n${cleaned.slice(0, 500)}`
  )
}

/**
 * Resolve a stored AIProviderConfig into an initialized AI SDK LanguageModel.
 * Shared by executeCommand and the Settings connection test — one place decides
 * which SDK to load, how to authenticate, and which wire format to speak.
 */
export async function resolveLanguageModel(config: AIProviderConfig): Promise<LanguageModel> {
  // v1.x defaulted to gemini-1.5-flash which Google now 404s; force any stored
  // config still carrying that value up to the current default.
  const model = config.model && config.model !== 'gemini-1.5-flash'
    ? config.model
    : PROVIDER_DEFAULTS[config.provider].model

  const usesAnthropicFormat =
    config.provider === 'anthropic' ||
    (config.provider === 'custom' && config.customFormat === 'anthropic')

  // Lazy-load provider SDKs so they stay out of the main new-tab bundle — pulled in
  // only when the user actually runs an AI command or tests a connection.
  if (config.provider === 'gemini') {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
    const google = createGoogleGenerativeAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    })
    return google(model)
  }

  if (usesAnthropicFormat) {
    const { createAnthropic } = await import('@ai-sdk/anthropic')
    const anthropic = createAnthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      // Required to call the Anthropic API directly from a browser/extension context.
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    })
    return anthropic(model)
  }

  // OpenAI and OpenAI-compatible custom endpoints.
  // Use .chat() to force the Chat Completions API — the default callable uses
  // the Responses API, which OpenAI-compatible gateways (DeepSeek, etc.) don't support.
  const { createOpenAI } = await import('@ai-sdk/openai')
  const openai = createOpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  })
  return openai.chat(model)
}

export function useAIProviders() {
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [activeProvider, setActiveProvider] = useState<AIProvider | null>(null)

  const loadProviders = useCallback(async () => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return

    try {
      const stored = await chrome.storage.local.get('ai-providers') as { 'ai-providers'?: AIProviderConfig[] }
      if (stored['ai-providers']) {
        setProviders(stored['ai-providers'])
      }

      const active = await chrome.storage.local.get('ai-active-provider') as { 'ai-active-provider'?: AIProvider }
      if (active['ai-active-provider']) {
        setActiveProvider(active['ai-active-provider'])
      }
    } catch (e) {
      console.error('Failed to load AI providers:', e)
    }
  }, [])

  const saveProvider = useCallback(async (provider: AIProviderConfig) => {
    setProviders(prev => {
      const filtered = prev.filter(p => p.provider !== provider.provider)
      const updated = [...filtered, provider]

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ 'ai-providers': updated })
      }

      return updated
    })
  }, [])

  const removeProvider = useCallback(async (provider: AIProvider) => {
    setProviders(prev => {
      const updated = prev.filter(p => p.provider !== provider)

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ 'ai-providers': updated })
      }

      return updated
    })

    if (activeProvider === provider) {
      setActiveProvider(null)
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ 'ai-active-provider': null })
      }
    }
  }, [activeProvider])

  const setActive = useCallback(async (provider: AIProvider | null) => {
    setActiveProvider(provider)
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ 'ai-active-provider': provider })
    }
  }, [])

  const streamChat = useCallback(async (
    messages: ModelMessage[],
    context: { aliases: string; bookmarks: string; tabs: string; history: string; memories: string },
  ) => {
    const currentActive = activeProvider
    if (!currentActive) throw new Error('No active AI provider configured')

    const providerConfig = providers.find(p => p.provider === currentActive)
    if (!providerConfig?.apiKey) throw new Error(`API key not set for ${currentActive}`)

    const systemPrompt = `You are the user's browser assistant. Answer naturally and, when appropriate, call tools to act on the browser.

Rules:
- For "open X": if X is a known destination (from context), call open_url with its exact URL. Otherwise call open_url with your best guess and also call remember to save it.
- For "open X and Y": call open_tabs.
- For history questions ("what did I do yesterday"): give a 2-4 sentence summary as your text reply, cite links as plain URLs in the text, and do not call tools.
- For "save this to journal today": call save_to_journal with the current date and the summary text.
- If unsure, ask before acting.
- Text replies are your natural voice. Only call tools when you need to act.

Context (refer back as needed):
<context>
aliases: ${sanitize(context.aliases)}
bookmarks: ${sanitize(context.bookmarks)}
open tabs: ${sanitize(context.tabs)}
recent history: ${sanitize(context.history)}
known destinations:
${sanitizeLong(context.memories)}
</context>`

    const languageModel = await resolveLanguageModel(providerConfig)
    const { streamText } = await import('ai')

    return streamText({
      model: languageModel,
      system: systemPrompt,
      messages,
      tools: AI_TOOLS,
      temperature: 0.3,
      maxOutputTokens: 1200,
    })
  }, [activeProvider, providers])

  const executeCommand = useCallback(async (
    prompt: string,
    context: { aliases: string; bookmarks: string; tabs: string; history: string; memories: string; browsingHistory?: string }
  ): Promise<AIAction[]> => {
    const currentActive = activeProvider
    if (!currentActive) {
      throw new Error('No active AI provider configured')
    }

    const providerConfig = providers.find(p => p.provider === currentActive)
    if (!providerConfig?.apiKey) {
      throw new Error(`API key not set for ${currentActive}`)
    }

    const safeQuery = sanitize(prompt)

    const hasBrowsingHistory = context.browsingHistory && context.browsingHistory.length > 0
    const historySection = hasBrowsingHistory
      ? `browsing history (with timestamps):\n${sanitizeLong(context.browsingHistory!)}`
      : `recent history: ${sanitize(context.history)}`

    const systemPrompt = `You are a command interpreter. Given the user's context and request, respond with a JSON array of actions.

When the user asks about their browsing history (e.g. "what did I do yesterday", "summarize May 30"), examine the browsing history context and return an "answer" action with a concise 2-4 sentence summary and up to 5 relevant links as chips.

When the user says "open X", check the known destinations first. If X matches a known destination, use its exact URL. For example:
- "open slack" → {"type": "open_url", "value": "https://slack.com"}
- "open slack and discord" → {"type": "open_tabs", "value": "https://slack.com, https://discord.com"}
- "open gmail" → {"type": "open_url", "value": "https://mail.google.com"}
- "open youtube" → {"type": "open_url", "value": "https://youtube.com"}
- "open google docs my resume" → {"type": "search", "value": "my resume google docs"}

If you open a URL that isn't in known destinations, append a remember action so the system learns it.

Only use "search" when you genuinely don't know the URL. Prefer "open_url" for known websites.

Context:
<context>
aliases: ${sanitize(context.aliases)}
bookmarks: ${sanitize(context.bookmarks)}
open tabs: ${sanitize(context.tabs)}
${historySection}
known destinations:
${sanitize(context.memories)}
</context>

User request:
<user_query>${safeQuery}</user_query>

Available actions:
- {"type": "open_url", "value": "<full url>"} — navigate to a URL
- {"type": "search", "value": "<search query>"} — Google search (only when URL is unknown)
- {"type": "open_tabs", "value": "<url1>, <url2>, ..."} — open multiple URLs in new tabs
- {"type": "alias", "value": "<alias key>"} — use a saved alias
- {"type": "history", "value": "<search term for chrome history>"} — search browser history
- {"type": "remember", "value": "<keyword>", "url": "<full url>"} — save a new memory mapping
- {"type": "answer", "value": "<summary text>", "urls": [{"label": "<short label>", "url": "<full url>"}]} — display a text answer with link chips. Keep urls array to 5 items max.
- {"type": "save-to-journal", "value": "<text to save>", "date": "<YYYY-MM-DD>"} — save a summary to the daily journal (use date from the user's request)

When using "answer": keep summaries to 2-4 sentences. Label links with the page title or domain name.
When using "save-to-journal": include a "date" field matching the date being summarized.

Respond ONLY with a valid JSON array. No markdown, no explanation.`

    const languageModel = await resolveLanguageModel(providerConfig)

    const { generateText } = await import('ai')
    const { text } = await generateText({
      model: languageModel,
      prompt: systemPrompt,
      temperature: 0.3,
      // Ceiling for a JSON action array. Cheap guard against a bad model or
      // runaway prompt burning tokens and holding the UI open.
      maxOutputTokens: 800,
    })

    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('AI returned an empty response. Check the model name and provider configuration.')
    }

    return parseActions(text)
  }, [activeProvider, providers])

  return {
    providers,
    activeProvider,
    loadProviders,
    saveProvider,
    removeProvider,
    setActive,
    executeCommand,
    streamChat,
    providerDefaults: PROVIDER_DEFAULTS,
  }
}
