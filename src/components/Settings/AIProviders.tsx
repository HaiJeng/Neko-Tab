import { useState, useEffect } from 'react'
import { useAIProviders, resolveLanguageModel } from '../../hooks/useAIProviders'
import type { AIProvider, AIProviderConfig } from '../../types'
import { Key, Trash2, Plus, Check, AlertCircle } from 'lucide-react'
import { useTranslation } from '../../i18n'

function maskKey(key: string): string {
  if (key.length <= 8) return key.slice(0, 2) + '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

export function AIProviders() {
  const { providers, activeProvider, saveProvider, removeProvider, setActive, loadProviders, providerDefaults } = useAIProviders()
  const { t } = useTranslation()

  useEffect(() => {
    loadProviders()
  }, [loadProviders])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProvider, setNewProvider] = useState<AIProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customFormat, setCustomFormat] = useState<'openai' | 'anthropic'>('openai')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [editingKey, setEditingKey] = useState<AIProvider | null>(null)
  const [editKeyValue, setEditKeyValue] = useState('')

  const handleAddProvider = async () => {
    if (!apiKey.trim()) return

    const providerConfig: AIProviderConfig = {
      provider: newProvider,
      name: providerDefaults[newProvider].name,
      apiKey: apiKey.trim(),
      baseUrl: newProvider === 'custom' ? customBaseUrl : undefined,
      model: newProvider === 'custom' ? customModel : providerDefaults[newProvider].model,
      customFormat: newProvider === 'custom' ? customFormat : undefined,
    }

    await saveProvider(providerConfig)
    setApiKey('')
    setCustomBaseUrl('')
    setCustomModel('')
    setCustomFormat('openai')
    setShowAddForm(false)

    if (!activeProvider) {
      await setActive(newProvider)
    }
  }

  const handleUpdateKey = async (provider: AIProvider) => {
    if (!editKeyValue.trim()) return
    const existing = providers.find(p => p.provider === provider)
    if (!existing) return

    await saveProvider({ ...existing, apiKey: editKeyValue.trim() })
    setEditingKey(null)
    setEditKeyValue('')
  }

  const handleTestProvider = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const provider = providers.find(p => p.provider === activeProvider)
      if (!provider) {
        throw new Error(t('aiProviders.noProviderConfigured'))
      }

      if (provider.provider === 'custom' && !provider.baseUrl) {
        throw new Error(t('aiProviders.baseUrlNotConfigured'))
      }

      // Round-trip via the same SDK path executeCommand uses, so a passing test
      // means the real command path will work. Costs a few tokens per test.
      const languageModel = await resolveLanguageModel(provider)
      const { generateText } = await import('ai')
      await generateText({ model: languageModel, prompt: 'reply with: ok', maxOutputTokens: 5 })
      setTestResult({ success: true, message: t('aiProviders.connectionSuccess') })
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : t('aiProviders.connectionFailed') })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="saas-section">
      <div className="saas-card">
        <div className="saas-flex-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <label className="saas-label" style={{ margin: 0 }}>
            <Key size={16} style={{ marginRight: 8 }} />
            {t('aiProviders.title')}
          </label>
          <button className="saas-btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus size={14} /> {t('aiProviders.add')}
          </button>
        </div>

        {showAddForm && (
          <div className="ai-add-form" style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
            <div className="saas-segmented-control" style={{ marginBottom: 8 }}>
              {(['openai', 'anthropic', 'gemini', 'custom'] as AIProvider[]).map(p => (
                <button
                  key={p}
                  className={`saas-segment ${newProvider === p ? 'active' : ''}`}
                  onClick={() => setNewProvider(p)}
                >
                  {p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Claude' : p === 'gemini' ? 'Gemini' : 'Custom'}
                </button>
              ))}
            </div>

            <input
              type="password"
              className="saas-input"
              placeholder={t('aiProviders.apiKeyPlaceholder')}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              style={{ marginBottom: 8 }}
              autoComplete="off"
            />

            {newProvider === 'custom' && (
              <>
                <div className="saas-segmented-control" style={{ marginBottom: 8 }}>
                  {(['openai', 'anthropic'] as const).map(f => (
                    <button
                      key={f}
                      className={`saas-segment ${customFormat === f ? 'active' : ''}`}
                      onClick={() => setCustomFormat(f)}
                    >
                      {f === 'openai' ? t('aiProviders.formatOpenai') : t('aiProviders.formatAnthropic')}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="saas-input"
                  placeholder={customFormat === 'anthropic' ? t('aiProviders.baseUrlAnthropic') : t('aiProviders.baseUrlOpenai')}
                  value={customBaseUrl}
                  onChange={e => setCustomBaseUrl(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <input
                  type="text"
                  className="saas-input"
                  placeholder={t('aiProviders.modelPlaceholder')}
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                />
              </>
            )}

            <button className="saas-btn-primary" onClick={handleAddProvider} style={{ marginTop: 8 }}>
              {t('aiProviders.save')}
            </button>
          </div>
        )}

        {providers.length === 0 ? (
          <p className="saas-hint">{t('aiProviders.empty')}</p>
        ) : (
          <div className="provider-list">
            {providers.map(provider => (
              <div key={provider.provider} className="provider-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{provider.name}</span>
                    <span style={{ fontSize: 12, opacity: 0.6 }}>
                      {provider.model || providerDefaults[provider.provider].model}
                    </span>
                  </div>
                  {editingKey === provider.provider ? (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <input
                        type="password"
                        className="saas-input"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                        value={editKeyValue}
                        onChange={e => setEditKeyValue(e.target.value)}
                        autoComplete="off"
                      />
                      <button className="saas-btn-primary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => handleUpdateKey(provider.provider)}>{t('aiProviders.saveKey')}</button>
                      <button className="saas-btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setEditingKey(null)}>{t('aiProviders.cancel')}</button>
                    </div>
                  ) : (
                    <span
                      style={{ fontSize: 11, opacity: 0.5, cursor: 'pointer', fontFamily: 'monospace' }}
                      onClick={() => { setEditingKey(provider.provider); setEditKeyValue('') }}
                      title={t('aiProviders.changeKey')}
                    >
                      {maskKey(provider.apiKey)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  {activeProvider === provider.provider ? (
                    <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <Check size={14} /> {t('aiProviders.active')}
                    </span>
                  ) : (
                    <button className="saas-btn-secondary" onClick={() => setActive(provider.provider)} style={{ fontSize: 12 }}>
                      {t('aiProviders.activate')}
                    </button>
                  )}
                  <button className="saas-btn-icon" onClick={() => removeProvider(provider.provider)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeProvider && (
        <div className="saas-card">
          <div className="saas-flex-row" style={{ justifyContent: 'space-between' }}>
            <label className="saas-label" style={{ margin: 0 }}>{t('aiProviders.testConnection')}</label>
            <button
              className="saas-btn-secondary"
              onClick={handleTestProvider}
              disabled={testing}
            >
              {testing ? t('aiProviders.testing') : t('aiProviders.test')}
            </button>
          </div>
          {testResult && (
            <p className="saas-hint" style={{ marginTop: 8, color: testResult.success ? 'var(--accent)' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
              {testResult.success ? <Check size={14} /> : <AlertCircle size={14} />} {testResult.message}
            </p>
          )}
        </div>
      )}

      <div className="saas-card">
        <label className="saas-label">{t('aiProviders.usage')}</label>
        <p className="saas-hint">
          {t('aiProviders.usageHint')}
          <br /><br />
          {t('aiProviders.examples')}
          <br />- <code>! open email and slack</code>
          <br />- <code>! find that wiki page about auth</code>
          <br />- <code>! search stack overflow for react hooks</code>
        </p>
      </div>
    </div>
  )
}
