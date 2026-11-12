import { number, shortTime } from '../format.js'
import { Notice, Stat } from './ui/index.jsx'

export default function StatStrip({ result, edited }) {
  const forecast = result?.forecast || []
  const peak = forecast.length ? forecast.reduce((best, row) => (row.forecast > best.forecast ? row : best)) : null
  const average = forecast.length ? forecast.reduce((sum, row) => sum + row.forecast, 0) / forecast.length : null
  const metrics = result?.metrics
  const errorDetail = label => (result ? (metrics ? label : 'needs actual readings') : '')

  return (
    <section aria-label="Forecast summary" className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5 sm:grid-cols-4">
        <Stat label="Peak" value={peak ? number.format(peak.forecast) : null} detail={peak ? shortTime(peak.timestamp) : ''} />
        <Stat label="Average" value={average === null ? null : number.format(average)} detail={result ? `over ${forecast.length} hours` : ''} />
        <Stat label="MAE" value={metrics ? number.format(metrics.mae) : null} detail={errorDetail('mean absolute error')} />
        <Stat label="RMSE" value={metrics ? number.format(metrics.rmse) : null} detail={errorDetail('root mean square error')} />
      </dl>
      {result?.hasNegativeForecast ? (
        <Notice tone="warning">This model produced negative load values. They are shown as generated.</Notice>
      ) : null}
      {result && edited ? (
        <Notice tone="warning">This forecast used edited readings, so the error figures compare against the original data.</Notice>
      ) : null}
    </section>
  )
}
