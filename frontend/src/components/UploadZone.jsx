import { useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { Button } from './ui/index.jsx'

export default function UploadZone({ file, lookback, onFile }) {
  const [dragging, setDragging] = useState(false)
  const dropProps = {
    onDragOver: event => { event.preventDefault(); setDragging(true) },
    onDragLeave: () => setDragging(false),
    onDrop: event => {
      event.preventDefault()
      setDragging(false)
      onFile(event.dataTransfer.files?.[0])
    },
  }
  const input = (
    <input
      id="csv-upload"
      className="sr-only"
      type="file"
      accept=".csv,text/csv"
      onChange={event => { onFile(event.target.files?.[0]); event.target.value = '' }}
    />
  )

  return (
    <div className="space-y-2">
      {file ? (
        <div
          {...dropProps}
          className={`flex items-center gap-3 rounded-control border bg-canvas p-3 ${dragging ? 'border-forest bg-surface-2' : 'border-line'}`}
        >
          <FileText size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-forest" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-medium text-ink">{file.name}</div>
            <div className="text-label text-ink-3">{Math.max(1, Math.ceil(file.size / 1024))} KB</div>
          </div>
          <label htmlFor="csv-upload" className="cursor-pointer rounded-sm text-body font-medium text-forest underline-offset-4 hover:underline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest">
            Replace
            {input}
          </label>
          <Button variant="text" onClick={() => onFile(null)}>Remove</Button>
        </div>
      ) : (
        <label
          htmlFor="csv-upload"
          {...dropProps}
          className={`flex h-30 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border-[1.5px] border-dashed px-4 text-center motion-safe:transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest ${dragging ? 'border-forest bg-surface-2' : 'border-line bg-canvas hover:border-ink-3'}`}
        >
          <Upload size={20} strokeWidth={1.75} aria-hidden="true" className="text-forest" />
          <span className="text-body font-medium text-forest">Choose a CSV file</span>
          <span className="text-label text-ink-3">or drop it here. 2 MB maximum.</span>
          {input}
        </label>
      )}
      <p className="text-label text-ink-3">
        Needs timestamp and building_power columns. The last {lookback} hourly rows are used.
      </p>
    </div>
  )
}
