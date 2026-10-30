import { useState } from 'react'
import { MoonIcon, SunIcon } from './icons'

type Theme = 'light' | 'dark'

/** Light by default; the seller's pick is remembered in this browser. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )

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
