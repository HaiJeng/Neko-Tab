import { useState, useEffect } from 'react'
import { Settings, X, Plus, Check, Upload, Palette, Save, Monitor, Terminal, LayoutGrid, Hash, Trash2, Download, Cpu, AlertTriangle, Plug, ExternalLink, Key, Heart } from 'lucide-react'
import type { Settings as SettingsType, ThemeInfo, UrlAlias, StartupSite } from '../types'
import { useStartupSites } from '../hooks/useStartupSites'
import { convertImageToAscii } from '../utils/imageToAscii'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { getConnectorsWithSettings, updateConnectorConfig } from '../connectors/registry'
import { AIProviders } from './Settings/AIProviders'
import { AIMemorySettings } from './Settings/AIMemory'
import { useTranslation, SUPPORTED_LANGUAGES } from '../i18n'
import type { SupportedLanguage } from '../i18n'

const THEMES: ThemeInfo[] = [
  // Simple Color Themes
  { id: 'carbon', name: 'Carbon', bgColor: '#222526', textColor: '#E0E0E0', accentColor: '#3dd2cc', category: 'color' },
  { id: 'paper', name: 'Paper', bgColor: '#F5F5F5', textColor: '#222526', accentColor: '#444444', category: 'color' },
  { id: 'nord', name: 'Nord', bgColor: '#2E3440', textColor: '#D8DEE9', accentColor: '#88C0D0', category: 'color' },
  { id: 'solarized', name: 'Solarized', bgColor: '#002B36', textColor: '#93A1A1', accentColor: '#2AA198', category: 'color' },
  { id: 'matrix', name: 'Matrix', bgColor: '#0D0D0D', textColor: '#00FF41', accentColor: '#008F11', category: 'color' },
  { id: 'dracula', name: 'Dracula', bgColor: '#282A36', textColor: '#F8F8F2', accentColor: '#BD93F9', category: 'color' },
  { id: 'monokai', name: 'Monokai', bgColor: '#272822', textColor: '#F8F8F2', accentColor: '#F92672', category: 'color' },
  { id: 'gruvbox', name: 'Gruvbox', bgColor: '#282828', textColor: '#EBDBB2', accentColor: '#FE8019', category: 'color' },
  { id: 'tokyo-night', name: 'Tokyo Night', bgColor: '#1A1B26', textColor: '#A9B1D6', accentColor: '#7AA2F7', category: 'color' },
  { id: 'catppuccin', name: 'Catppuccin', bgColor: '#1E1E2E', textColor: '#CDD6F4', accentColor: '#F5C2E7', category: 'color' },
  { id: 'one-dark', name: 'One Dark', bgColor: '#282C34', textColor: '#ABB2BF', accentColor: '#61AFEF', category: 'color' },
  { id: 'rose-pine', name: 'Rosé Pine', bgColor: '#191724', textColor: '#E0DEF4', accentColor: '#EBBCBA', category: 'color' },
  { id: 'everforest', name: 'Everforest', bgColor: '#2D353B', textColor: '#D3C6AA', accentColor: '#A7C080', category: 'color' },
  // Animated Themes
  { id: 'cyberpunk', name: 'Cyberpunk', bgColor: '#0a0a0f', textColor: '#00f0ff', accentColor: '#ff00ff', category: 'animated' },
  { id: 'aurora', name: 'Aurora', bgColor: '#0f0c29', textColor: '#ffffff', accentColor: '#a855f7', category: 'animated' },
  { id: 'synthwave', name: 'Synthwave', bgColor: '#1a1a2e', textColor: '#eaeaea', accentColor: '#e94560', category: 'animated' },
  { id: 'vaporwave', name: 'Vaporwave', bgColor: '#1a0a2e', textColor: '#ff71ce', accentColor: '#01cdfe', category: 'animated' },
  // Special Effect Themes
  { id: 'retro-terminal', name: 'Retro CRT', bgColor: '#0a0a0a', textColor: '#33ff33', accentColor: '#33ff33', category: 'special' },
  { id: 'sunset', name: 'Sunset', bgColor: '#1a1423', textColor: '#ffecd2', accentColor: '#fcb69f', category: 'special' },
  { id: 'ocean', name: 'Ocean', bgColor: '#0c1821', textColor: '#ccd6f6', accentColor: '#64ffda', category: 'special' },
  { id: 'midnight', name: 'Midnight', bgColor: '#020617', textColor: '#e2e8f0', accentColor: '#6366f1', category: 'special' },
  // AI-Inspired Themes
  { id: 'chatgpt', name: 'ChatGPT', bgColor: '#212121', textColor: '#ECECF1', accentColor: '#10A37F', category: 'color' },
  { id: 'claude', name: 'Claude', bgColor: '#1C1C1C', textColor: '#E8E8E8', accentColor: '#C9773A', category: 'color' },
]

const FONTS = [
  { id: 'jetbrains-mono',  name: 'JetBrains Mono',  family: 'JetBrains Mono' },
  { id: 'geist-mono',      name: 'Geist Mono',       family: 'Geist Mono' },
  { id: 'space-mono',      name: 'Space Mono',       family: 'Space Mono' },
  { id: 'fira-code',       name: 'Fira Code',        family: 'Fira Code' },
  { id: 'cascadia-code',   name: 'Cascadia Code',    family: 'Cascadia Code' },
  { id: 'ibm-plex-mono',   name: 'IBM Plex Mono',    family: 'IBM Plex Mono' },
  { id: 'intel-one-mono',  name: 'Intel One Mono',   family: 'Intel One Mono' },
  { id: 'iosevka',         name: 'Iosevka',          family: 'Iosevka' },
  { id: 'commit-mono',     name: 'Commit Mono',      family: 'Commit Mono' },
  { id: 'source-code-pro', name: 'Source Code Pro',  family: 'Source Code Pro' },
  { id: 'inconsolata',     name: 'Inconsolata',      family: 'Inconsolata' },
  { id: 'hack',            name: 'Hack',             family: 'Hack' },
]

interface SettingsPanelProps {
  settings: SettingsType
  onSettingsChange: (settings: SettingsType) => void
  onAddCategory: (name: string) => void
}

type TabType = 'appearance' | 'ascii' | 'preferences' | 'widgets' | 'ai' | 'aliases' | 'startup' | 'integrations' | 'backup' | 'advanced' | 'support';

export function SettingsPanel({ settings, onSettingsChange, onAddCategory }: SettingsPanelProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('appearance')
  const [localSettings, setLocalSettings] = useState<SettingsType>(settings)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isInverted, setIsInverted] = useState(false)
  const [bgImage, setBgImage] = useLocalStorage<string>('neko-bg-image', '')
  const [aliases, setAliases] = useLocalStorage<UrlAlias[]>('neko-aliases', [])
  const [aliasKey, setAliasKey] = useState('')
  const [aliasUrl, setAliasUrl] = useState('')
  const [newSiteUrl, setNewSiteUrl] = useState('')
  const [siteError, setSiteError] = useState<'invalid' | 'limit' | null>(null)
  const { sites: startupSites, setSites: setStartupSites, enabled: startupEnabled, setEnabled: setStartupEnabled } = useStartupSites()

  // Sync local settings when panel opens or settings change externally
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings)
    }
  }, [isOpen, settings])

  // Re-convert when inverted state changes or new file uploaded
  useEffect(() => {
    if (uploadedFile) {
      convertImageToAscii(uploadedFile, 50, isInverted)
        .then(ascii => {
          setLocalSettings(prev => ({ ...prev, customAsciiArt: ascii }))
        })
        .catch(err => console.error('Failed to convert image', err))
    }
  }, [isInverted, uploadedFile])

  // Background settings write-through immediately so preview is live
  const BG_LIVE_KEYS = new Set<keyof SettingsType>(['bgDim', 'bgBlur'])

  const handleChange = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    setLocalSettings(prev => {
      const updated = { ...prev, [key]: value }
      if (BG_LIVE_KEYS.has(key)) {
        onSettingsChange(updated)
      }
      return updated
    })
  }

  const handleSave = () => {
    onSettingsChange(localSettings)
    setIsOpen(false)
  }

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      onAddCategory(newCategoryName.trim())
      setNewCategoryName('')
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedFile(file)
    }
  }

  const addStartupSite = (url: string) => {
    const trimmed = url.trim()
    if (!trimmed) return
    if (startupSites.length >= 10) {
      setSiteError('limit')
      setTimeout(() => setSiteError(null), 2000)
      return
    }
    try {
      new URL(trimmed)
      setStartupSites((prev: StartupSite[]) => [...prev, { url: trimmed }])
      setNewSiteUrl('')
      setSiteError(null)
    } catch {
      setSiteError('invalid')
      setTimeout(() => setSiteError(null), 2000)
    }
  }

  const handleResetData = () => {
    const confirmed = window.confirm(
      t('settings.advanced.resetConfirm')
    )

    if (!confirmed) return

    localStorage.clear()

    const reload = () => window.location.reload()

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get('focusBlocking', (focusBlocking) => {
        chrome.storage.local.clear(() => {
          if (focusBlocking?.focusBlocking) {
            chrome.storage.local.set({ focusBlocking: focusBlocking.focusBlocking }, reload)
          } else {
            reload()
          }
        })
      })
      return
    }

    reload()
  }

  const renderToggle = (label: string, checked: boolean, onChange: (val: boolean) => void) => (
    <div className="saas-toggle-row">
      <span className="saas-toggle-label">{label}</span>
      <button 
        className={`saas-toggle-btn ${checked ? 'active' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <div className="saas-toggle-thumb" />
      </button>
    </div>
  )

  return (
    <>
      <button
        className='settings-toggle'
        onClick={() => setIsOpen(true)}
        title={t('settings.button')}
      >
        <Settings size={20} />
      </button>

      {isOpen && (
        <div className='settings-overlay' onClick={() => setIsOpen(false)}>
          <div className='saas-modal' onClick={e => e.stopPropagation()}>
            <button className='saas-close-btn top-right' onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
            {/* Sidebar Navigation */}
            <div className='saas-sidebar'>
              <div className='saas-sidebar-header'>
                <Settings size={18} />
                <span>{t('settings.button')}</span>
              </div>
              <nav className='saas-nav'>
                <button
                  className={`saas-nav-item ${activeTab === 'appearance' ? 'active' : ''}`}
                  onClick={() => setActiveTab('appearance')}
                >
                  <Palette size={16} /> {t('settings.nav.appearance')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'ascii' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ascii')}
                >
                  <Terminal size={16} /> {t('settings.nav.ascii')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'preferences' ? 'active' : ''}`}
                  onClick={() => setActiveTab('preferences')}
                >
                  <Monitor size={16} /> {t('settings.nav.preferences')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'widgets' ? 'active' : ''}`}
                  onClick={() => setActiveTab('widgets')}
                >
                  <LayoutGrid size={16} /> {t('settings.nav.widgets')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'ai' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ai')}
                >
                  <Key size={16} /> {t('settings.nav.ai')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'aliases' ? 'active' : ''}`}
                  onClick={() => setActiveTab('aliases')}
                >
                  <Hash size={16} /> {t('settings.nav.aliases')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'startup' ? 'active' : ''}`}
                  onClick={() => setActiveTab('startup')}
                >
                  <ExternalLink size={16} /> {t('settings.nav.startup')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'integrations' ? 'active' : ''}`}
                  onClick={() => setActiveTab('integrations')}
                >
                  <Plug size={16} /> {t('settings.nav.integrations')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'backup' ? 'active' : ''}`}
                  onClick={() => setActiveTab('backup')}
                >
                  <Download size={16} /> {t('settings.nav.backup')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'advanced' ? 'active' : ''}`}
                  onClick={() => setActiveTab('advanced')}
                >
                  <Cpu size={16} /> {t('settings.nav.advanced')}
                </button>
                <button
                  className={`saas-nav-item ${activeTab === 'support' ? 'active' : ''}`}
                  onClick={() => setActiveTab('support')}
                >
                  <Heart size={16} /> {t('settings.nav.support')}
                </button>
              </nav>
            </div>

            {/* Main Content Area */}
            <div className='saas-main'>
              <div className='saas-main-header'>
                <h3 className='saas-title'>
                  {activeTab === 'appearance' && t('settings.title.appearance')}
                  {activeTab === 'ascii' && t('settings.title.ascii')}
                  {activeTab === 'preferences' && t('settings.title.preferences')}
                  {activeTab === 'widgets' && t('settings.title.widgets')}
                  {activeTab === 'ai' && t('settings.title.ai')}
                  {activeTab === 'aliases' && t('settings.title.aliases')}
                  {activeTab === 'startup' && t('settings.title.startup')}
                  {activeTab === 'integrations' && t('settings.title.integrations')}
                  {activeTab === 'backup' && t('settings.title.backup')}
                  {activeTab === 'advanced' && t('settings.title.advanced')}
                  {activeTab === 'support' && t('settings.title.support')}
                </h3>
              </div>

              <div className='saas-content-scroll' key={activeTab}>
                {/* APPEARANCE TAB */}
                {activeTab === 'appearance' && (
                  <div className='saas-section'>
                    <div className='saas-section-group'>
                      <label className='saas-section-label'>{t('settings.appearance.colorThemes')}</label>                      <div className='saas-theme-grid'>
                        {THEMES.filter(t => t.category === 'color').map(theme => (
                          <div 
                            key={theme.id}
                            className={`saas-theme-card ${localSettings.theme === theme.id ? 'active' : ''}`}
                            onClick={() => handleChange('theme', theme.id)}
                          >
                            <div 
                              className='theme-preview'
                              style={{ 
                                backgroundColor: theme.bgColor,
                                borderColor: localSettings.theme === theme.id ? theme.accentColor : 'rgba(255,255,255,0.05)'
                              }}
                            >
                              <div className='theme-preview-lines'>
                                <div className='preview-line' style={{ backgroundColor: theme.accentColor, width: '60%' }}></div>
                                <div className='preview-line' style={{ backgroundColor: theme.textColor, width: '80%', opacity: 0.3 }}></div>
                              </div>
                              <div className='theme-preview-dot' style={{ backgroundColor: theme.accentColor }}></div>
                              {localSettings.theme === theme.id && (
                                <div className='theme-check' style={{ backgroundColor: theme.accentColor }}>
                                  <Check size={12} strokeWidth={3} />
                                </div>
                              )}
                            </div>
                            <span className='theme-name'>{theme.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className='saas-section-group'>
                      <label className='saas-section-label'>{t('settings.appearance.animatedThemes')}</label>
                      <div className='saas-theme-grid'>
                        {THEMES.filter(t => t.category === 'animated').map(theme => (
                          <div 
                            key={theme.id}
                            className={`saas-theme-card ${localSettings.theme === theme.id ? 'active' : ''}`}
                            onClick={() => handleChange('theme', theme.id)}
                          >
                            <div 
                              className={`theme-preview theme-preview-animated ${theme.id}`}
                              style={{ 
                                backgroundColor: theme.bgColor,
                                borderColor: localSettings.theme === theme.id ? theme.accentColor : 'rgba(255,255,255,0.05)'
                              }}
                            >
                              <div className='theme-preview-lines'>
                                <div className='preview-line' style={{ backgroundColor: theme.accentColor, width: '60%' }}></div>
                                <div className='preview-line' style={{ backgroundColor: theme.textColor, width: '80%', opacity: 0.3 }}></div>
                              </div>
                              <div className='theme-preview-dot' style={{ backgroundColor: theme.accentColor }}></div>
                              {localSettings.theme === theme.id && (
                                <div className='theme-check' style={{ backgroundColor: theme.accentColor }}>
                                  <Check size={12} strokeWidth={3} />
                                </div>
                              )}
                            </div>
                            <span className='theme-name'>{theme.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className='saas-section-group'>
                      <label className='saas-section-label'>{t('settings.appearance.specialEffects')}</label>
                      <div className='saas-theme-grid'>
                        {THEMES.filter(t => t.category === 'special').map(theme => (
                          <div 
                            key={theme.id}
                            className={`saas-theme-card ${localSettings.theme === theme.id ? 'active' : ''}`}
                            onClick={() => handleChange('theme', theme.id)}
                          >
                            <div 
                              className={`theme-preview theme-preview-special ${theme.id}`}
                              style={{ 
                                backgroundColor: theme.bgColor,
                                borderColor: localSettings.theme === theme.id ? theme.accentColor : 'rgba(255,255,255,0.05)'
                              }}
                            >
                              <div className='theme-preview-lines'>
                                <div className='preview-line' style={{ backgroundColor: theme.accentColor, width: '60%' }}></div>
                                <div className='preview-line' style={{ backgroundColor: theme.textColor, width: '80%', opacity: 0.3 }}></div>
                              </div>
                              <div className='theme-preview-dot' style={{ backgroundColor: theme.accentColor }}></div>
                              {localSettings.theme === theme.id && (
                                <div className='theme-check' style={{ backgroundColor: theme.accentColor }}>
                                  <Check size={12} strokeWidth={3} />
                                </div>
                              )}
                            </div>
                            <span className='theme-name'>{theme.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className='saas-section-group'>
                      <label className='saas-section-label'>{t('settings.appearance.fontFamily')}</label>
                      <div className='saas-theme-grid'>
                        {(() => {
                          const currentTheme = THEMES.find(t => t.id === localSettings.theme) || THEMES[0];
                          return FONTS.map(font => {
                            const isFontActive = localSettings.font === font.family;
                            
                            return (
                              <div 
                                key={font.id}
                                className={`saas-theme-card ${isFontActive ? 'active' : ''}`}
                                onClick={() => handleChange('font', font.family)}
                              >
                                <div 
                                  className='theme-preview'
                                  style={{ 
                                    backgroundColor: currentTheme.bgColor,
                                    borderColor: isFontActive ? currentTheme.accentColor : 'rgba(255,255,255,0.05)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: `'${font.family}', monospace`,
                                    fontSize: '20px',
                                    color: currentTheme.textColor,
                                    overflow: 'hidden'
                                  }}
                                >
                                  <div style={{ opacity: 0.9 }}>Abc</div>
                                  {isFontActive && (
                                    <div className='theme-check' style={{ backgroundColor: currentTheme.accentColor }}>
                                      <Check size={12} strokeWidth={3} />
                                    </div>
                                  )}
                                </div>
                                <span className='theme-name'>{font.name}</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    <div className='saas-section-group'>
                      <label className='saas-section-label'>{t('settings.appearance.language')}</label>
                      <div className='saas-theme-grid'>
                        {SUPPORTED_LANGUAGES.map(lang => (
                          <div
                            key={lang.code}
                            className={`saas-theme-card ${localSettings.language === lang.code ? 'active' : ''}`}
                            onClick={() => handleChange('language', lang.code as SupportedLanguage)}
                          >
                            <span className='theme-name'>{lang.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* PREFERENCES TAB */}
                {activeTab === 'preferences' && (
                  <div className='saas-section'>
                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.pref.userIdentifier')}</label>
                      <input
                        id='userName'
                        type='text'
                        value={localSettings.userName}
                        onChange={e => handleChange('userName', e.target.value)}
                        className='saas-input'
                        placeholder={t('settings.pref.userIdentifierPlaceholder')}
                      />
                    </div>

                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.pref.displayOptions')}</label>
                      <div className='saas-toggle-list'>
                        {renderToggle(t('settings.pref.showStatusBar'), localSettings.showStatusBar, val => handleChange('showStatusBar', val))}
                        {localSettings.showStatusBar && renderToggle(t('settings.pref.showTabCounter'), localSettings.showTabCounter ?? true, val => handleChange('showTabCounter', val))}
                        {renderToggle(t('settings.pref.showGreeting'), localSettings.showGreeting, val => handleChange('showGreeting', val))}
                        {renderToggle(t('settings.pref.showClock'), localSettings.showClock, val => handleChange('showClock', val))}
                      </div>
                    </div>

                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.pref.clockFormat')}</label>
                      <div className='saas-segmented-control'>
                        <button
                          className={`saas-segment ${localSettings.clockFormat === '12h' ? 'active' : ''}`}
                          onClick={() => handleChange('clockFormat', '12h')}
                        >
                          {t('settings.pref.clock12h')}
                        </button>
                        <button
                          className={`saas-segment ${localSettings.clockFormat === '24h' ? 'active' : ''}`}
                          onClick={() => handleChange('clockFormat', '24h')}
                        >
                          {t('settings.pref.clock24h')}
                        </button>
                      </div>
                    </div>

                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.pref.addCategory')}</label>
                      <div className='saas-flex-row'>
                        <input
                          type='text'
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          placeholder={t('settings.pref.addCategoryPlaceholder')}
                          className='saas-input'
                        />
                        <button className='saas-btn-icon' onClick={handleAddCategory}>
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ASCII ART TAB */}
                {activeTab === 'ascii' && (
                  <div className='saas-section'>
                    <div className='saas-card'>
                      <div className='saas-toggle-list'>
                        {renderToggle(t('settings.ascii.show'), localSettings.showAsciiArt ?? true, val => handleChange('showAsciiArt', val))}
                      </div>
                    </div>
                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.ascii.source')}</label>
                      <div className='saas-segmented-control'>
                        <button
                          className={`saas-segment ${localSettings.asciiArtSource === 'os' ? 'active' : ''}`}
                          onClick={() => handleChange('asciiArtSource', 'os')}
                        >
                          {t('settings.ascii.sourceOs')}
                        </button>
                        <button
                          className={`saas-segment ${localSettings.asciiArtSource === 'cat' ? 'active' : ''}`}
                          onClick={() => handleChange('asciiArtSource', 'cat')}
                        >
                          {t('settings.ascii.sourceCat')}
                        </button>
                        <button
                          className={`saas-segment ${localSettings.asciiArtSource === 'custom' ? 'active' : ''}`}
                          onClick={() => handleChange('asciiArtSource', 'custom')}
                        >
                          {t('settings.ascii.sourceCustom')}
                        </button>
                      </div>
                    </div>

                    {localSettings.asciiArtSource === 'os' && (
                      <div className='saas-card'>
                        <p className='saas-hint'>{t('settings.ascii.osHint')}</p>
                      </div>
                    )}

                    {localSettings.asciiArtSource === 'custom' && (
                      <>
                        <div className='saas-card'>
                          <label className='saas-label'>{t('settings.ascii.converter')}</label>
                          <label className='saas-upload-area'>
                            <Upload size={24} className="saas-upload-icon" />
                            <span className="saas-upload-text">{t('settings.ascii.uploadImage')}</span>
                            <input
                              type='file'
                              accept='image/*'
                              onChange={handleImageUpload}
                              className='saas-hidden-file'
                            />
                          </label>
                          <div className='saas-upload-options'>
                            {renderToggle(t('settings.ascii.invertColors'), isInverted, setIsInverted)}
                          </div>
                        </div>

                        <div className='saas-card'>
                          <label className='saas-label'>{t('settings.ascii.customInput')}</label>
                          <textarea
                            className='saas-textarea'
                            value={localSettings.customAsciiArt ?? localSettings.asciiArt ?? ''}
                            onChange={e => handleChange('customAsciiArt', e.target.value)}
                            placeholder={t('settings.ascii.customPlaceholder')}
                            spellCheck={false}
                            rows={10}
                          />
                        </div>
                      </>
                    )}

                    {localSettings.asciiArtSource === 'cat' && (
                      <div className='saas-card'>
                        <p className='saas-hint'>{t('settings.ascii.catHint')}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* WIDGETS TAB */}
                {activeTab === 'widgets' && (
                  <div className='saas-section'>
                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.widgets.customBackground')}</label>
                      <label className='saas-upload-area'>
                        <Upload size={24} className="saas-upload-icon" />
                        <span className="saas-upload-text">
                          {bgImage ? t('settings.widgets.changeBackground') : t('settings.widgets.uploadBackground')}
                        </span>
                        <input
                          type='file' accept='image/*' className='saas-hidden-file'
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = ev => setBgImage(ev.target?.result as string ?? '')
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                      {bgImage && (
                        <button className='saas-btn-secondary' style={{ marginTop: 8, fontSize: 12 }} onClick={() => setBgImage('')}>
                          {t('settings.widgets.removeBackground')}
                        </button>
                      )}
                      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <label className='saas-label' style={{ marginBottom: 6 }}>{t('settings.widgets.dimOverlay')} — {localSettings.bgDim ?? 40}%</label>
                          <input type='range' min={0} max={90} step={5}
                            value={localSettings.bgDim ?? 40}
                            onChange={e => handleChange('bgDim', Number(e.target.value))}
                            className='saas-range' />
                        </div>
                        <div>
                          <label className='saas-label' style={{ marginBottom: 6 }}>{t('settings.widgets.backgroundBlur')} — {localSettings.bgBlur ?? 0}px</label>
                          <input type='range' min={0} max={10} step={1}
                            value={localSettings.bgBlur ?? 0}
                            onChange={e => handleChange('bgBlur', Number(e.target.value))}
                            className='saas-range' />
                        </div>
                      </div>
                    </div>

                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.widgets.dailyGoal')}</label>
                      <div className='saas-toggle-list'>
                        {renderToggle(t('settings.widgets.showDailyGoal'), localSettings.showDailyGoal ?? true, val => handleChange('showDailyGoal', val))}
                      </div>
                      <p className='saas-hint'>{t('settings.widgets.dailyGoalHint')}</p>
                    </div>

                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.widgets.githubStreak')}</label>
                      <div className='saas-toggle-list'>
                        {renderToggle(t('settings.widgets.showInStatusBar'), localSettings.showGitHubStreak ?? false, val => handleChange('showGitHubStreak', val))}
                      </div>
                      <input type='text'
                        value={localSettings.githubUsername ?? ''}
                        onChange={e => handleChange('githubUsername', e.target.value)}
                        placeholder={t('settings.widgets.githubUsernamePlaceholder')} className='saas-input' style={{ marginTop: 12 }} />
                      <p className='saas-hint'>{t('settings.widgets.githubHint')}</p>
                    </div>
                  </div>
                )}
                {/* ALIASES TAB */}
                {activeTab === 'aliases' && (
                  <div className='saas-section'>
                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.aliases.add')}</label>
                      <div className='saas-flex-row' style={{ gap: 8 }}>
                        <input type='text' className='saas-input alias-key-input'
                          value={aliasKey} onChange={e => setAliasKey(e.target.value.toLowerCase().replace(/\s/g, ''))}
                          placeholder={t('settings.aliases.keyPlaceholder')} maxLength={20} />
                        <input type='text' className='saas-input'
                          value={aliasUrl} onChange={e => setAliasUrl(e.target.value)}
                          placeholder={t('settings.aliases.urlPlaceholder')}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && aliasKey && aliasUrl) {
                              setAliases(prev => [...prev.filter(a => a.key !== aliasKey), { key: aliasKey, url: aliasUrl }])
                              setAliasKey(''); setAliasUrl('')
                            }
                          }} />
                        <button className='saas-btn-icon' onClick={() => {
                          if (!aliasKey || !aliasUrl) return
                          setAliases(prev => [...prev.filter(a => a.key !== aliasKey), { key: aliasKey, url: aliasUrl }])
                          setAliasKey(''); setAliasUrl('')
                        }}><Plus size={18} /></button>
                      </div>
                      <p className='saas-hint'>{t('settings.aliases.hint')}</p>
                    </div>
                    {aliases.length > 0 && (
                      <div className='saas-card'>
                        <label className='saas-label'>{t('settings.aliases.saved')}</label>
                        <div className='alias-list'>
                          {aliases.map(a => (
                            <div key={a.key} className='alias-row'>
                              <span className='alias-key'>{a.key}</span>
                              <span className='alias-arrow'>→</span>
                              <span className='alias-url'>{a.url}</span>
                              <button className='alias-delete' onClick={() => setAliases(prev => prev.filter(x => x.key !== a.key))}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STARTUP SITES TAB */}
                {activeTab === 'startup' && (
                  <div className='saas-section'>
                    <div className='saas-card'>
                      <div className='saas-toggle-list'>
                        {renderToggle(t('settings.startup.enable'), startupEnabled, v => setStartupEnabled(v))}
                      </div>
                      <p className='saas-hint'>{t('settings.startup.hintPrefix')} <kbd style={{ fontFamily: 'inherit', fontSize: '0.85em', background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 3 }}>Alt+Shift+S</kbd> {t('settings.startup.hintSuffix')}</p>
                    </div>
                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.startup.addUrl')}</label>
                      <div className='saas-flex-row' style={{ gap: 8 }}>
                        <input
                          type='text'
                          className='saas-input'
                          value={newSiteUrl}
                          onChange={e => setNewSiteUrl(e.target.value)}
                          placeholder='https://github.com'
                          onKeyDown={e => {
                            if (e.key === 'Enter') addStartupSite(newSiteUrl)
                          }}
                          style={{ borderColor: siteError === 'invalid' ? '#ef4444' : undefined }}
                        />
                        <button
                          className='saas-btn-icon'
                          onClick={() => addStartupSite(newSiteUrl)}
                          title={startupSites.length >= 10 ? t('settings.startup.limitReached') : t('settings.startup.addSite')}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                        <p className='saas-hint' style={{ margin: 0 }}>{t('settings.startup.sitesCount', { count: startupSites.length })}</p>
                        {siteError && (
                          <span style={{ color: siteError === 'invalid' ? '#ef4444' : '#f59e0b', fontSize: 12 }}>
                            {siteError === 'invalid' ? t('settings.startup.invalidUrl') : t('settings.startup.limitReached')}
                          </span>
                        )}
                      </div>
                    </div>
                    {startupSites.length > 0 && (
                      <div className='saas-card'>
                        <label className='saas-label'>{t('settings.startup.sites')}</label>
                        <div className='alias-list'>
                          {startupSites.map((site: StartupSite, i: number) => (
                            <div key={i} className='alias-row'>
                              <span className='alias-url' style={{ flex: 1 }}>{site.url}</span>
                              <button className='alias-delete' onClick={() => setStartupSites((prev: StartupSite[]) => prev.filter((_: StartupSite, j: number) => j !== i))}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* INTEGRATIONS TAB */}
                {activeTab === 'integrations' && (
                  <div className='saas-section'>
                    {getConnectorsWithSettings().map(connector => (
                      <connector.SettingsWidget
                        key={connector.id}
                        config={localSettings.connectors?.[connector.id] ?? {}}
                        onConfigChange={(patch: Record<string, unknown>) => {
                          setLocalSettings(prev => updateConnectorConfig(prev, connector.id, patch))
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* BACKUP TAB */}
                {activeTab === 'backup' && (
                  <div className='saas-section'>
                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.backup.export')}</label>
                      <p className='saas-hint' style={{ marginBottom: 12 }}>
                        {t('settings.backup.exportHint')}
                      </p>
                      <button className='saas-btn-primary' onClick={() => import('../utils/backup').then(m => m.exportSettings())} style={{ width: '100%' }}>
                        <Download size={16} /> {t('settings.backup.exportBtn')}
                      </button>
                    </div>

                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.backup.import')}</label>
                      <p className='saas-hint' style={{ marginBottom: 12 }}>
                        {t('settings.backup.importHint')}
                        <span style={{ color: '#ff4444', display: 'block', marginTop: 4 }}>
                          {t('settings.backup.importWarning')}
                        </span>
                      </p>
                      <label className='saas-upload-area'>
                        <Upload size={24} className="saas-upload-icon" />
                        <span className="saas-upload-text">{t('settings.backup.uploadBackup')}</span>
                        <input
                          type='file'
                          accept='.json'
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = async (ev) => {
                              const content = ev.target?.result as string
                              const { importSettings } = await import('../utils/backup')
                              if (importSettings(content)) {
                                // Success - page will reload
                              } else {
                                alert(t('settings.backup.importFailed'))
                              }
                            }
                            reader.readAsText(file)
                          }}
                          className='saas-hidden-file'
                        />
                      </label>
                    </div>
                  </div>
                )}
                {/* AI TAB */}
                {activeTab === 'ai' && (
                  <>
                    <AIProviders />
                    <div className="saas-section">
                      <AIMemorySettings />
                    </div>
                  </>
                )}

                {/* ADVANCED TAB */}
                {activeTab === 'advanced' && (
                  <div className='saas-section'>
                    <div className='saas-card'>
                      <label className='saas-label'>{t('settings.advanced.homePage')}</label>
                      <div className='saas-toggle-list'>
                        {renderToggle(t('settings.advanced.showChromeTab'), localSettings.showChromeTab ?? true, val => handleChange('showChromeTab', val))}
                      </div>
                      <p className='saas-hint'>{t('settings.advanced.chromeTabHint')}
                      </p>
                    </div>                    <div className='saas-card' style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                      <label
                        className='saas-label'
                        style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <AlertTriangle size={16} /> {t('settings.advanced.dangerZone')}
                      </label>

                      <p className='saas-hint' style={{ marginBottom: 12 }}>
                        {t('settings.advanced.dangerHint')}
                      </p>

                      <button
                        className='saas-btn-secondary'
                        onClick={handleResetData}
                        style={{ width: '100%', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                      >
                        <Trash2 size={14} style={{ marginRight: 8 }} /> {t('settings.advanced.resetBtn')}
                      </button>
                    </div>
                  </div>
                )}

                {/* SUPPORT TAB */}
                {activeTab === 'support' && (
                  <div className='saas-section'>
                    <div className='saas-card' style={{ textAlign: 'center', alignItems: 'center' }}>
                      <label className='saas-label'>{t('settings.support.title')}</label>
                      <p className='saas-hint' style={{ textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
                        {t('settings.support.hint')}
                      </p>
                      <a
                        href="https://ko-fi.com/uddinrajaul"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="saas-btn-primary"
                        style={{ textDecoration: 'none', width: '100%', justifyContent: 'center', marginTop: 8 }}
                      >
                        {t('settings.support.coffee')}
                      </a>
                    </div>
                  </div>
                )}
              </div>
              <div className='saas-footer'>
                <button className='saas-btn-secondary' onClick={() => setIsOpen(false)}>
                  {t('settings.footer.cancel')}
                </button>
                <button className='saas-btn-primary' onClick={handleSave}>
                  <Save size={16} />
                  {t('settings.footer.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
