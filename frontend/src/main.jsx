import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, App as AntApp, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App.jsx'
import './styles.css'

// 浅色高级风主题：柔和品牌色、较大圆角、克制的描边与留白。
const themeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#5b6cff',
    colorInfo: '#5b6cff',
    colorBgLayout: '#f5f6fa',
    colorBorderSecondary: '#eceef3',
    borderRadius: 10,
    fontSize: 14,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif",
    boxShadowSecondary:
      '0 6px 24px rgba(20, 27, 50, 0.06), 0 2px 8px rgba(20, 27, 50, 0.04)',
  },
  components: {
    Card: { borderRadiusLG: 14 },
    Button: { fontWeight: 600 },
    Segmented: { borderRadius: 8 },
  },
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={themeConfig} locale={zhCN}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
)
