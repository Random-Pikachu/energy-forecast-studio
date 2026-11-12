import { useId } from 'react'

const LINE = 'M5 21l3.5-2.5 3 1.5 4-7 7 5.5 3.5-8'

// The app's chart in miniature: observed load on the dark side runs into the
// lime forecast zone and changes colour at the boundary.
// Keep in sync with public/favicon.svg.
export default function Logo({ size = 32, className = '' }) {
  const id = useId()
  const stroke = { fill: 'none', strokeWidth: 2.25, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={`shrink-0 ${className}`}>
      <defs>
        <clipPath id={`${id}-past`}><rect width="19" height="32" /></clipPath>
        <clipPath id={`${id}-next`}><rect x="19" width="13" height="32" /></clipPath>
      </defs>
      <rect width="32" height="32" rx="9" className="fill-forest" />
      <path d="M19 0h4a9 9 0 0 1 9 9v14a9 9 0 0 1-9 9h-4z" className="fill-lime" />
      <path d={LINE} clipPath={`url(#${id}-past)`} className="stroke-lime" {...stroke} />
      <path d={LINE} clipPath={`url(#${id}-next)`} className="stroke-forest" {...stroke} />
    </svg>
  )
}
