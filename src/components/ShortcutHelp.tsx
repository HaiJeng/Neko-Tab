import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '../i18n'
import type { TranslationKey } from '../i18n'

const SHORTCUTS: { keys: string; descKey: TranslationKey }[] = [
  { keys: 'Ctrl+K',         descKey: 'shortcut.commandPalette' },
  { keys: '/command',        descKey: 'shortcut.slashCommands' },
  { keys: 'Ctrl+`',         descKey: 'shortcut.scratchpad' },
  { keys: 'Ctrl+Shift+T',   descKey: 'shortcut.workTimer' },
  { keys: 'Alt+Shift+S',    descKey: 'shortcut.startupSites' },
  { keys: 'c',              descKey: 'shortcut.chromeTab' },
  { keys: '?',              descKey: 'shortcut.help' },
  { keys: 'Escape',         descKey: 'shortcut.closePanel' },
  { keys: '↑ / ↓',         descKey: 'shortcut.navigate' },
  { keys: 'Enter',          descKey: 'shortcut.openResult' },
  { keys: 'Enter / Escape', descKey: 'shortcut.dailyGoal' },
  { keys: 'Enter',          descKey: 'shortcut.newChecklist' },
  { keys: 'Backspace',      descKey: 'shortcut.deleteChecklist' },
]

export function ShortcutHelp() {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '?') { e.preventDefault(); setIsOpen(o => !o) }
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!isOpen) return null

  return (
    <div className="sh-overlay" onClick={() => setIsOpen(false)}>
      <div className="sh-panel" onClick={e => e.stopPropagation()}>
        <div className="sh-header">
          <span className="sh-title">{t('shortcut.title')}</span>
          <button className="sh-close" onClick={() => setIsOpen(false)}><X size={15} /></button>
        </div>
        <div className="sh-list">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="sh-row">
              <kbd className="sh-kbd">{s.keys}</kbd>
              <span className="sh-desc">{t(s.descKey)}</span>
            </div>
          ))}
        </div>
        <div className="sh-footer">{t('shortcut.footerPrefix')} <kbd className="sh-kbd">?</kbd> {t('shortcut.footerOr')} <kbd className="sh-kbd">esc</kbd> {t('shortcut.footerSuffix')}</div>
      </div>
    </div>
  )
}
