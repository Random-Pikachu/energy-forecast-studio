import { dayMonth, hourLabel, shortTime } from './format.js'

// Round y ticks on 1, 2 or 5 × 10ⁿ steps.
export function niceTicks(min, max, count = 5) {
  const low = Number.isFinite(min) ? min : 0
  const high = Number.isFinite(max) ? max : 1
  const span = high - low || Math.abs(high) || 1
  const raw = span / (count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normal = raw / magnitude
  const step = (normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10) * magnitude
  const start = Math.floor(low / step) * step
  const end = Math.max(Math.ceil(high / step) * step, start + step)
  const ticks = []
  for (let value = start; value <= end + step / 2; value += step) ticks.push(Number(value.toFixed(6)))
  return { ticks, min: start, max: end }
}

const INTERVALS = [1, 2, 3, 6, 12, 24, 48]
const CHAR_WIDTH = 7
const GAP = 14

// X ticks on clock boundaries. The forecast boundary label wins any collision.
export function timeTicks(rows, xAt, { left, right, boundaryIndex = -1 }) {
  if (!rows.length) return []
  const pxPerHour = rows.length > 1 ? xAt(1) - xAt(0) : Infinity
  const interval = INTERVALS.find(hours => hours * pxPerHour >= 56) ?? 48
  const place = (index, label, emphasis = false) => {
    const width = label.length * CHAR_WIDTH
    const x = Math.min(Math.max(xAt(index), left + width / 2), right - width / 2)
    return { index, label, emphasis, x, from: x - width / 2, to: x + width / 2 }
  }

  const accepted = []
  if (boundaryIndex >= 0) accepted.push(place(boundaryIndex, shortTime(rows[boundaryIndex].timestamp), true))

  let first = true
  rows.forEach((row, index) => {
    if (index === boundaryIndex) return
    const hour = Number(row.timestamp.slice(11, 13))
    if (hour % interval !== 0) return
    const label = hour === 0 ? dayMonth(row.timestamp) : first ? `${dayMonth(row.timestamp)} ${hourLabel(row.timestamp)}` : hourLabel(row.timestamp)
    first = false
    const tick = place(index, label)
    const collides = accepted.some(other => tick.from < other.to + GAP && tick.to > other.from - GAP)
    if (!collides) accepted.push(tick)
  })

  return accepted.sort((a, b) => a.x - b.x)
}
