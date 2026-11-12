import { Loader2 } from 'lucide-react'

const VARIANTS = {
  primary: 'h-12 rounded-full px-6 bg-lime text-forest enabled:hover:bg-lime-strong disabled:bg-surface-2 disabled:text-ink-3',
  secondary: 'h-10 rounded-full px-4 border border-forest text-forest enabled:hover:bg-surface disabled:border-line disabled:text-ink-3',
  text: 'rounded-sm font-medium text-forest underline-offset-4 enabled:hover:underline disabled:text-ink-3',
}

export function Button({ variant = 'primary', icon: Icon, loading = false, disabled, className = '', children, type = 'button', ...rest }) {
  const weight = variant === 'text' ? '' : 'font-semibold'
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 text-body ${weight} motion-safe:transition-colors ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 size={16} strokeWidth={1.75} className="motion-safe:animate-spin" aria-hidden="true" /> : null}
      {!loading && Icon ? <Icon size={16} strokeWidth={1.75} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
