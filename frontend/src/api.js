// Sends a generation request to the backend proxy.
export async function generateImages(payload) {
  const res = await fetch('/api/images/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  let data
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const msg = data?.error || `请求失败 (${res.status})`
    const detail = data?.detail ? `\n${data.detail}` : ''
    throw new Error(msg + detail)
  }
  return data
}
