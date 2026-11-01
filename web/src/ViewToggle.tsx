import { GridIcon, ListIcon } from './icons'
import type { View } from './view'

/** One button, like the theme toggle: it shows the view you would switch to. */
export default function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const next: View = view === 'grid' ? 'list' : 'grid'
  // Named after the view it opens; the table is the "grid" to sellers
  const label = next === 'grid' ? 'Card View' : 'Grid View'
  return (
    // Icon-only, so it says what it does on hover and keyboard focus
    <button className="icon-btn" onClick={() => onChange(next)} aria-label={label} data-tip={label}>
      {next === 'grid' ? <GridIcon /> : <ListIcon />}
    </button>
  )
}
