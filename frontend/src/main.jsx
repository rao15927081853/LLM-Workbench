import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, App as AntApp, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App.jsx'
import './styles.css'

const THEME_KEY = 'llm-workbench-theme'

// 明暗两套 antd 主题：仅底色/描边/投影不同，品牌色与字体一致。
const commonToken = {
  colorPrimary: '#5b6cff',
  colorInfo: '#5b6cff',
  colorBgLayout: 'transparent',
  borderRadius: 12,
  fontSize: 14,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif",
}

const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...commonToken,
    colorBgContainer: '#1e1e1e',
    colorBorder: 'rgba(255, 255, 255, 0.12)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.08)',
    boxShadowSecondary:
      '0 8px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)',
  },
  components: {
    Card: { borderRadiusLG: 18, colorBgContainer: '#1e1e1e' },
    Button: { fontWeight: 600, controlHeight: 36 },
    Segmented: { borderRadius: 10 },
    Input: { colorBgContainer: '#262626' },
    InputNumber: { colorBgContainer: '#262626' },
    Select: { colorBgContainer: '#262626' },
  },
}

const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...commonToken,
    colorBgContainer: '#ffffff',
    colorBorder: '#e2e5ee',
    colorBorderSecondary: '#eceef3',
    boxShadowSecondary:
      '0 6px 24px rgba(20, 27, 50, 0.06), 0 2px 8px rgba(20, 27, 50, 0.04)',
  },
  components: {
    Card: { borderRadiusLG: 18, colorBgContainer: '#ffffff' },
    Button: { fontWeight: 600, controlHeight: 36 },
    Segmented: { borderRadius: 10 },
    Input: { colorBgContainer: '#f7f8fa' },
    InputNumber: { colorBgContainer: '#f7f8fa' },
    Select: { colorBgContainer: '#f7f8fa' },
  },
}

// 读取用户偏好：本地存储优先，否则跟随系统。
function initialMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* 忽略读取失败 */
  }
  const prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

function Root() {
  const [mode, setMode] = useState(initialMode)

  // 同步到 <html data-theme>，供 styles.css 的两套变量切换；并持久化。
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    try {
      localStorage.setItem(THEME_KEY, mode)
    } catch {
      /* 忽略写入失败（如隐私模式） */
    }
  }, [mode])

  const toggleTheme = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'))

  return (
    <ConfigProvider theme={mode === 'dark' ? darkTheme : lightTheme} locale={zhCN}>
      <AntApp>
        <App mode={mode} onToggleTheme={toggleTheme} />
      </AntApp>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
