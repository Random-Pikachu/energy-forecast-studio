import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, ArrowRight, ArrowUpRight, CalendarDays, Check,
  ChevronDown, Clock3, Database, Download, FileText, Info, Layers,
  Loader2, Pencil, RotateCcw, Sparkles, Upload, Zap,
} from 'lucide-react'
import ForecastChart from './ForecastChart.jsx'

const FAMILY = {
  ct: { name: 'CNN–Transformer', short: 'Transformer', description: 'Multi-scale + attention', icon: Sparkles },
  gru: { name: 'CNN–GRU', short: 'GRU', description: 'Convolution + recurrent', icon: Activity },
  lstm: { name: 'CNN–LSTM', short: 'LSTM', description: 'Convolution + memory', icon: Layers },
}
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

async function requestJSON(path, options = {}) {
  const response = await fetch(path, options)
  let body
  try { body = await response.json() } catch { throw new Error('The forecast server did not return JSON.') }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`)
  return body
}

function prettyTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function monthYear(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', { month: 'short', year: 'numeric' })
}

function SectionHeading({ step, title, description }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="step-number">{step}</span>
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-.02em] text-ink">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p>
      </div>
    </div>
  )
}

function SelectField({ id, label, value, options, onChange, suffix = 'hours' }) {
  return (
    <label htmlFor={id} className="block min-w-0 flex-1">
      <span className="field-label">{label}</span>
      <span className="relative block">
        <select id={id} className="field-control appearance-none pr-9" value={value} onChange={event => onChange(Number(event.target.value))}>
          {options.map(option => <option key={option} value={option}>{option} {suffix}</option>)}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#809097]" />
      </span>
    </label>
  )
}

function Metric({ label, value, sub, icon: Icon, accent = false }) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent ? 'bg-[#e1f3ed] text-brand' : 'bg-[#f0f3f4] text-[#71818a]'}`}><Icon size={16} strokeWidth={1.9} /></span>
      </div>
      <div className="mt-2 text-[25px] font-semibold tracking-[-.055em] tabular-nums text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-[#8a999f]">{sub}</div>
    </div>
  )
}

function downloadForecast(result) {
  const actual = new Map((result.actual || []).map(row => [row.timestamp, row.actual]))
  const lines = ['timestamp,forecast,actual', ...result.forecast.map(row => `${row.timestamp},${row.forecast},${actual.get(row.timestamp) ?? ''}`)]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `forecast_${result.modelId}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [mode, setMode] = useState('historical')
  const [date, setDate] = useState('')
  const [hour, setHour] = useState('')
  const [history, setHistory] = useState([])
  const [originalHistory, setOriginalHistory] = useState([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [csvFile, setCsvFile] = useState(null)
  const [csvText, setCsvText] = useState('')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    requestJSON('/api/catalog').then(data => {
      if (!live) return
      setCatalog(data)
      const preferred = data.models.find(model => model.family === 'ct' && model.lookback === 24 && model.horizon === 24) || data.models[0]
      if (preferred) {
        setSelectedId(preferred.id)
        setDate(preferred.lastAt.slice(0, 10))
        setHour(preferred.lastAt.slice(11, 13))
      }
    }).catch(reason => live && setCatalogError(reason.message))
    return () => { live = false }
  }, [])

  const models = catalog?.models || []
  const selected = models.find(model => model.id === selectedId)
  const family = selected?.family || 'ct'
  const familyModels = models.filter(model => model.family === family)
  const lookbacks = [...new Set(familyModels.map(model => model.lookback))].sort((a, b) => a - b)
  const horizons = [...new Set(familyModels.filter(model => model.lookback === selected?.lookback).map(model => model.horizon))].sort((a, b) => a - b)
  const epochs = familyModels.filter(model => model.lookback === selected?.lookback && model.horizon === selected?.horizon)
  const at = date && hour ? `${date}T${hour}:00:00` : ''
  const validHours = useMemo(() => selected && date
    ? HOURS.filter(value => {
      const stamp = `${date}T${value}:00:00`
      return stamp >= selected.firstAt && stamp <= selected.lastAt
    })
    : [], [selected, date])

  useEffect(() => {
    if (!selected) return
    if (!at || at < selected.firstAt || at > selected.lastAt) {
      const replacement = !at || at > selected.lastAt ? selected.lastAt : selected.firstAt
      setDate(replacement.slice(0, 10))
      setHour(replacement.slice(11, 13))
    }
  }, [selectedId, date, hour, at, selected])

  useEffect(() => {
    if (validHours.length && !validHours.includes(hour)) setHour(validHours.at(-1))
  }, [validHours, hour])

  useEffect(() => {
    setResult(null)
    setError('')
    setShowEditor(false)
    if (!selected || mode !== 'historical' || !at || at < selected.firstAt || at > selected.lastAt) return undefined
    const controller = new AbortController()
    setHistoryBusy(true)
    requestJSON(`/api/history?modelId=${encodeURIComponent(selected.id)}&at=${encodeURIComponent(at)}`, { signal: controller.signal })
      .then(data => {
        setHistory(data.history)
        setOriginalHistory(data.history)
      })
      .catch(reason => { if (reason.name !== 'AbortError') setError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setHistoryBusy(false) })
    return () => controller.abort()
  }, [selectedId, at, mode])

  const chooseFamily = nextFamily => {
    const options = models.filter(model => model.family === nextFamily)
    const matching = options.find(model => model.lookback === selected?.lookback && model.horizon === selected?.horizon)
    const preferred = options.find(model => model.lookback === 24 && model.horizon === 24 && (model.epochs === 60 || model.epochs === undefined))
    if (options.length) setSelectedId((matching || preferred || options[0]).id)
  }
  const chooseLookback = lookback => {
    const options = familyModels.filter(model => model.lookback === lookback)
    setSelectedId((options.find(model => model.horizon === selected.horizon && model.epochs === selected.epochs) || options.find(model => model.horizon === 24) || options[0]).id)
  }
  const chooseHorizon = horizon => {
    const options = familyModels.filter(model => model.lookback === selected.lookback && model.horizon === horizon)
    setSelectedId((options.find(model => model.epochs === selected.epochs) || options.find(model => model.epochs === 60) || options[0]).id)
  }

  const runForecast = async () => {
    if (!selected || running) return
    setRunning(true)
    setError('')
    try {
      const body = mode === 'historical'
        ? { modelId: selected.id, mode, at, ...(showEditor ? { history } : {}) }
        : { modelId: selected.id, mode: 'upload', csvText }
      const data = await requestJSON('/api/forecast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setResult(data)
    } catch (reason) {
      setError(reason.message)
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  const onFile = async file => {
    setResult(null)
    setError('')
    if (!file) { setCsvFile(null); setCsvText(''); return }
    if (file.size > 2_000_000) { setCsvFile(null); setCsvText(''); setError('Choose a CSV smaller than 2 MB.'); return }
    setCsvFile(file)
    setCsvText(await file.text())
  }

  const chartHistory = result?.history || (mode === 'historical' ? history : [])
  const forecast = result?.forecast || []
  const actual = result?.actual || []
  const averageForecast = forecast.length ? forecast.reduce((sum, row) => sum + row.forecast, 0) / forecast.length : null

  return (
    <div className="min-h-screen bg-[#f5f7f8] text-ink">
      <header className="border-b border-[#e6ecee] bg-white/95">
        <div className="mx-auto flex h-[74px] max-w-[1500px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0b6c61] text-white shadow-[0_6px_14px_rgba(14,118,106,.20)]"><Zap size={20} fill="currentColor" strokeWidth={1.6} /></span>
            <div>
              <div className="text-[15px] font-bold tracking-[-.025em]">Energy Forecast Studio</div>
              <div className="text-[11px] font-medium text-[#89979d]">Building load intelligence</div>
            </div>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <span className="header-chip"><span className="h-1.5 w-1.5 rounded-full bg-[#29a980]" /> Local workspace</span>
            <span className="header-chip"><Database size={14} /> CU-BEMS dataset</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 pb-14 pt-9 sm:px-8 lg:px-10 lg:pt-11">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-brand"><span className="h-px w-5 bg-brand" /> Forecast workspace</div>
            <h1 className="max-w-[760px] text-[31px] font-semibold leading-[1.15] tracking-[-.055em] text-[#15262a] sm:text-[40px]">See what the next hours could look like.</h1>
            <p className="mt-3 max-w-[650px] text-sm leading-6 text-[#718087]">Choose a trained model, set your input window, and explore projected building power with the actual readings alongside it.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <span className="summary-pill"><Layers size={14} /> {catalog?.usableConfigurations ?? '—'} configurations</span>
            <span className="summary-pill"><Clock3 size={14} /> Hourly forecasts</span>
          </div>
        </div>

        {catalogError && <div role="alert" className="mb-6 flex items-start gap-2 rounded-xl border border-[#f4d6cf] bg-[#fff3f0] p-4 text-sm text-[#a33e2e]"><AlertCircle size={18} className="shrink-0" /> Could not connect to the prediction server: {catalogError}</div>}

        <div className="grid items-start gap-6 xl:grid-cols-[395px_minmax(0,1fr)]">
          <section className="panel-card overflow-hidden">
            <div className="border-b border-line px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-semibold tracking-[-.02em]">Build your forecast</div>
                <span className="rounded-full border border-[#dbe9e3] bg-[#eff8f4] px-2.5 py-1 text-[10px] font-semibold text-brand">3 simple steps</span>
              </div>
              <div className="mt-1 text-xs text-muted">Make a selection, then run the model.</div>
            </div>

            <div className="p-6">
              <SectionHeading step="01" title="Choose a model" description="Pick the architecture and forecast length." />
              <div className="grid grid-cols-3 gap-2" aria-label="Model family">
                {Object.entries(FAMILY).map(([key, item]) => {
                  const Icon = item.icon
                  return <button type="button" key={key} className={`model-tile ${family === key ? 'model-tile-active' : ''}`} onClick={() => chooseFamily(key)} disabled={!models.some(model => model.family === key)} aria-pressed={family === key}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.short}</span>
                  </button>
                })}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-[#86959a]"><Info size={13} /> {FAMILY[family].description}</div>
              <div className="mt-5 flex gap-3">
                <SelectField id="lookback" label="Past readings" value={selected?.lookback || ''} options={lookbacks} onChange={chooseLookback} />
                <SelectField id="horizon" label="Predict ahead" value={selected?.horizon || ''} options={horizons} onChange={chooseHorizon} />
              </div>
              {epochs.length > 1 && (
                <div className="mt-4">
                  <span className="field-label">Training run</span>
                  <div className="flex gap-2">
                    {epochs.map(option => <button key={option.id} type="button" onClick={() => setSelectedId(option.id)} className={`small-choice ${selectedId === option.id ? 'small-choice-active' : ''}`}>{option.epochs} epochs</button>)}
                  </div>
                </div>
              )}
              {selected && <div className="mt-5 flex items-center gap-2 rounded-xl border border-[#e2efea] bg-[#f4faf7] px-3 py-2.5 text-xs text-[#376c62]"><Check size={15} className="shrink-0" /><span><strong>{selected.lookback} hours</strong> of history → <strong>{selected.horizon} hours</strong> forecast</span></div>}

              <div className="my-7 h-px bg-line" />
              <SectionHeading step="02" title="Select input data" description="Replay a real date or bring your own readings." />
              <div className="mode-switch" role="tablist" aria-label="Input mode">
                <button type="button" role="tab" aria-selected={mode === 'historical'} className={mode === 'historical' ? 'mode-active' : ''} onClick={() => setMode('historical')}><CalendarDays size={15} /> Explore history</button>
                <button type="button" role="tab" aria-selected={mode === 'upload'} className={mode === 'upload' ? 'mode-active' : ''} onClick={() => setMode('upload')}><Upload size={15} /> Upload CSV</button>
              </div>

              {mode === 'historical' ? (
                <div className="mt-5">
                  <div className="flex gap-3">
                    <label className="block min-w-0 flex-[1.3]" htmlFor="forecast-date"><span className="field-label">Last observed date</span><span className="relative block"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#819096]" /><input id="forecast-date" type="date" className="field-control pl-9" min={selected?.firstAt.slice(0, 10)} max={selected?.lastAt.slice(0, 10)} value={date} onChange={event => setDate(event.target.value)} /></span></label>
                    <label className="block min-w-0 flex-1" htmlFor="forecast-hour"><span className="field-label">Hour</span><span className="relative block"><select id="forecast-hour" className="field-control appearance-none pr-8" value={hour} onChange={event => setHour(event.target.value)}>{validHours.map(value => <option key={value} value={value}>{value}:00</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#819096]" /></span></label>
                  </div>
                  {selected && <div className="mt-2 text-[11px] text-[#8b999e]">Available from {monthYear(selected.firstAt)} to {monthYear(selected.lastAt)} · includes 2018</div>}
                  <div className="mt-5 rounded-xl border border-[#e7ecee] bg-[#fafcfc] p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#34454b]"><Database size={15} className="text-brand" /> Input window</div>
                      <span className="text-[11px] text-[#86949b]">{historyBusy ? 'Loading…' : `${history.length} readings`}</span>
                    </div>
                    <div className="mt-2 text-[11px] leading-5 text-[#7d8d93]">{history.length ? `${prettyTime(history[0].timestamp)} → ${prettyTime(history.at(-1).timestamp)}` : 'Select an hour to load past readings.'}</div>
                    <button type="button" className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-brand hover:text-brandDark" onClick={() => setShowEditor(value => !value)} disabled={!history.length}><Pencil size={12} /> {showEditor ? 'Hide editor' : 'Adjust past readings'}</button>
                  </div>
                  {showEditor && history.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-line">
                      <div className="flex items-center justify-between border-b border-line bg-[#fafbfb] px-3 py-2"><span className="text-[11px] font-semibold text-[#4e626a]">Past hourly load</span><button type="button" onClick={() => { setHistory(originalHistory.map(row => ({ ...row }))); setResult(null) }} className="flex items-center gap-1 text-[11px] font-medium text-brand"><RotateCcw size={12} /> Reset</button></div>
                      <div className="max-h-56 overflow-y-auto">
                        {history.map((row, index) => <div className="editor-row" key={row.timestamp}><span>{prettyTime(row.timestamp)}</span><input aria-label={`Load at ${prettyTime(row.timestamp)}`} type="number" step="any" value={row.building_power} onChange={event => { setResult(null); setHistory(previous => previous.map((item, position) => position === index ? { ...item, building_power: event.target.value } : item)) }} /></div>)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-5">
                  <label className="upload-zone" htmlFor="csv-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); onFile(event.dataTransfer.files?.[0]) }}><Upload size={21} strokeWidth={1.7} /><strong>{csvFile ? csvFile.name : 'Choose an hourly CSV file'}</strong><span>{csvFile ? `${Math.ceil(csvFile.size / 1024)} KB selected` : 'or drop one here · max 2 MB'}</span><input id="csv-upload" className="sr-only" type="file" accept=".csv,text/csv" onChange={event => onFile(event.target.files?.[0])} /></label>
                  <div className="mt-3 rounded-lg bg-[#f6f8f9] px-3 py-2.5 text-[11px] leading-5 text-[#7b8b92]"><strong className="text-[#53666d]">Required columns:</strong> timestamp, building_power. The last {selected?.lookback || '—'} consecutive hours are used.</div>
                </div>
              )}

              <div className="my-7 h-px bg-line" />
              <SectionHeading step="03" title="Generate forecast" description="Your selected model runs on the input above." />
              <button type="button" className="run-button" onClick={runForecast} disabled={running || !selected || (mode === 'historical' ? historyBusy || history.length !== selected.lookback : !csvText)}>{running ? <Loader2 size={17} className="animate-spin" /> : <Zap size={17} fill="currentColor" />} {running ? 'Running model…' : 'Generate forecast'} {!running && <ArrowRight size={17} className="ml-auto" />}</button>
              <p className="mt-3 text-center text-[11px] text-[#93a0a5]">Runs locally · one model loaded at a time</p>
            </div>
          </section>

          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Metric icon={Database} label="Dataset coverage" value={catalog ? '2018–2019' : '—'} sub={catalog ? `${monthYear(catalog.datasetStart)} to ${monthYear(catalog.datasetEnd)} · ${number.format(catalog.datasetRows)} readings` : 'Loading dataset'} />
              <Metric icon={Clock3} label="Forecast window" value={selected ? `${selected.horizon} hours` : '—'} sub={selected ? `From ${selected.lookback} hours of history` : 'Choose a model'} accent />
              <Metric icon={Activity} label={result ? 'Next predicted load' : 'Ready to forecast'} value={result ? number.format(result.forecast[0].forecast) : 'Set inputs'} sub={result ? 'Source dataset units' : 'Select date and run model'} />
            </div>

            <section className="panel-card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-5 sm:px-7">
                <div><div className="flex items-center gap-2 text-[16px] font-semibold tracking-[-.025em]"><Activity size={18} className="text-brand" /> Load forecast</div><p className="mt-1 text-xs text-muted">Latest {Math.min(selected?.lookback || 48, 48)} observed hours and the next {selected?.horizon ?? '—'} projected hours.</p></div>
                <span className={`status-chip ${result ? 'status-ready' : ''}`}><span className="h-1.5 w-1.5 rounded-full bg-current" /> {result ? 'Forecast ready' : historyBusy ? 'Loading history' : 'Awaiting forecast'}</span>
              </div>
              <div className="px-3 pb-4 pt-5 sm:px-6">
                {chartHistory.length ? <ForecastChart history={chartHistory} forecast={forecast} actual={actual} /> : <div className="flex h-[318px] items-center justify-center text-sm text-[#9aa8ad]">{mode === 'upload' ? 'Upload a CSV and run the model to see your chart.' : 'Loading the selected history…'}</div>}
                <div className="ml-3 mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#edf0f2] px-2 pt-4 text-[11px] font-medium text-[#708087] sm:ml-9"><span className="legend-item"><i className="bg-[#899ca6]" /> Observed history</span><span className="legend-item"><i className="bg-brand" /> Model forecast</span>{result?.actual && <span className="legend-item"><i className="bg-[#db9c4a]" /> Actual future</span>}</div>
              </div>
            </section>

            {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#f2d5cd] bg-[#fff4f1] p-4 text-sm text-[#a14231]"><AlertCircle size={18} className="mt-0.5 shrink-0" /> {error}</div>}
            {result?.hasNegativeForecast && <div className="flex items-start gap-2 rounded-xl border border-[#f5dfb4] bg-[#fff9eb] p-4 text-xs leading-5 text-[#9e6a20]"><Info size={16} className="mt-0.5 shrink-0" /> This checkpoint produced negative load values. They are shown as generated.</div>}

            {result ? (
              <section className="panel-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5 sm:px-7"><div><h2 className="text-[16px] font-semibold tracking-[-.025em]">Forecast breakdown</h2><p className="mt-1 text-xs text-muted">Hourly values from your selected model.</p></div><button type="button" className="secondary-button" onClick={() => downloadForecast(result)}><Download size={15} /> Export CSV</button></div>
                <div className="grid gap-3 px-6 pt-5 sm:grid-cols-3 sm:px-7"><Metric icon={ArrowUpRight} label="Peak forecast" value={number.format(Math.max(...forecast.map(row => row.forecast)))} sub="Highest projected hour" accent /><Metric icon={Activity} label="Average forecast" value={number.format(averageForecast)} sub="Across selected horizon" />{result.metrics ? <Metric icon={Check} label="MAE vs actual" value={number.format(result.metrics.mae)} sub={`RMSE ${number.format(result.metrics.rmse)}`} /> : <Metric icon={FileText} label="Forecast points" value={forecast.length} sub="No actual readings supplied" />}</div>
                <div className="mx-6 mb-6 mt-5 overflow-hidden rounded-xl border border-line sm:mx-7"><div className="grid grid-cols-[1.4fr_1fr_1fr] bg-[#f9fbfb] px-4 py-3 text-[10px] font-semibold uppercase tracking-[.11em] text-[#88979d]"><span>Hour</span><span className="text-right">Forecast</span><span className="text-right">Actual</span></div><div className="max-h-[340px] overflow-y-auto">{forecast.map((row, index) => <div key={row.timestamp} className="grid grid-cols-[1.4fr_1fr_1fr] border-t border-[#eef1f2] px-4 py-2.5 text-xs"><span className="text-[#62747b]">{prettyTime(row.timestamp)}</span><strong className="text-right font-semibold tabular-nums text-brand">{number.format(row.forecast)}</strong><span className="text-right tabular-nums text-[#52636b]">{result.actual ? number.format(result.actual[index].actual) : '—'}</span></div>)}</div></div>
              </section>
            ) : (
              <section className="panel-card flex min-h-[172px] items-center gap-5 px-6 py-6 sm:px-7"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#e8f4ef] text-brand"><TrendingUpIcon /></div><div><h2 className="text-sm font-semibold">Your results will appear here</h2><p className="mt-1 max-w-[430px] text-xs leading-5 text-muted">The chart will show your forecast next to the real readings. You’ll also get the hourly values and a CSV download.</p></div></section>
            )}
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-[#e7ecee] pt-5 text-[11px] text-[#93a0a5]"><span>Energy Forecast Studio · College BTP project</span><span>Predictions use source dataset power units · No energy conversion applied</span></div>
      </main>
    </div>
  )
}

function TrendingUpIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>
}
