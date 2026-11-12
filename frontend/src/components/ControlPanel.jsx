import { useEffect, useRef } from 'react'
import { FAMILY, formatHours, longDate, shortHours, shortTime } from '../format.js'
import ManualEntry from './ManualEntry.jsx'
import ReadingsEditor from './ReadingsEditor.jsx'
import UploadZone from './UploadZone.jsx'
import { Button, Field, Notice, Segmented } from './ui/index.jsx'

const MODES = [
  { value: 'historical', label: 'History' },
  { value: 'manual', label: 'Enter values' },
  { value: 'upload', label: 'Upload CSV' },
]

function Group({ title, children }) {
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="text-body font-semibold text-ink">{title}</legend>
      {children}
    </fieldset>
  )
}

// Publishes the mobile action bar's height so the page can pad below it.
function useActionBarHeight(ref) {
  useEffect(() => {
    const element = ref.current
    const desktop = window.matchMedia('(min-width: 1024px)')
    const root = document.documentElement
    const update = () => root.style.setProperty('--action-bar', desktop.matches ? '0px' : `${element.offsetHeight}px`)
    const observer = new ResizeObserver(update)
    observer.observe(element)
    desktop.addEventListener('change', update)
    update()
    return () => {
      observer.disconnect()
      desktop.removeEventListener('change', update)
      root.style.setProperty('--action-bar', '0px')
    }
  }, [ref])
}

export default function ControlPanel({ model, input, action, className = '' }) {
  const footer = useRef(null)
  useActionBarHeight(footer)
  const { models, selected, family, lookbacks, horizons, epochs, chooseFamily, chooseLookback, chooseHorizon, chooseModel } = model
  const { mode, setMode, date, setDate, hour, setHour, validHours, history, historyBusy, editor, manual, upload } = input

  return (
    <aside aria-label="Forecast settings" className={`rounded-panel bg-surface lg:flex lg:max-h-[calc(100vh-112px)] lg:flex-col ${className}`}>
      <div className="space-y-6 p-4 sm:p-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <h2 className="text-title font-semibold">Forecast settings</h2>

        <Group title="Model">
          <div>
            <Segmented
              label="Architecture"
              value={family}
              onChange={chooseFamily}
              options={Object.entries(FAMILY).map(([key, item]) => ({
                value: key,
                label: item.short,
                disabled: !models.some(option => option.family === key),
              }))}
            />
            <p className="mt-1.5 text-label text-ink-3">{FAMILY[family].name}: {FAMILY[family].description}</p>
          </div>
          <Segmented
            label="Past readings"
            value={selected.lookback}
            onChange={chooseLookback}
            options={lookbacks.map(value => ({ value, label: shortHours(value) }))}
          />
          <Field as="select" id="horizon" label="Predict ahead" value={selected.horizon} onChange={event => chooseHorizon(Number(event.target.value))}>
            {horizons.map(value => <option key={value} value={value}>{formatHours(value)}</option>)}
          </Field>
          {epochs.length > 1 ? (
            <Segmented
              label="Training run"
              value={selected.id}
              onChange={chooseModel}
              options={epochs.map(option => ({ value: option.id, label: `${option.epochs} epochs` }))}
            />
          ) : null}
        </Group>

        <Group title="Input data">
          <Segmented label="Source" value={mode} onChange={setMode} options={MODES} />

          {mode === 'historical' ? (
            <div className="space-y-4">
              <div>
                <div className="grid grid-cols-[3fr_2fr] gap-3">
                  <Field
                    id="forecast-date"
                    type="date"
                    label="Last observed date"
                    min={selected.firstAt.slice(0, 10)}
                    max={selected.lastAt.slice(0, 10)}
                    value={date}
                    onChange={event => setDate(event.target.value)}
                    aria-describedby="range-helper"
                  />
                  <Field as="select" id="forecast-hour" label="Hour" value={hour} onChange={event => setHour(event.target.value)}>
                    {validHours.map(value => <option key={value} value={value}>{value}:00</option>)}
                  </Field>
                </div>
                <p id="range-helper" className="mt-1.5 text-label text-ink-3">
                  Data runs from {longDate(selected.firstAt)} to {longDate(selected.lastAt)}.
                </p>
              </div>
              <div className="flex min-h-5 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-label text-ink-2" aria-live="polite">
                  {historyBusy
                    ? 'Loading readings…'
                    : history.length
                      ? `${history.length} readings, ${shortTime(history[0].timestamp)} to ${shortTime(history.at(-1).timestamp)}${editor.editedCount ? ` (${editor.editedCount} edited)` : ''}`
                      : 'No readings loaded.'}
                </p>
                <Button
                  variant="text"
                  onClick={editor.toggle}
                  disabled={!history.length || historyBusy}
                  aria-expanded={editor.open}
                  aria-controls="readings-editor"
                >
                  {editor.open ? 'Hide readings' : 'Edit readings'}
                </Button>
              </div>
              {editor.open && history.length ? (
                <ReadingsEditor
                  id="readings-editor"
                  rows={history}
                  original={editor.original}
                  editedCount={editor.editedCount}
                  onChange={editor.change}
                  onReset={editor.reset}
                />
              ) : null}
            </div>
          ) : null}

          {mode === 'manual' ? (
            <ManualEntry
              text={manual.text}
              onText={manual.setText}
              parsed={manual.parsed}
              lookback={selected.lookback}
              date={manual.date}
              hour={manual.hour}
              onDate={manual.setDate}
              onHour={manual.setHour}
              onFillSample={manual.fillSample}
              canFillSample={manual.canFillSample}
            />
          ) : null}

          {mode === 'upload' ? <UploadZone file={upload.file} lookback={selected.lookback} onFile={upload.onFile} /> : null}
        </Group>
      </div>

      <div
        ref={footer}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 lg:static lg:z-auto lg:border-t-0 lg:bg-transparent lg:px-6 lg:pb-6 lg:pt-2"
      >
        <div className="mx-auto max-w-xl space-y-3 lg:max-w-none">
          {action.error ? <Notice tone="error">{action.error}</Notice> : null}
          <Button className="w-full" loading={action.running} disabled={Boolean(action.blocker)} onClick={action.run}>
            {action.running ? 'Running model…' : 'Generate forecast'}
          </Button>
          {action.blocker && !action.running ? <p className="text-center text-label text-ink-3">{action.blocker}</p> : null}
        </div>
      </div>
    </aside>
  )
}
