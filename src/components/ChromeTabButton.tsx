import { useEffect } from 'react'
import { Earth } from 'lucide-react'
import { recordTabUsage } from '../utils/tabUsage'
import { useTranslation } from '../i18n'

export const openChromeNewTab = () => {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    void recordTabUsage()
    chrome.tabs.update({ url: 'chrome://new-tab-page' })
  } 
}

interface ChromeTabButtonProps {
  visible?: boolean
}

export function ChromeTabButton({ visible = true }: ChromeTabButtonProps) {
  const { t } = useTranslation()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      
      // Open on 'c' key
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        openChromeNewTab()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!visible) return null

  return (
    <button
      className="chrome-tab-toggle"
      onClick={openChromeNewTab}
      title={t('chromeTab.title')}
    >
      <Earth size={20} />
    </button>
  )
}
