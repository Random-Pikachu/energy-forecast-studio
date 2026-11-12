import { useId, useRef } from 'react'

const NEXT_KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

// A radio group drawn as a pill switch. Arrow keys move the selection.
export function Segmented({ label, options, value, onChange, className = '' }) {
  const labelId = useId()
  const buttons = useRef([])
  const enabled = options.filter(option => !option.disabled)
  const hasChecked = enabled.some(option => option.value === value)

  const select = option => {
    if (!option || option.disabled) return
    buttons.current[options.indexOf(option)]?.focus()
    if (option.value !== value) onChange(option.value)
  }

  const onKeyDown = (event, option) => {
    const position = enabled.indexOf(option)
    if (event.key in NEXT_KEYS) {
      event.preventDefault()
      select(enabled[(position + NEXT_KEYS[event.key] + enabled.length) % enabled.length])
    } else if (event.key === 'Home') {
      event.preventDefault()
      select(enabled[0])
    } else if (event.key === 'End') {
      event.preventDefault()
      select(enabled.at(-1))
    }
  }

  return (
    <div className={`min-w-0 ${className}`}>
      {label ? <span id={labelId} className="mb-1.5 block text-label font-medium text-ink-2">{label}</span> : null}
      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        className="grid gap-1 rounded-control bg-surface-2 p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option, index) => {
          const checked = option.value === value
          const tabbable = checked || (!hasChecked && option === enabled[0])
          return (
            <button
              key={option.value}
              ref={element => { buttons.current[index] = element }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={tabbable ? 0 : -1}
              disabled={option.disabled}
              onClick={() => select(option)}
              onKeyDown={event => onKeyDown(event, option)}
              className={`h-9 truncate rounded-full px-2 text-label font-medium motion-safe:transition-colors disabled:text-ink-3/60 ${checked ? 'bg-forest text-canvas' : 'text-ink-2 enabled:hover:text-ink'}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
