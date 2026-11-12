import { useEffect, useMemo, useRef, useState } from 'react'

const HEIGHT = 318
const TOP = 22
const BOTTOM = 48
const LEFT = 62
const RIGHT = 20

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

function shortTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', hour12: false })
}

function line(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
}

export default function ForecastChart({ history = [], forecast = [], actual = [] }) {
  const container = useRef(null)
  const [width, setWidth] = useState(760)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    if (!container.current) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  const rows = useMemo(() => {
    const map = new Map()
    history.slice(-48).forEach(item => map.set(item.timestamp, { timestamp: item.timestamp, observed: Number(item.building_power) }))
    forecast.forEach(item => map.set(item.timestamp, { ...(map.get(item.timestamp) || { timestamp: item.timestamp }), forecast: Number(item.forecast) }))
    actual.forEach(item => map.set(item.timestamp, { ...(map.get(item.timestamp) || { timestamp: item.timestamp }), actual: Number(item.actual) }))
    return [...map.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }, [history, forecast, actual])

  const values = rows.flatMap(row => [row.observed, row.forecast, row.actual]).filter(Number.isFinite)
  const rawMin = values.length ? Math.min(...values) : 0
  const rawMax = values.length ? Math.max(...values) : 1
  const spread = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.12, 1)
  const minY = rawMin < 0 ? rawMin - spread * 0.18 : Math.max(0, rawMin - spread * 0.18)
  const maxY = rawMax + spread * 0.18
  const plotWidth = Math.max(1, width - LEFT - RIGHT)
  const plotHeight = HEIGHT - TOP - BOTTOM
  const xAt = index => LEFT + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * plotWidth)
  const yAt = value => TOP + ((maxY - value) / (maxY - minY || 1)) * plotHeight

  const observed = rows.map((row, index) => Number.isFinite(row.observed) ? [xAt(index), yAt(row.observed)] : null).filter(Boolean)
  const boundary = observed.at(-1)
  const predicted = rows.map((row, index) => Number.isFinite(row.forecast) ? [xAt(index), yAt(row.forecast)] : null).filter(Boolean)
  const reference = rows.map((row, index) => Number.isFinite(row.actual) ? [xAt(index), yAt(row.actual)] : null).filter(Boolean)
  const forecastPath = boundary && predicted.length ? [boundary, ...predicted] : predicted
  const actualPath = boundary && reference.length ? [boundary, ...reference] : reference
  const forecastArea = forecastPath.length > 1
    ? `${line(forecastPath)} L ${forecastPath.at(-1)[0].toFixed(1)} ${yAt(minY).toFixed(1)} L ${forecastPath[0][0].toFixed(1)} ${yAt(minY).toFixed(1)} Z`
    : ''
  const tickIndexes = rows.length > 1 ? [...new Set([0, Math.floor((rows.length - 1) / 3), Math.floor(2 * (rows.length - 1) / 3), rows.length - 1])] : [0]
  const active = hovered === null ? null : rows[hovered]

  return (
    <div ref={container} className="relative w-full select-none">
      <svg
        className="block w-full"
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label="Observed building load, forecast, and actual future values over time"
        onMouseMove={event => {
          if (!rows.length) return
          const rect = event.currentTarget.getBoundingClientRect()
          const point = Math.max(0, Math.min(1, (event.clientX - rect.left - LEFT) / plotWidth))
          setHovered(Math.round(point * (rows.length - 1)))
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e766a" stopOpacity=".17" />
            <stop offset="100%" stopColor="#0e766a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map(i => {
          const value = minY + ((maxY - minY) * i) / 4
          const y = yAt(value)
          return (
            <g key={i}>
              <line x1={LEFT} x2={width - RIGHT} y1={y} y2={y} stroke="#e9eef0" strokeDasharray={i === 0 ? undefined : '4 5'} />
              <text x={LEFT - 12} y={y + 4} textAnchor="end" fill="#88969d" fontSize="11" fontWeight="500">{compact.format(value)}</text>
            </g>
          )
        })}
        {tickIndexes.map(index => (
          <text key={index} x={xAt(index)} y={HEIGHT - 16} textAnchor={index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'} fill="#88969d" fontSize="11" fontWeight="500">
            {shortTime(rows[index]?.timestamp)}
          </text>
        ))}
        {forecastArea && <path d={forecastArea} fill="url(#forecastFill)" />}
        {observed.length > 1 && <path d={line(observed)} fill="none" stroke="#899ca6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {actualPath.length > 1 && <path d={line(actualPath)} fill="none" stroke="#db9c4a" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />}
        {forecastPath.length > 1 && <path d={line(forecastPath)} fill="none" stroke="#0e766a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />}
        {active && (
          <g>
            <line x1={xAt(hovered)} x2={xAt(hovered)} y1={TOP} y2={HEIGHT - BOTTOM} stroke="#b8c8cc" strokeDasharray="4 4" />
            {[['observed', '#899ca6'], ['forecast', '#0e766a'], ['actual', '#db9c4a']].map(([key, color]) => Number.isFinite(active[key]) && (
              <circle key={key} cx={xAt(hovered)} cy={yAt(active[key])} r="5" fill="white" stroke={color} strokeWidth="2.5" />
            ))}
          </g>
        )}
      </svg>
      {active && (
        <div className="pointer-events-none absolute top-3 z-20 rounded-xl border border-[#e1e8e8] bg-white/95 px-3 py-2.5 shadow-float backdrop-blur-sm" style={{ left: Math.min(Math.max(xAt(hovered) + 12, 10), Math.max(10, width - 180)) }}>
          <div className="mb-1.5 text-[11px] font-semibold text-[#829198]">{shortTime(active.timestamp)}</div>
          {[['Observed', active.observed, '#899ca6'], ['Forecast', active.forecast, '#0e766a'], ['Actual', active.actual, '#db9c4a']].filter(([, value]) => Number.isFinite(value)).map(([label, value, color]) => (
            <div className="flex min-w-32 items-center justify-between gap-4 text-xs" key={label}>
              <span className="flex items-center gap-1.5 text-[#62727a]"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>
              <strong className="font-semibold tabular-nums text-[#25343a]">{Math.round(value).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
