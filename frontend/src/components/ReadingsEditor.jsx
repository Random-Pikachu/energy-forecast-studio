import { RotateCcw } from 'lucide-react'
import { shortTime } from '../format.js'
import { Button } from './ui/index.jsx'

export const isInvalidReading = value => value === '' || !Number.isFinite(Number(value))
export const isEditedReading = (row, original) => isInvalidReading(row.building_power) || Number(row.building_power) !== Number(original?.building_power)

export default function ReadingsEditor({ id, rows, original, editedCount, onChange, onReset }) {
  return (
    <div id={id} className="overflow-hidden rounded-control border border-line bg-canvas">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-label font-medium text-ink-2">
          {editedCount ? `${editedCount} ${editedCount === 1 ? 'reading' : 'readings'} edited` : 'No edits'}
        </span>
        <Button variant="text" icon={RotateCcw} onClick={onReset} disabled={!editedCount}>Reset</Button>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {rows.map((row, index) => {
          const edited = isEditedReading(row, original[index])
          const invalid = isInvalidReading(row.building_power)
          const inputId = `${id}-${index}`
          return (
            <div
              key={row.timestamp}
              className={`flex items-center justify-between gap-3 border-l-2 py-1.5 pl-2.5 pr-3 ${edited ? 'border-forest' : 'border-transparent'}`}
            >
              <label htmlFor={inputId} className={`text-label ${edited ? 'font-medium text-ink' : 'text-ink-2'}`}>
                {shortTime(row.timestamp)}
              </label>
              <input
                id={inputId}
                type="number"
                step="any"
                inputMode="decimal"
                value={row.building_power}
                aria-invalid={invalid || undefined}
                onChange={event => onChange(index, event.target.value)}
                className={`h-9 w-30 rounded-control border bg-canvas px-2.5 text-right text-body tabular-nums hover:border-ink-3 ${invalid ? 'border-negative' : 'border-line'} ${edited ? 'font-medium' : ''}`}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
