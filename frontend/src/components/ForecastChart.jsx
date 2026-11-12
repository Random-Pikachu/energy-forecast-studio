import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { niceTicks, timeTicks } from '../chartScale.js'
import { compact, longTime, number, shortTime, signed } from '../format.js'
import { Skeleton } from './ui/index.jsx'

const PAD = { top: 28, right: 12, bottom: 32, left: 44 }
const VISIBLE_HISTORY = 48

const SERIES = {
  observed: { label: 'Observed', stroke: 'stroke-observed', width: 2 },
  forecast: { label: 'Forecast', stroke: 'stroke-forest', width: 2.5 },
  actual: { label: 'Actual', stroke: 'stroke-actual', width: 2, dash: '5 4' },
}

function path(points) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
}

function LineKey({ series }) {
  const { stroke, width, dash } = SERIES[series]
  return (
    <svg width="20" height="8" aria-hidden="true" className="shrink-0">
      <line x1="1" x2="19" y1="4" y2="4" className={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  )
}

export default function ForecastChart({ history = [], forecast = [], actual = [], loading = false, emptyMessage = '' }) {
  const container = useRef(null)
  const summaryId = useId()
  const [width, setWidth] = useState(760)
  const [active, setActive] = useState(null)

  useEffect(() => {
    if (!container.current) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  const height = width < 560 ? 280 : 360
  const hiddenHistory = Math.max(0, history.length - VISIBLE_HISTORY)

  const rows = useMemo(() => {
    const map = new Map()
    const add = (timestamp, key, value) => map.set(timestamp, { ...(map.get(timestamp) || { timestamp }), [key]: Number(value) })
    history.slice(-VISIBLE_HISTORY).forEach(item => add(item.timestamp, 'observed', item.building_power))
    forecast.forEach(item => add(item.timestamp, 'forecast', item.forecast))
    ;(actual || []).forEach(item => add(item.timestamp, 'actual', item.actual))
    return [...map.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }, [history, forecast, actual])

  useEffect(() => setActive(null), [rows])

  const values = rows.flatMap(row => [row.observed, row.forecast, row.actual]).filter(Number.isFinite)
  const y = niceTicks(Math.min(...values), Math.max(...values))
  const plotWidth = Math.max(1, width - PAD.left - PAD.right)
  const plotBottom = height - PAD.bottom
  const plotHeight = plotBottom - PAD.top
  const xAt = index => PAD.left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth)
  const yAt = value => PAD.top + ((y.max - value) / (y.max - y.min || 1)) * plotHeight

  const boundaryIndex = rows.findLastIndex(row => Number.isFinite(row.observed))
  const hasFuture = boundaryIndex >= 0 && rows.slice(boundaryIndex + 1).some(row => Number.isFinite(row.forecast) || Number.isFinite(row.actual))
  const boundaryX = boundaryIndex >= 0 ? xAt(boundaryIndex) : PAD.left

  const pointsFor = key => rows.map((row, index) => (Number.isFinite(row[key]) ? [xAt(index), yAt(row[key])] : null)).filter(Boolean)
  const observedPoints = pointsFor('observed')
  const anchor = boundaryIndex >= 0 ? observedPoints.at(-1) : null
  const withAnchor = points => (anchor && points.length ? [anchor, ...points] : points)
  const forecastPoints = withAnchor(pointsFor('forecast'))
  const actualPoints = withAnchor(pointsFor('actual'))

  const xTicks = timeTicks(rows, xAt, { left: PAD.left, right: width - PAD.right, boundaryIndex: hasFuture ? boundaryIndex : -1 })
  const activeRow = active === null ? null : rows[active]
  const hasActual = rows.some(row => Number.isFinite(row.actual))

  const indexFromPointer = event => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - PAD.left) / plotWidth))
    return Math.round(ratio * (rows.length - 1))
  }
  const onPointer = event => {
    if (rows.length) setActive(indexFromPointer(event))
  }
  const onKeyDown = event => {
    if (!rows.length) return
    const last = rows.length - 1
    const current = active ?? boundaryIndex
    const moves = {
      ArrowRight: Math.min(last, current + 1),
      ArrowLeft: Math.max(0, current - 1),
      Home: 0,
      End: last,
    }
    if (event.key in moves) {
      event.preventDefault()
      setActive(moves[event.key])
    } else if (event.key === 'Escape') {
      setActive(null)
    }
  }

  const tooltipRows = activeRow
    ? [
        ['observed', activeRow.observed],
        ['forecast', activeRow.forecast],
        ['actual', activeRow.actual],
      ].filter(([, value]) => Number.isFinite(value))
    : []
  const activeError = activeRow && Number.isFinite(activeRow.forecast) && Number.isFinite(activeRow.actual)
    ? activeRow.forecast - activeRow.actual
    : null
  const TOOLTIP_WIDTH = 196
  const activeX = active === null ? 0 : xAt(active)
  const tooltipLeft = activeX + 12 + TOOLTIP_WIDTH > width ? Math.max(0, activeX - 12 - TOOLTIP_WIDTH) : activeX + 12

  const peak = forecast.length ? forecast.reduce((best, row) => (row.forecast > best.forecast ? row : best)) : null
  const summary = rows.length
    ? [
        history.length ? `Observed load from ${longTime(history[0].timestamp)} to ${longTime(history.at(-1).timestamp)}.` : '',
        peak ? `The ${forecast.length}-hour forecast peaks at ${number.format(peak.forecast)} at ${longTime(peak.timestamp)}.` : 'No forecast yet.',
      ].join(' ')
    : ''

  let body
  if (loading) {
    body = <Skeleton style={{ height }} />
  } else if (!rows.length) {
    body = (
      <div style={{ height }} className="flex items-center justify-center rounded-control bg-surface px-6 text-center text-body text-ink-3">
        {emptyMessage}
      </div>
    )
  } else {
    body = (
      <div
        tabIndex={0}
        role="group"
        aria-label="Load chart. Use the left and right arrow keys to read hourly values."
        aria-describedby={summaryId}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        className="relative rounded-control"
      >
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          className="block touch-pan-y select-none"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null) }}
        >
          {hasFuture ? (
            <>
              <rect x={boundaryX} y={4} width={Math.max(0, width - PAD.right - boundaryX)} height={plotBottom - 4} className="fill-lime" fillOpacity={0.22} />
              <text x={boundaryX + 8} y={20} fontSize="13" fontWeight="500" className="fill-forest">Forecast</text>
              {boundaryX - PAD.left > 72 ? <text x={PAD.left} y={20} fontSize="13" className="fill-ink-3">Observed</text> : null}
            </>
          ) : null}

          {y.ticks.map(value => (
            <g key={value}>
              <line x1={PAD.left} x2={width - PAD.right} y1={yAt(value)} y2={yAt(value)} className="stroke-line" strokeWidth="1" />
              <text x={PAD.left - 8} y={yAt(value) + 4} textAnchor="end" fontSize="13" className="fill-ink-3 tabular-nums">{compact.format(value)}</text>
            </g>
          ))}

          {xTicks.map(tick => (
            <text
              key={tick.index}
              x={tick.x}
              y={height - 10}
              textAnchor="middle"
              fontSize="13"
              fontWeight={tick.emphasis ? 500 : 400}
              className={`tabular-nums ${tick.emphasis ? 'fill-forest' : 'fill-ink-3'}`}
            >
              {tick.label}
            </text>
          ))}

          {hasFuture ? <line x1={boundaryX} x2={boundaryX} y1={4} y2={plotBottom} className="stroke-forest" strokeWidth="1" /> : null}

          {[['observed', observedPoints], ['actual', actualPoints], ['forecast', forecastPoints]].map(([key, points]) => (
            points.length > 1 ? (
              <path
                key={key}
                d={path(points)}
                fill="none"
                className={SERIES[key].stroke}
                strokeWidth={SERIES[key].width}
                strokeDasharray={SERIES[key].dash}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null
          ))}

          {activeRow ? (
            <g>
              <line x1={activeX} x2={activeX} y1={PAD.top} y2={plotBottom} className="stroke-ink-3" strokeWidth="1" />
              {tooltipRows.map(([key, value]) => (
                <circle key={key} cx={activeX} cy={yAt(value)} r="4" className={`fill-canvas ${SERIES[key].stroke}`} strokeWidth="2" />
              ))}
            </g>
          ) : null}
        </svg>

        {activeRow ? (
          <div
            className="pointer-events-none absolute top-2 z-20 rounded-control border border-line bg-canvas p-3 shadow-tooltip"
            style={{ left: tooltipLeft, width: TOOLTIP_WIDTH }}
          >
            <div className="mb-2 text-label font-medium text-ink-2">{longTime(activeRow.timestamp)}</div>
            <dl className="space-y-1">
              {tooltipRows.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 text-body">
                  <dt className="flex items-center gap-2 text-ink-2"><LineKey series={key} />{SERIES[key].label}</dt>
                  <dd className="font-medium tabular-nums text-ink">{number.format(value)}</dd>
                </div>
              ))}
              {activeError !== null ? (
                <div className="flex items-center justify-between gap-3 border-t border-line pt-1 text-body">
                  <dt className="text-ink-2">Error</dt>
                  <dd className="font-medium tabular-nums text-ink">{signed(activeError)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {activeRow ? `${shortTime(activeRow.timestamp)}: ${tooltipRows.map(([key, value]) => `${SERIES[key].label} ${number.format(value)}`).join(', ')}` : ''}
        </p>
      </div>
    )
  }

  return (
    <div ref={container} className="w-full">
      <div className="mb-2 text-label text-ink-3">Load (dataset units)</div>
      {body}
      <p id={summaryId} className="sr-only">{summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-label text-ink-2">
        <span className="inline-flex items-center gap-2"><LineKey series="observed" />Observed</span>
        <span className="inline-flex items-center gap-2"><LineKey series="forecast" />Forecast</span>
        {hasActual ? <span className="inline-flex items-center gap-2"><LineKey series="actual" />Actual</span> : null}
        {hiddenHistory ? <span className="text-ink-3">Showing the last {VISIBLE_HISTORY} of {history.length} observed hours.</span> : null}
      </div>
    </div>
  )
}
