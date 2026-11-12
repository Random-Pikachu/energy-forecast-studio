export async function requestJSON(path, options = {}) {
  const response = await fetch(path, options)
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error('The forecast server did not return JSON.')
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`)
  return body
}
