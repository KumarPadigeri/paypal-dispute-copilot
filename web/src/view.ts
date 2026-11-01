import { useEffect, useState } from 'react'

export type View = 'list' | 'grid'

/** The seller's card/list choice, remembered in this browser (cards unless they picked the list). */
export function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem('view') === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })
  const save = (v: View) => {
    setView(v)
    try {
      localStorage.setItem('view', v)
    } catch {
      /* private mode: keep it for this visit only */
    }
  }
  return [view, save]
}

export function useNarrow(query = '(max-width: 700px)') {
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return narrow
}
