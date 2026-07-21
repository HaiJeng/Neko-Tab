import { useTime } from '../hooks/useLocalStorage'
import { useState, useEffect } from 'react'
import { useTranslation } from '../i18n'

interface ClockProps {
  userName?: string
  showGreeting?: boolean
  format?: '12h' | '24h'
}

export function Clock({ userName = 'User', showGreeting = true, format = '24h' }: ClockProps) {
  const time = useTime()
  const { t, locale } = useTranslation()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const appEl = document.querySelector('.app')
    if (isMaximized) {
      appEl?.classList.add('clock-maximized')
    } else {
      appEl?.classList.remove('clock-maximized')
    }
    return () => {
      appEl?.classList.remove('clock-maximized')
    }
  }, [isMaximized])

  useEffect(() => {
    if (!isMaximized) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. If typing in an input or textarea, don't exit
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      // 2. Ignore modifier keys alone
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return

      // 3. Check for registered shortcuts
      const isCmdOrCtrl = e.ctrlKey || e.metaKey
      const isShortcut = 
        e.key === 'Escape' ||
        (isCmdOrCtrl && e.key === 'k') ||
        e.key === '/' ||
        (isCmdOrCtrl && e.key === '`') ||
        (isCmdOrCtrl && e.shiftKey && e.key === 'T') ||
        (e.key.toLowerCase() === 'c' && !isCmdOrCtrl && !e.altKey) ||
        e.key === '?'
      
      if (isShortcut) {
        setIsMaximized(false)
        // We do NOT stop propagation or prevent default here, 
        // so the registered action can still trigger.
      }
    }

    // Use capture phase to intercept before other handlers if necessary,
    // though here we just need to see the event to trigger exit.
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isMaximized])
  
  const hours = time.getHours()

  const SEGMENT_SIZES: Record<string, number> = {
    lateNight: 5,
    earlyMorning: 5,
    morning: 5,
    lateMorning: 4,
    afternoon: 5,
    lateAfternoon: 5,
    evening: 5,
    night: 5,
  }

  const getSegment = () => {
    const h = hours
    if (h < 4)  return 'lateNight'
    if (h < 6)  return 'earlyMorning'
    if (h < 10) return 'morning'
    if (h < 12) return 'lateMorning'
    if (h < 15) return 'afternoon'
    if (h < 18) return 'lateAfternoon'
    if (h < 21) return 'evening'
    return 'night'
  }

  const segment = getSegment()
  // Rotate daily so it changes but isn't random on every re-render
  const dayOfYear = Math.floor((time.getTime() - new Date(time.getFullYear(), 0, 0).getTime()) / 86400000)
  const greetingIndex = dayOfYear % SEGMENT_SIZES[segment]
  const greeting = t(`clock.greeting.${segment}.${greetingIndex}` as any)

  const formattedTime = time.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: format === '12h'
  })

  const formattedDate = time.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  return (
    <div
      className={`clock-container ${isMaximized ? 'maximized' : ''}`}
      onClick={() => setIsMaximized(!isMaximized)}
      title={isMaximized ? t('clock.exit') : t('clock.maximize')}
    >
      <div className="clock-time">{formattedTime}</div>
      <div className="clock-date">{formattedDate}</div>
      {showGreeting && !isMaximized && (
        <div className="clock-greeting">{greeting}, {userName}</div>
      )}
    </div>
  )
}
