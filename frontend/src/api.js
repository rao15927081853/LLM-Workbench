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

// 图生图：上传一张或多张参考图，走 multipart/form-data。
// payload 同 generateImages（除 files 外的字段），files 为 File[] 数组。
export async function editImages(payload, files) {
  const form = new FormData()
  // 文本字段：仅追加有值的，与后端 @RequestParam(required=false) 对应。
  Object.entries(payload).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      form.append(k, v)
    }
  })
  // 参考图：字段名固定为 images，对应后端 @RequestPart("images")。
  files.forEach((f) => form.append('images', f))

  // 注意：不要手动设 Content-Type，浏览器会自动带上 multipart 边界。
  const res = await fetch('/api/images/edit', {
    method: 'POST',
    body: form,
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

