import React, { useEffect, useState } from 'react'
import { generateImages } from './api'
import {
  MODEL_PRESETS,
  SIZE_OPTIONS,
  QUALITY_OPTIONS,
  BACKGROUND_OPTIONS,
  FORMAT_OPTIONS,
} from './constants'

const STORAGE_KEY = 'llm-workbench-config'

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export default function App() {
  const saved = loadConfig()

  // Connection config (persisted)
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl || '')
  const [apiKey, setApiKey] = useState(saved.apiKey || '')
  const [model, setModel] = useState(saved.model || 'gpt-image-2')

  // Generation params (persisted)
  const [size, setSize] = useState(saved.size || '1024x1024')
  const [quality, setQuality] = useState(saved.quality || 'auto')
  const [n, setN] = useState(saved.n || 1)
  const [background, setBackground] = useState(saved.background || '')
  const [outputFormat, setOutputFormat] = useState(saved.outputFormat || '')

  // Session state
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState([])
  const [endpoint, setEndpoint] = useState('')
  const [showKey, setShowKey] = useState(false)

  // Persist config + params whenever they change.
  useEffect(() => {
    const cfg = { baseUrl, apiKey, model, size, quality, n, background, outputFormat }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  }, [baseUrl, apiKey, model, size, quality, n, background, outputFormat])

  const isGpt = model.trim().toLowerCase().startsWith('gpt')

  async function handleGenerate() {
    setError('')
    if (!baseUrl.trim()) {
      setError('请先配置请求地址 (Base URL)')
      return
    }
    if (!apiKey.trim()) {
      setError('请先配置 API Key')
      return
    }
    if (!prompt.trim()) {
      setError('请输入提示词 (Prompt)')
      return
    }

    setLoading(true)
    try {
      const data = await generateImages({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
        prompt: prompt.trim(),
        size,
        quality,
        n: Number(n) || 1,
        background: background || undefined,
        outputFormat: outputFormat || undefined,
      })
      setImages(data.images || [])
      setEndpoint(data.resolvedEndpoint || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function imageSrc(item) {
    if (item.type === 'b64_json') {
      const fmt = outputFormat || 'png'
      return `data:image/${fmt};base64,${item.value}`
    }
    return item.value
  }

  // 在新标签页打开查看，避免占用当前窗口导致返回后图片丢失。
  function viewImage(item) {
    window.open(imageSrc(item), '_blank', 'noopener,noreferrer')
  }

  // 触发下载且不离开当前页面。
  // base64 直接走 data URL；远程 URL 先尝试 fetch 成 blob 下载，
  // 跨域受限失败时回退到新标签页打开（绝不在当前窗口跳转）。
  async function downloadImage(item, index) {
    const fmt = outputFormat || 'png'
    const filename = `image-${index + 1}.${fmt}`
    const src = imageSrc(item)

    try {
      let blobUrl
      if (item.type === 'b64_json') {
        blobUrl = src
      } else {
        const res = await fetch(src)
        const blob = await res.blob()
        blobUrl = URL.createObjectURL(blob)
      }
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      if (item.type !== 'b64_json') {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 4000)
      }
    } catch {
      // 跨域无法读取时，退而求其次：新标签页打开，用户可自行右键保存。
      window.open(src, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="brand">🎨 图像工作台</h1>

        <section className="panel">
          <h2>连接配置</h2>

          <label className="field">
            <span>请求地址 (Base URL)</span>
            <input
              type="text"
              placeholder="https://api.openai.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>

          <label className="field">
            <span>API Key</span>
            <div className="key-row">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button type="button" className="ghost" onClick={() => setShowKey((s) => !s)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </label>

          <label className="field">
            <span>模型 (Model)</span>
            <input
              type="text"
              list="model-presets"
              placeholder="gpt-image-2"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <datalist id="model-presets">
              {MODEL_PRESETS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          {isGpt && (
            <p className="hint">检测到 GPT 系列模型，将自动在请求地址后追加 <code>/v1</code>。</p>
          )}
        </section>

        <section className="panel">
          <h2>参数配置</h2>

          <label className="field">
            <span>尺寸 (Size)</span>
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>清晰度 (Quality)</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value)}>
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>数量 (n)</span>
            <input
              type="number"
              min="1"
              max="10"
              value={n}
              onChange={(e) => setN(e.target.value)}
            />
          </label>

          <label className="field">
            <span>背景 (Background)</span>
            <select value={background} onChange={(e) => setBackground(e.target.value)}>
              {BACKGROUND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>输出格式 (Output Format)</span>
            <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
              {FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </section>
      </aside>

      <main className="content">
        <section className="prompt-bar">
          <textarea
            placeholder="描述你想生成的图像，例如：一只在霓虹灯城市街道上奔跑的柴犬，电影感光照"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
          <button className="primary" onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中…' : '生成图像'}
          </button>
        </section>

        {error && <div className="error">{error}</div>}
        {endpoint && <div className="endpoint">实际请求地址: <code>{endpoint}</code></div>}

        <section className="gallery">
          {loading && <div className="skeleton">正在生成，请稍候…</div>}
          {!loading && images.length === 0 && !error && (
            <div className="empty">填写左侧配置与提示词，点击「生成图像」开始。</div>
          )}
          {images.map((item, i) => (
            <figure key={i} className="card">
              <img
                src={imageSrc(item)}
                alt={`result-${i}`}
                className="clickable"
                title="点击在新标签页查看"
                onClick={() => viewImage(item)}
              />
              {item.revisedPrompt && (
                <figcaption title={item.revisedPrompt}>{item.revisedPrompt}</figcaption>
              )}
              <button
                type="button"
                className="download"
                onClick={() => downloadImage(item, i)}
              >
                下载
              </button>
            </figure>
          ))}
        </section>
      </main>
    </div>
  )
}
