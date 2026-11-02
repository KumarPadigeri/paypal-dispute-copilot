// Small stroke icons (16px) drawn inline, so there is no icon library to load.
// They take the text color of their parent (currentColor).

const base = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const ReplyIcon = () => (
  <svg {...base}>
    <path d="M6.5 4L3 7.5 6.5 11" />
    <path d="M3 7.5h6.5a3.5 3.5 0 013.5 3.5v1" />
  </svg>
)

export const ClockIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3.2l2 1.3" />
  </svg>
)

export const CheckIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M5.6 8.2l1.7 1.7 3.2-3.4" />
  </svg>
)

export const TickIcon = () => (
  <svg {...base} width={12} height={12}>
    <path d="M3.5 8.3l3 3 6-6.6" />
  </svg>
)

export const CloseIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

export const ListIcon = () => (
  <svg {...base}>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
  </svg>
)

export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.4 10.4 3.1 3.1" />
  </svg>
)

export const DownloadIcon = () => (
  <svg {...base}>
    <path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" />
  </svg>
)

export const GridIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
  </svg>
)

export const SunIcon = () => (
  <svg {...base} width={16} height={16}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
  </svg>
)

export const MoonIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M13.5 9.5A5.5 5.5 0 116.5 2.5a4.5 4.5 0 007 7z" />
  </svg>
)

export const CopyIcon = () => (
  <svg {...base}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 009 2.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5" />
  </svg>
)

export const AlertIcon = () => (
  <svg {...base} width={18} height={18}>
    <path d="M8 2.2l6.2 11H1.8L8 2.2z" />
    <path d="M8 6.5v3M8 11.5h.01" />
  </svg>
)
