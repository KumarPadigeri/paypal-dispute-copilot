import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon } from './icons'

type Theme = 'light' | 'dark'

const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')

/** Follows the computer's setting until the seller picks a theme; the pick is remembered. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme | undefined) ?? systemTheme(),
  )

  // While no theme is picked, keep following the system if it changes.
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      if (!document.documentElement.dataset.theme) setTheme(systemTheme())
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const pick = () => {
    document.documentElement.dataset.theme = next
    setTheme(next)
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* private mode: applies to this visit only */
    }
  }

  return (
    <button className="icon-btn" onClick={pick} aria-label={`Switch to ${next} theme`}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
