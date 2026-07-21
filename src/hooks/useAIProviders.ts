import { useState, useCallback } from 'react'
import type { LanguageModel } from 'ai'
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

    const defaults = PROVIDER_DEFAULTS[currentActive]
    const model = providerConfig.model && providerConfig.model !== 'gemini-1.5-flash' ? providerConfig.model : defaults.model

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

    const usesAnthropicFormat = currentActive === 'anthropic' || (currentActive === 'custom' && providerConfig.customFormat === 'anthropic')

    // Lazy-load the AI SDK so it stays out of the main new-tab bundle — it is only
    // pulled in when the user actually runs an AI command.
    const { generateText } = await import('ai')

    // Resolve the AI SDK model. The SDK normalizes each provider's wire format
    // (including Anthropic extended-thinking blocks) so we only deal with text.
    let languageModel: LanguageModel
    if (currentActive === 'gemini') {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      const google = createGoogleGenerativeAI({
        apiKey: providerConfig.apiKey,
        ...(providerConfig.baseUrl ? { baseURL: providerConfig.baseUrl } : {}),
      })
      languageModel = google(model)
    } else if (usesAnthropicFormat) {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      const anthropic = createAnthropic({
        apiKey: providerConfig.apiKey,
        ...(providerConfig.baseUrl ? { baseURL: providerConfig.baseUrl } : {}),
        // Required to call the Anthropic API directly from a browser/extension context.
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })
      languageModel = anthropic(model)
    } else {
      // OpenAI and OpenAI-compatible custom endpoints.
      // Use .chat() to force the Chat Completions API — the default callable uses
      // the Responses API, which OpenAI-compatible gateways (DeepSeek, etc.) don't support.
      const { createOpenAI } = await import('@ai-sdk/openai')
      const openai = createOpenAI({
        apiKey: providerConfig.apiKey,
        ...(providerConfig.baseUrl ? { baseURL: providerConfig.baseUrl } : {}),
      })
      languageModel = openai.chat(model)
    }

    const { text } = await generateText({
      model: languageModel,
      prompt: systemPrompt,
      temperature: 0.3,
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
    providerDefaults: PROVIDER_DEFAULTS,
  }
}
