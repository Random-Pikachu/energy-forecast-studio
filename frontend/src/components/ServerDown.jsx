import { RotateCcw } from 'lucide-react'
import { Button, Panel } from './ui/index.jsx'

export default function ServerDown({ message, onRetry, retrying }) {
  return (
    <Panel className="mx-auto mt-6 max-w-xl sm:mt-16" role="alert">
      <h2 className="text-h2 font-semibold">Can't reach the forecast server</h2>
      <p className="mt-2 text-body text-ink-2">{message}</p>
      <p className="mt-2 text-body text-ink-2">
        Start it with <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-label">python server.py</code>, then try again.
      </p>
      <Button className="mt-6" icon={RotateCcw} loading={retrying} onClick={onRetry}>Try again</Button>
    </Panel>
  )
}
