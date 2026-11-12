export const FAMILY = {
  ct: { name: 'CNN–Transformer', short: 'Transformer', description: 'multi-scale convolution with attention' },
  gru: { name: 'CNN–GRU', short: 'GRU', description: 'convolution with a gated recurrent unit' },
  lstm: { name: 'CNN–LSTM', short: 'LSTM', description: 'convolution with long short-term memory' },
}

export const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))

export const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
export const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The API sends naive local timestamps ("2019-10-21T14:00:00"). Read them by
// position so the browser's time zone never shifts a reading.
function parts(value) {
  return {
    year: value.slice(0, 4),
    month: MONTHS[Number(value.slice(5, 7)) - 1],
    day: String(Number(value.slice(8, 10))),
    hour: value.slice(11, 13),
  }
}

export function hourLabel(value) {
  return `${parts(value).hour}:00`
}

export function dayMonth(value) {
  const { day, month } = parts(value)
  return `${day} ${month}`
}

export function shortTime(value) {
  if (!value) return '—'
  return `${dayMonth(value)}, ${hourLabel(value)}`
}

export function longTime(value) {
  if (!value) return '—'
  return `${dayMonth(value)} ${parts(value).year}, ${hourLabel(value)}`
}

export function longDate(value) {
  if (!value) return '—'
  return `${dayMonth(value)} ${parts(value).year}`
}

export function monthYear(value) {
  if (!value) return '—'
  const { month, year } = parts(value)
  return `${month} ${year}`
}

export function formatHours(hours) {
  if (hours === 168) return '7 days'
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

export function shortHours(hours) {
  return hours === 168 ? '7 days' : `${hours} h`
}

export function signed(value) {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  if (rounded === 0) return '0'
  return `${rounded < 0 ? '−' : '+'}${number.format(Math.abs(rounded))}`
}

export function parseReadings(text) {
  const tokens = text.split(/[\s,;]+/).filter(Boolean)
  const values = []
  for (let index = 0; index < tokens.length; index += 1) {
    const value = Number(tokens[index])
    if (!Number.isFinite(value)) {
      return { values, count: tokens.length, error: `Reading ${index + 1} (“${tokens[index].slice(0, 12)}”) is not a number.` }
    }
    values.push(value)
  }
  return { values, count: tokens.length, error: '' }
}

export function hourlyTimestamps(date, hour, count) {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return []
  const start = Date.UTC(year, month - 1, day, Number(hour))
  return Array.from({ length: count }, (_, index) => new Date(start + index * 3_600_000).toISOString().slice(0, 19))
}

export function buildCsv(rows) {
  return ['timestamp,building_power', ...rows.map(row => `${row.timestamp},${row.building_power}`)].join('\n')
}
