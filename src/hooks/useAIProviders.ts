import { useState, useCallback, useEffect } from 'react'
import { z } from 'zod'
import type { LanguageModel, ModelMessage } from 'ai'
import type { AIProvider, AIProviderConfig } from '../types'

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
 * Resolve a stored AIProviderConfig into an initialized AI SDK LanguageModel.
 * Shared by streamChat and the Settings connection test — one place decides
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

  // Keep every hook instance in sync when another one (e.g. the Settings panel)
  // writes to chrome.storage.local — otherwise callers like CommandPalette hold
  // stale state until the tab is reloaded.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return
      if (changes['ai-providers']) {
        setProviders((changes['ai-providers'].newValue as AIProviderConfig[] | undefined) ?? [])
      }
      if (changes['ai-active-provider']) {
        setActiveProvider((changes['ai-active-provider'].newValue as AIProvider | null | undefined) ?? null)
      }
    }
    chrome.storage.onChanged.addListener(handler)
    return () => chrome.storage.onChanged.removeListener(handler)
  }, [])

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

    const systemPrompt = `You are the user's browser assistant. Answer naturally and, when appropriate, call tools to propose actions on the browser.

Rules:
- Tool calls do NOT execute immediately. They render as chips the user must click to confirm.
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
recent history: ${sanitizeLong(context.history)}
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

  return {
    providers,
    activeProvider,
    loadProviders,
    saveProvider,
    removeProvider,
    setActive,
    streamChat,
    providerDefaults: PROVIDER_DEFAULTS,
  }
}
