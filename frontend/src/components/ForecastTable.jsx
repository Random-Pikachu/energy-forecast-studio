import { useMemo } from 'react'
import { Download } from 'lucide-react'
import { number, shortTime, signed } from '../format.js'
import { Button } from './ui/index.jsx'

function exportCsv(result, rows, hasActual) {
  const header = hasActual ? 'timestamp,forecast,actual,error' : 'timestamp,forecast'
  const lines = rows.map(row => (hasActual
    ? `${row.timestamp},${row.forecast},${row.actual ?? ''},${row.error ?? ''}`
    : `${row.timestamp},${row.forecast}`))
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `forecast_${result.modelId}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

const HEAD = 'sticky top-0 z-10 bg-surface px-3 py-3 text-label font-medium text-ink-2 sm:px-4'

export default function ForecastTable({ result }) {
  const hasActual = Boolean(result.actual?.length)
  const rows = useMemo(() => {
    const actual = new Map((result.actual || []).map(row => [row.timestamp, row.actual]))
    return result.forecast.map(row => {
      const value = actual.get(row.timestamp)
      return { ...row, actual: value, error: Number.isFinite(value) ? row.forecast - value : undefined }
    })
  }, [result])

  return (
    <section aria-labelledby="table-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="table-title" className="text-h2 font-semibold">Hourly values</h2>
        <Button variant="secondary" icon={Download} onClick={() => exportCsv(result, rows, hasActual)}>Export CSV</Button>
      </div>
      <table className="w-full border-separate border-spacing-0 text-body tabular-nums">
        <caption className="sr-only">Hourly forecast{hasActual ? ', actual load, and error' : ''}</caption>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} rounded-l-control text-left`}>Time</th>
            <th scope="col" className={`${HEAD} text-right ${hasActual ? '' : 'rounded-r-control'}`}>Forecast</th>
            {hasActual ? <th scope="col" className={`${HEAD} text-right`}>Actual</th> : null}
            {hasActual ? <th scope="col" className={`${HEAD} rounded-r-control text-right`}>Error</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.timestamp}>
              <td className="h-11 border-b border-line px-3 text-ink-2 sm:px-4">{shortTime(row.timestamp)}</td>
              <td className="h-11 border-b border-line px-3 text-right font-medium text-ink sm:px-4">{number.format(row.forecast)}</td>
              {hasActual ? <td className="h-11 border-b border-line px-3 text-right text-ink sm:px-4">{Number.isFinite(row.actual) ? number.format(row.actual) : '—'}</td> : null}
              {hasActual ? <td className="h-11 border-b border-line px-3 text-right text-ink-2 sm:px-4">{signed(row.error)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
