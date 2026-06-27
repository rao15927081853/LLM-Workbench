import React, { useEffect, useMemo, useState } from 'react'
import {
  Layout,
  Tabs,
  Card,
  Input,
  InputNumber,
  Select,
  AutoComplete,
  Button,
  Tooltip,
  Popover,
  Alert,
  Tag,
  Badge,
  Spin,
  Empty,
  Typography,
  Space,
  Upload,
  Drawer,
} from 'antd'
import {
  PlusOutlined,
  WalletOutlined,
  CustomerServiceOutlined,
  ThunderboltOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  DownloadOutlined,
  ExpandOutlined,
  PictureOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { generateImages, editImages } from './api'
import {
  MODEL_PRESETS,
  RESOLUTION_OPTIONS,
  ASPECT_OPTIONS,
  QUALITY_OPTIONS,
  BACKGROUND_OPTIONS,
  FORMAT_OPTIONS,
  computeSize,
} from './constants'

const { Header, Sider, Content } = Layout
const { TextArea } = Input
const { Text } = Typography

const STORAGE_KEY = 'llm-workbench-tasks'
const LEGACY_KEY = 'llm-workbench-config'

function uid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID()
  return 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

// 单个任务的完整数据：每个任务持有独立配置、参数与结果。
function defaultTask(seed = {}, index = 1) {
  return {
    id: uid(),
    name: seed.name || `任务 ${index}`,
    baseUrl: seed.baseUrl || '',
    apiKey: seed.apiKey || '',
    model: seed.model || 'gpt-image-2',
    resolution: seed.resolution || 1024,
    aspect: seed.aspect || '1:1',
    quality: seed.quality || 'auto',
    n: Math.min(Math.max(Number(seed.n) || 1, 1), 5),
    background: seed.background || '',
    outputFormat: seed.outputFormat || '',
    prompt: seed.prompt || '',
    // 运行时状态（不持久化）
    fileList: [],
    images: [],
    endpoint: '',
    loading: false,
    error: '',
  }
}

// 仅持久化配置与提示词；图片/加载态等运行时字段不写入（base64 会撑爆 localStorage）。
function persist(tasks, activeId) {
  try {
    const slim = tasks.map((t) => ({
      id: t.id,
      name: t.name,
      baseUrl: t.baseUrl,
      apiKey: t.apiKey,
      model: t.model,
      resolution: t.resolution,
      aspect: t.aspect,
      quality: t.quality,
      n: t.n,
      background: t.background,
      outputFormat: t.outputFormat,
      prompt: t.prompt,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: slim, activeId }))
  } catch {
    /* 忽略写入失败（如隐私模式） */
  }
}

function loadInitial() {
  // 1) 优先读多任务存储
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.tasks && parsed.tasks.length) {
        const tasks = parsed.tasks.map((t) => defaultTask(t))
        const activeId =
          tasks.find((t) => t.id === parsed.activeId)?.id || tasks[0].id
        return { tasks, activeId }
      }
    }
  } catch {
    /* 继续尝试迁移 */
  }
  // 2) 迁移旧版单配置
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const cfg = JSON.parse(legacy)
      const t = defaultTask(cfg, 1)
      return { tasks: [t], activeId: t.id }
    }
  } catch {
    /* 落到默认 */
  }
  // 3) 全新空白任务
  const t = defaultTask({}, 1)
  return { tasks: [t], activeId: t.id }
}

export default function App() {
  const initial = useMemo(loadInitial, [])
  const [tasks, setTasks] = useState(initial.tasks)
  const [activeId, setActiveId] = useState(initial.activeId)
  // 联系客服气泡的开关
  const [showContact, setShowContact] = useState(false)
  // 手机端配置抽屉的开关
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 每个任务各自的「已揭示」图片索引集合：{ [taskId]: { [imgIndex]: true } }
  const [revealed, setRevealed] = useState({})

  const active = tasks.find((t) => t.id === activeId) || tasks[0]

  // 配置/提示词变化时持久化。
  useEffect(() => {
    persist(tasks, activeId)
  }, [tasks, activeId])

  // 局部更新某个任务（按 id），不影响其它任务 —— 这是并发生成的基础。
  function patchTask(id, patch) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    )
  }

  // 更新当前活动任务的字段。
  function patchActive(patch) {
    patchTask(active.id, patch)
  }

  function addTask() {
    // 新任务克隆当前任务的连接配置，省去重复填写。
    const seed = {
      baseUrl: active.baseUrl,
      apiKey: active.apiKey,
      model: active.model,
      resolution: active.resolution,
      aspect: active.aspect,
      quality: active.quality,
      n: active.n,
      background: active.background,
      outputFormat: active.outputFormat,
    }
    const t = defaultTask(seed, tasks.length + 1)
    setTasks((prev) => [...prev, t])
    setActiveId(t.id)
  }

  function closeTask(id, e) {
    e.stopPropagation()
    setTasks((prev) => {
      if (prev.length === 1) return prev // 至少保留一个任务
      const idx = prev.findIndex((t) => t.id === id)
      const next = prev.filter((t) => t.id !== id)
      if (id === activeId) {
        const fallback = next[idx] || next[idx - 1] || next[0]
        setActiveId(fallback.id)
      }
      return next
    })
  }

  // 对指定任务发起生成。按 id 局部更新，因此多个任务可同时进行、互不干扰。
  async function handleGenerate(task) {
    if (!task.baseUrl.trim()) {
      patchTask(task.id, { error: '请先配置请求地址 (Base URL)' })
      return
    }
    if (!task.apiKey.trim()) {
      patchTask(task.id, { error: '请先配置 API Key' })
      return
    }
    if (!task.prompt.trim()) {
      patchTask(task.id, { error: '请输入提示词 (Prompt)' })
      return
    }

    const size = computeSize(Number(task.resolution), task.aspect)
    // 取出真正的 File 对象（antd Upload 在 beforeUpload 返回 false 时存于 originFileObj）
    const files = (task.fileList || []).map((f) => f.originFileObj || f).filter(Boolean)
    patchTask(task.id, { loading: true, error: '', images: [] })
    setRevealed((r) => ({ ...r, [task.id]: {} }))

    const params = {
      baseUrl: task.baseUrl.trim(),
      apiKey: task.apiKey.trim(),
      model: task.model.trim(),
      prompt: task.prompt.trim(),
      size,
      quality: task.quality,
      n: Number(task.n) || 1,
      background: task.background || undefined,
      outputFormat: task.outputFormat || undefined,
    }

    try {
      // 有参考图 → 图生图 (multipart edits)；否则 → 文生图 (json generations)
      const data = files.length > 0
        ? await editImages(params, files)
        : await generateImages(params)
      patchTask(task.id, {
        images: data.images || [],
        endpoint: data.resolvedEndpoint || '',
        loading: false,
      })
    } catch (e) {
      patchTask(task.id, { error: e.message, loading: false })
    }
  }

  function imageSrc(task, item) {
    if (item.type === 'b64_json') {
      const fmt = task.outputFormat || 'png'
      // 兼容上游既可能返回裸 base64，也可能返回完整 data URI 的情况
      if (item.value.startsWith('data:')) return item.value
      return `data:image/${fmt};base64,${item.value}`
    }
    return item.value
  }

  // 把 base64 转成 Blob URL：data: URL 在大体积时无法被 window.open 顶层导航
  // （浏览器安全拦截），且超长 href 易触发限制；blob: URL 两者都不受限。
  function b64ToBlobUrl(task, item) {
    const fmt = task.outputFormat || 'png'
    // 去掉可能存在的 data:image/...;base64, 前缀，只保留纯 base64
    const raw = item.value.startsWith('data:')
      ? item.value.slice(item.value.indexOf(',') + 1)
      : item.value
    const binary = atob(raw)
    const bytes = new Uint8Array(binary.length)
    for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j)
    const blob = new Blob([bytes], { type: `image/${fmt}` })
    return URL.createObjectURL(blob)
  }

  function viewImage(task, item) {
    if (item.type === 'b64_json') {
      const url = b64ToBlobUrl(task, item)
      window.open(url, '_blank', 'noopener,noreferrer')
      // 给新标签页留出加载时间后回收，避免泄漏
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return
    }
    window.open(imageSrc(task, item), '_blank', 'noopener,noreferrer')
  }

  async function downloadImage(task, item, index) {
    const fmt = task.outputFormat || 'png'
    const filename = `${task.name}-${index + 1}.${fmt}`
    const a = document.createElement('a')

    if (item.type === 'b64_json') {
      // base64：转 Blob URL 触发下载，规避大体积 data URL 的长度/内存限制。
      const url = b64ToBlobUrl(task, item)
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      return
    }

    // 远程 URL：走后端下载代理（带 attachment 头），绕过跨域，浏览器直接保存。
    const proxied = `/api/images/download?url=${encodeURIComponent(item.value)}&filename=${encodeURIComponent(filename)}`
    a.href = proxied
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  function markRevealed(taskId, imgIndex) {
    setRevealed((r) => ({
      ...r,
      [taskId]: { ...(r[taskId] || {}), [imgIndex]: true },
    }))
  }

  const isGpt = active.model.trim().toLowerCase().startsWith('gpt')
  const activeSize = computeSize(Number(active.resolution), active.aspect)
  const activeRevealed = revealed[active.id] || {}

  // Tabs（可编辑卡片式）：原生支持新增/关闭，标签内嵌状态指示。
  const tabItems = tasks.map((t) => ({
    key: t.id,
    closable: tasks.length > 1,
    label: (
      <span className="tab-label" title={t.prompt || t.name}>
        {t.loading ? (
          <Spin size="small" />
        ) : (
          <Badge
            count={t.images.length}
            showZero
            color={t.images.length ? '#5b6cff' : '#c9ccd6'}
            size="small"
          />
        )}
        <span className="tab-text">{t.name}</span>
      </span>
    ),
  }))

  function onTabEdit(targetKey, action) {
    if (action === 'add') {
      addTask()
    } else {
      closeTask(targetKey, { stopPropagation() {} })
    }
  }

  const contactContent = (
    <div className="contact-pop">
      <img
        src="/wechat-qr.png"
        alt="客服微信二维码"
        className="contact-qr"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          e.currentTarget.nextSibling.style.display = 'block'
        }}
      />
      <Text type="danger" style={{ display: 'none' }}>
        二维码图片未找到，请放到 frontend/public/wechat-qr.png
      </Text>
    </div>
  )

  // 配置面板（桌面端 Sider 与手机端 Drawer 共用同一份）
  const configPanels = (
    <>
      <Card size="small" className="panel" title="任务">
        <div className="field">
          <label>任务名称</label>
          <Input
            value={active.name}
            onChange={(e) => patchActive({ name: e.target.value })}
            placeholder="任务名称"
          />
        </div>
      </Card>

      <Card size="small" className="panel" title="连接配置">
        <div className="field">
          <label>请求地址 (Base URL)</label>
          <Input
            placeholder="https://api.openai.com"
            value={active.baseUrl}
            onChange={(e) => patchActive({ baseUrl: e.target.value })}
          />
        </div>
        <div className="field">
          <label>API Key</label>
          <Input.Password
            placeholder="sk-..."
            value={active.apiKey}
            onChange={(e) => patchActive({ apiKey: e.target.value })}
            iconRender={(v) => (v ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
          />
        </div>
        <div className="field">
          <label>模型 (Model)</label>
          <AutoComplete
            value={active.model}
            onChange={(v) => patchActive({ model: v })}
            options={MODEL_PRESETS.map((m) => ({ value: m }))}
            placeholder="gpt-image-2"
            filterOption={(input, opt) =>
              opt.value.toLowerCase().includes(input.toLowerCase())
            }
          >
            <Input />
          </AutoComplete>
        </div>
        {isGpt && (
          <Alert
            type="info"
            showIcon
            banner
            message={
              <span>检测到 GPT 系列模型，将自动在请求地址后追加 <code>/v1</code></span>
            }
          />
        )}
      </Card>

      <Card size="small" className="panel" title="参数配置">
        <div className="field-grid">
          <div className="field">
            <label>分辨率</label>
            <Select
              value={active.resolution}
              onChange={(v) => patchActive({ resolution: Number(v) })}
              options={RESOLUTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <div className="field">
            <label>宽高比</label>
            <Select
              value={active.aspect}
              onChange={(v) => patchActive({ aspect: v })}
              options={ASPECT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <div className="field">
            <label>清晰度</label>
            <Select
              value={active.quality}
              onChange={(v) => patchActive({ quality: v })}
              options={QUALITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <div className="field">
            <label>数量 (n)　<span style={{ color: '#999', fontWeight: 400 }}>最多 5 张</span></label>
            <InputNumber
              min={1}
              max={5}
              value={active.n}
              onChange={(v) => patchActive({ n: v })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="field">
            <label>背景</label>
            <Select
              value={active.background}
              onChange={(v) => patchActive({ background: v })}
              options={BACKGROUND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <div className="field">
            <label>输出格式</label>
            <Select
              value={active.outputFormat}
              onChange={(v) => patchActive({ outputFormat: v })}
              options={FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
        </div>
        <div className="size-tag">
          实际尺寸 <Tag color="blue">{activeSize}</Tag>
        </div>
      </Card>
    </>
  )

  return (
    <Layout className="app">
      <Header className="taskbar">
        <div className="logo">
          <svg className="logo-mark" viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#5b6cff" />
                <stop offset="1" stopColor="#8a6bff" />
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="16" fill="url(#lg)" />
            <circle cx="22" cy="24" r="6" fill="#fff" />
            <circle cx="42" cy="22" r="5" fill="#ffd86b" />
            <path d="M14 48l12-16 9 11 7-8 8 13z" fill="#fff" />
          </svg>
          <span className="logo-name">大模型生图平台</span>
        </div>

        <Button
          className="menu-toggle"
          icon={<SettingOutlined />}
          onClick={() => setDrawerOpen(true)}
        />

        <div className="tabs-wrap">
          <Tabs
            type="editable-card"
            activeKey={activeId}
            onChange={setActiveId}
            onEdit={onTabEdit}
            items={tabItems}
            addIcon={<span className="add-tab"><PlusOutlined /> 新建任务</span>}
            hideAdd={false}
          />
        </div>

        <Space className="taskbar-actions" size={10}>
          <Button
            type="primary"
            ghost
            className="recharge-btn"
            icon={<WalletOutlined />}
            href="http://47.253.7.24:3000"
            target="_blank"
          >
            获取 API Key
          </Button>
          <Popover
            content={contactContent}
            title="微信扫码联系客服"
            trigger="click"
            placement="bottomRight"
            open={showContact}
            onOpenChange={setShowContact}
          >
            <Button className="contact-btn" icon={<CustomerServiceOutlined />}>联系客服</Button>
          </Popover>
        </Space>
      </Header>

      <Layout className="layout">
        <Sider className="sidebar" width={340} theme="light">
          {configPanels}
        </Sider>

        <Drawer
          className="config-drawer"
          title="配置"
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={320}
        >
          {configPanels}
        </Drawer>

        <Content className="content">
          <Card className="prompt-card" size="small">
            <div className="upload-row">
              <Upload
                listType="picture-card"
                fileList={active.fileList}
                multiple
                maxCount={5}
                accept="image/*"
                beforeUpload={() => false}
                onChange={({ fileList }) => patchActive({ fileList: fileList.slice(0, 5) })}
              >
                {active.fileList.length >= 5 ? null : (
                  <div className="upload-trigger">
                    <PictureOutlined />
                    <div>参考图 {active.fileList.length}/5</div>
                  </div>
                )}
              </Upload>
              <Text type="secondary" className="upload-hint">
                可上传 0 / 1 / 多张参考图（最多 5 张）。上传后走「图生图」，留空则「文生图」。
              </Text>
            </div>
            <div className="prompt-row">
              <TextArea
                placeholder="描述你想生成的图像，例如：一只在霓虹灯城市街道上奔跑的柴犬，电影感光照"
                value={active.prompt}
                onChange={(e) => patchActive({ prompt: e.target.value })}
                autoSize={{ minRows: 3, maxRows: 6 }}
              />
              <Button
                type="primary"
                size="large"
                icon={<ThunderboltOutlined />}
                loading={active.loading}
                onClick={() => handleGenerate(active)}
                className="generate-btn"
              >
                {active.loading
                  ? '生成中…'
                  : active.fileList.length > 0
                    ? '图生图'
                    : '生成图像'}
              </Button>
            </div>
          </Card>

          {active.error && (
            <Alert
              type="error"
              showIcon
              closable
              message="生成失败"
              description={active.error}
              className="result-alert"
              onClose={() => patchActive({ error: '' })}
            />
          )}
          {active.endpoint && (
            <Text type="secondary" className="endpoint">
              实际请求地址：<code>{active.endpoint}</code>
            </Text>
          )}

          <div className="gallery">
            {active.loading &&
              Array.from({ length: Number(active.n) || 1 }).map((_, i) => (
                <div
                  key={`ph-${i}`}
                  className="card placeholder"
                  style={{ aspectRatio: activeSize.replace('x', ' / ') }}
                >
                  <div className="shimmer" />
                  <Spin tip="生成中…" />
                </div>
              ))}
            {!active.loading && active.images.length === 0 && !active.error && (
              <div className="empty-wrap">
                <Empty description="填写左侧配置与提示词，点击「生成图像」开始" />
              </div>
            )}
            {!active.loading &&
              active.images.map((item, i) => (
                <Card
                  key={i}
                  className="img-card"
                  hoverable
                  cover={
                    <div className="img-cover">
                      <img
                        src={imageSrc(active, item)}
                        alt={`result-${i}`}
                        className={`reveal${activeRevealed[i] ? ' revealed' : ''}`}
                        onClick={() => viewImage(active, item)}
                        onLoad={() => markRevealed(active.id, i)}
                      />
                      <div className="img-overlay">
                        <Tooltip title="新标签页查看">
                          <Button
                            shape="circle"
                            icon={<ExpandOutlined />}
                            onClick={() => viewImage(active, item)}
                          />
                        </Tooltip>
                        <Tooltip title="下载">
                          <Button
                            shape="circle"
                            type="primary"
                            icon={<DownloadOutlined />}
                            onClick={() => downloadImage(active, item, i)}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  }
                >
                  {item.revisedPrompt && (
                    <Text type="secondary" ellipsis={{ tooltip: item.revisedPrompt }}>
                      {item.revisedPrompt}
                    </Text>
                  )}
                </Card>
              ))}
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

