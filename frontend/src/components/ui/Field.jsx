import { ChevronDown } from 'lucide-react'

const CONTROL = 'block w-full rounded-control border bg-canvas px-3 text-body font-medium text-ink tabular-nums motion-safe:transition-colors hover:border-ink-3 disabled:bg-surface disabled:text-ink-3'

export function Field({ label, id, as = 'input', helper, error, className = '', controlClassName = '', children, ...rest }) {
  const Control = as
  const helperId = helper ? `${id}-helper` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined
  const shape = as === 'textarea' ? 'py-2.5 resize-y' : 'h-11'
  const select = as === 'select' ? 'appearance-none pr-10' : ''
  const border = error ? 'border-negative' : 'border-line'

  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="mb-1.5 block text-label font-medium text-ink-2">{label}</label>
      <div className="relative">
        <Control
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${CONTROL} ${shape} ${select} ${border} ${controlClassName}`}
          {...rest}
        >
          {children}
        </Control>
        {as === 'select' ? (
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
        ) : null}
      </div>
      {error ? <p id={errorId} className="mt-1.5 text-label text-negative">{error}</p> : null}
      {helper ? <p id={helperId} className="mt-1.5 text-label text-ink-3">{helper}</p> : null}
    </div>
  )
}
