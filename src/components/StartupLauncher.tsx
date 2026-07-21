import { useEffect } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { useStartupSites } from '../hooks/useStartupSites'
import { useTranslation } from '../i18n'
import type { TranslationKey } from '../i18n'

function greetingKey(): TranslationKey {
  const hour = new Date().getHours()
  if (hour < 12) return 'startupLauncher.morning'
  if (hour < 17) return 'startupLauncher.afternoon'
  return 'startupLauncher.evening'
}

export function StartupLauncher() {
  const { sites, shouldShow, markShown, openStartupSites, setForceShow } = useStartupSites()
  const { t } = useTranslation()

  // Listen for shortcut-triggered show request from background service worker
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg?.type === 'neko-show-startup-card') {
        setForceShow(true)
      }
    }
    chrome.runtime?.onMessage?.addListener(listener)
    return () => chrome.runtime?.onMessage?.removeListener(listener)
  }, [setForceShow])

  if (!shouldShow) return null

  const handleOpen = () => {
    void openStartupSites()
  }

  const handleDismiss = () => {
    markShown()
  }

  return (
    <div className="startup-launcher">
      <div className="startup-launcher-inner">
        <span className="startup-launcher-prompt">
          {t('startupLauncher.prompt', { greeting: t(greetingKey()) })}
        </span>
        <button className="startup-launcher-open" onClick={handleOpen}>
          <ExternalLink size={13} />
          {t('startupLauncher.openAll', { count: sites.length })}
        </button>
        <button className="startup-launcher-dismiss" onClick={handleDismiss} title={t('startupLauncher.notToday')}>
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
