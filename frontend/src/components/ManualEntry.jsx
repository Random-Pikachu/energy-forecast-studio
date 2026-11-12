import { HOURS } from '../format.js'
import { Button, Field } from './ui/index.jsx'

export default function ManualEntry({ text, onText, parsed, lookback, date, hour, onDate, onHour, onFillSample, canFillSample }) {
  const count = parsed.values.length
  let countText = `${count} of ${lookback} readings`
  if (count > lookback) countText = `${count} readings entered. The last ${lookback} are used.`

  return (
    <div className="space-y-4">
      <div>
        <Field
          as="textarea"
          id="manual-readings"
          label="Readings, oldest first"
          rows={6}
          value={text}
          onChange={event => onText(event.target.value)}
          placeholder={'10575.7\n10638.0\n…'}
          spellCheck={false}
          error={parsed.error}
          helper={`Paste or type ${lookback} hourly readings, separated by commas, spaces, or new lines.`}
        />
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p aria-live="polite" className={`text-label ${count >= lookback && !parsed.error ? 'font-medium text-ink' : 'text-ink-3'}`}>
            {countText}
          </p>
          <Button variant="text" onClick={onFillSample} disabled={!canFillSample}>Fill with sample readings</Button>
        </div>
      </div>
      <div>
        <div className="grid grid-cols-[3fr_2fr] gap-3">
          <Field id="manual-date" type="date" label="Starts on" value={date} onChange={event => onDate(event.target.value)} aria-describedby="manual-start-helper" />
          <Field as="select" id="manual-hour" label="At" value={hour} onChange={event => onHour(event.target.value)}>
            {HOURS.map(value => <option key={value} value={value}>{value}:00</option>)}
          </Field>
        </div>
        <p id="manual-start-helper" className="mt-1.5 text-label text-ink-3">
          The model also reads the hour and weekday, so set when these readings start.
        </p>
      </div>
    </div>
  )
}
