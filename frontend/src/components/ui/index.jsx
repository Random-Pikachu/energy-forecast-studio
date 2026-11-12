import { AlertCircle, Info } from 'lucide-react'

export { Button } from './Button.jsx'
export { Field } from './Field.jsx'
export { Segmented } from './Segmented.jsx'

const NOTICE = {
  error: { icon: AlertCircle, role: 'alert', className: 'bg-negative-bg text-negative' },
  warning: { icon: Info, role: 'status', className: 'bg-warning-bg text-ink' },
}

export function Notice({ tone = 'error', className = '', children }) {
  const { icon: Icon, role, className: toneClass } = NOTICE[tone]
  return (
    <div role={role} className={`flex items-start gap-2 rounded-control p-3 text-body ${toneClass} ${className}`}>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const PANEL = {
  surface: 'bg-surface',
  outlined: 'border border-line bg-canvas',
}

export function Panel({ as: Tag = 'section', variant = 'surface', padded = true, className = '', children, ...rest }) {
  const padding = padded ? 'p-4 sm:p-6' : ''
  return (
    <Tag className={`rounded-panel ${PANEL[variant]} ${padding} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function Stat({ label, value, detail }) {
  const empty = value === null || value === undefined
  return (
    <div className="min-w-0">
      <dt className="text-label font-medium text-ink-2">{label}</dt>
      <dd className={`mt-1 truncate text-stat-sm font-semibold tabular-nums sm:text-stat ${empty ? 'text-ink-3' : 'text-ink'}`}>
        {empty ? '—' : value}
      </dd>
      <dd className="mt-0.5 truncate text-label text-ink-3">{detail || ' '}</dd>
    </div>
  )
}

export function Skeleton({ className = '', ...rest }) {
  return <div aria-hidden="true" className={`rounded-control bg-surface-2 ${className}`} {...rest} />
}
