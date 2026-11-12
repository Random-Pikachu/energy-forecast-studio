import { useEffect, useMemo, useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import { requestJSON } from './api.js'
import { FAMILY, HOURS, buildCsv, formatHours, hourlyTimestamps, monthYear, parseReadings } from './format.js'
import ControlPanel from './components/ControlPanel.jsx'
import ForecastChart from './components/ForecastChart.jsx'
import ForecastTable from './components/ForecastTable.jsx'
import { isEditedReading, isInvalidReading } from './components/ReadingsEditor.jsx'
import ServerDown from './components/ServerDown.jsx'
import StatStrip from './components/StatStrip.jsx'
import { Panel, Skeleton } from './components/ui/index.jsx'

const EMPTY_CHART = {
  historical: 'Choose a date and hour to load readings.',
  manual: 'Enter at least two readings to preview them here.',
  upload: 'Choose a CSV file and generate a forecast to see the chart.',
}

export default function App() {
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [mode, setMode] = useState('historical')
  const [date, setDate] = useState('')
  const [hour, setHour] = useState('')
  const [history, setHistory] = useState([])
  const [originalHistory, setOriginalHistory] = useState([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [manualText, setManualText] = useState('')
  const [manualDate, setManualDate] = useState(`${new Date().getFullYear()}-01-01`)
  const [manualHour, setManualHour] = useState('00')
  const [csvFile, setCsvFile] = useState(null)
  const [csvText, setCsvText] = useState('')
  const [result, setResult] = useState(null)
  const [resultEdited, setResultEdited] = useState(false)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const chartSection = useRef(null)

  useEffect(() => {
    let live = true
    setCatalogError('')
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
  }, [catalogAttempt])

  const models = catalog?.models || []
  const selected = models.find(model => model.id === selectedId)
  const family = selected?.family || 'ct'
  const familyModels = models.filter(model => model.family === family)
  const lookbacks = [...new Set(familyModels.map(model => model.lookback))].sort((a, b) => a - b)
  const horizons = [...new Set(familyModels.filter(model => model.lookback === selected?.lookback).map(model => model.horizon))].sort((a, b) => a - b)
  const epochs = familyModels.filter(model => model.lookback === selected?.lookback && model.horizon === selected?.horizon)
  const at = date && hour ? `${date}T${hour}:00:00` : ''
  const validHours = useMemo(() => (selected && date
    ? HOURS.filter(value => {
      const stamp = `${date}T${value}:00:00`
      return stamp >= selected.firstAt && stamp <= selected.lastAt
    })
    : []), [selected, date])

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
    setRunError('')
    setShowEditor(false)
  }, [selectedId, at, mode])

  // History also feeds "Fill with sample readings", so it loads in every mode.
  useEffect(() => {
    if (!selected || !at || at < selected.firstAt || at > selected.lastAt) return undefined
    const controller = new AbortController()
    setHistoryBusy(true)
    setHistoryError('')
    requestJSON(`/api/history?modelId=${encodeURIComponent(selected.id)}&at=${encodeURIComponent(at)}`, { signal: controller.signal })
      .then(data => {
        setHistory(data.history)
        setOriginalHistory(data.history)
      })
      .catch(reason => {
        if (reason.name === 'AbortError') return
        setHistoryError(reason.message)
        setHistory([])
        setOriginalHistory([])
      })
      .finally(() => { if (!controller.signal.aborted) setHistoryBusy(false) })
    return () => controller.abort()
  }, [selectedId, at])

  const clearResult = () => {
    setResult(null)
    setRunError('')
  }

  const chooseFamily = nextFamily => {
    const options = models.filter(model => model.family === nextFamily)
    const matching = options.find(model => model.lookback === selected?.lookback && model.horizon === selected?.horizon)
    const preferred = options.find(model => model.lookback === 24 && model.horizon === 24 && (model.epochs === 60 || model.epochs == null))
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

  const editedCount = useMemo(
    () => history.filter((row, index) => isEditedReading(row, originalHistory[index])).length,
    [history, originalHistory],
  )
  const invalidCount = useMemo(() => history.filter(row => isInvalidReading(row.building_power)).length, [history])

  const manualParsed = useMemo(() => parseReadings(manualText), [manualText])
  const manualRows = useMemo(() => {
    if (manualParsed.error) return []
    const stamps = hourlyTimestamps(manualDate, manualHour, manualParsed.values.length)
    return stamps.map((timestamp, index) => ({ timestamp, building_power: manualParsed.values[index] }))
  }, [manualParsed, manualDate, manualHour])

  const onFile = async file => {
    clearResult()
    if (!file) { setCsvFile(null); setCsvText(''); return }
    if (file.size > 2_000_000) { setCsvFile(null); setCsvText(''); setRunError('Choose a CSV smaller than 2 MB.'); return }
    setCsvFile(file)
    setCsvText(await file.text())
  }

  let blocker = ''
  if (!selected) blocker = 'Loading models…'
  else if (mode === 'historical') {
    if (historyBusy) blocker = 'Loading readings…'
    else if (history.length !== selected.lookback) blocker = 'Choose a date and hour with enough readings.'
    else if (invalidCount) blocker = 'Fix the readings marked in red.'
  } else if (mode === 'manual') {
    const missing = selected.lookback - manualParsed.values.length
    if (manualParsed.error) blocker = 'Fix the readings above.'
    else if (missing > 0) blocker = `Enter ${missing} more ${missing === 1 ? 'reading' : 'readings'}.`
    else if (!manualRows.length) blocker = 'Choose a start date.'
  } else if (!csvText) blocker = 'Choose a CSV file first.'

  const runForecast = async () => {
    if (blocker || running) return
    setRunning(true)
    setRunError('')
    try {
      let body
      if (mode === 'historical') {
        const edits = editedCount ? { history: history.map(row => ({ ...row, building_power: Number(row.building_power) })) } : {}
        body = { modelId: selected.id, mode, at, ...edits }
      } else {
        body = { modelId: selected.id, mode: 'upload', csvText: mode === 'manual' ? buildCsv(manualRows) : csvText }
      }
      const data = await requestJSON('/api/forecast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setResult(data)
      setResultEdited(mode === 'historical' && editedCount > 0)
      if (window.matchMedia('(max-width: 1023px)').matches) {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        chartSection.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
      }
    } catch (reason) {
      setRunError(reason.message)
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  const previewHistory = { historical: history, manual: manualRows, upload: [] }[mode]
  const chartHistory = result?.history || previewHistory
  let status = 'Not run yet'
  if (running) status = 'Running model…'
  else if (result) status = resultEdited ? 'Forecast from edited readings' : 'Forecast ready'
  else if (mode === 'historical' && historyBusy) status = 'Loading readings…'

  const model = { models, selected, family, lookbacks, horizons, epochs, chooseFamily, chooseLookback, chooseHorizon, chooseModel: setSelectedId }
  const input = {
    mode, setMode, date, setDate, hour, setHour, validHours, history, historyBusy,
    editor: {
      open: showEditor,
      toggle: () => setShowEditor(value => !value),
      original: originalHistory,
      editedCount,
      change: (index, value) => {
        clearResult()
        setHistory(previous => previous.map((row, position) => (position === index ? { ...row, building_power: value } : row)))
      },
      reset: () => { clearResult(); setHistory(originalHistory.map(row => ({ ...row }))) },
    },
    manual: {
      text: manualText,
      setText: value => { clearResult(); setManualText(value) },
      parsed: manualParsed,
      date: manualDate,
      setDate: value => { clearResult(); setManualDate(value) },
      hour: manualHour,
      setHour: value => { clearResult(); setManualHour(value) },
      canFillSample: originalHistory.length > 0,
      fillSample: () => {
        clearResult()
        setManualText(originalHistory.map(row => Number(row.building_power).toFixed(1)).join('\n'))
        setManualDate(originalHistory[0].timestamp.slice(0, 10))
        setManualHour(originalHistory[0].timestamp.slice(11, 13))
      },
    },
    upload: { file: csvFile, onFile },
  }
  const action = { run: runForecast, running, blocker, error: runError || (mode === 'historical' ? historyError : '') }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-control bg-forest text-lime">
              <Zap size={20} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
            </span>
            <span className="text-title font-semibold">Energy Forecast Studio</span>
          </div>
          {catalog ? (
            <span className="hidden text-label text-ink-3 sm:block">
              Hourly building load, {monthYear(catalog.datasetStart)} to {monthYear(catalog.datasetEnd)}
            </span>
          ) : null}
        </div>
      </header>

      <main
        className="mx-auto max-w-[1280px] px-4 pt-6 sm:px-8 lg:pt-8"
        style={{ paddingBottom: 'calc(var(--action-bar, 0px) + 32px)' }}
      >
        {catalogError ? (
          <ServerDown message={catalogError} onRetry={() => setCatalogAttempt(value => value + 1)} />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            {selected ? (
              <ControlPanel model={model} input={input} action={action} className="order-3 lg:sticky lg:top-6 lg:order-first" />
            ) : (
              <Panel as="div" className="order-3 space-y-4 lg:order-first" aria-hidden="true">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-44" />
                <Skeleton className="h-44" />
              </Panel>
            )}

            <div className="contents lg:order-last lg:block lg:space-y-8">
              <section ref={chartSection} aria-labelledby="chart-title" className="order-1 scroll-mt-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <h1 id="chart-title" className="text-h2 font-semibold">Load forecast</h1>
                    <p className="text-body text-ink-2">
                      {selected ? `${FAMILY[selected.family].name}, ${formatHours(selected.lookback)} of history, next ${formatHours(selected.horizon)}` : 'Loading models…'}
                    </p>
                  </div>
                  <p aria-live="polite" className={`pt-1 text-label font-medium ${result ? 'text-forest' : 'text-ink-3'}`}>{status}</p>
                </div>
                <Panel variant="outlined">
                  <ForecastChart
                    history={chartHistory}
                    forecast={result?.forecast || []}
                    actual={result?.actual || []}
                    loading={!selected || (!result && mode === 'historical' && historyBusy)}
                    emptyMessage={EMPTY_CHART[mode]}
                  />
                </Panel>
              </section>

              <div className="order-2">
                <StatStrip result={result} edited={resultEdited} />
              </div>

              {result ? (
                <div className="order-4">
                  <ForecastTable result={result} />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
