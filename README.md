# LLM-Workbench

图像生成工作台 — React 前端 + Java (Spring Boot) 后端。支持调用 `gpt-image-2` 等 OpenAI 兼容的图像生成模型。

## 特性

- **可配置请求地址与 Key**：在网页左侧填写 Base URL 和 API Key，浏览器本地保存 (localStorage)。
- **GPT 系列自动加 `/v1`**：当模型名以 `gpt` 开头时，后端自动在请求地址后追加 `/v1`（已带 `/v1` 时不重复添加）。
- **参数配置**：尺寸 (size)、清晰度 (quality)、数量 (n)、背景 (background)、输出格式。
- **安全代理**：API Key 由后端注入并转发，前端可不直接暴露给第三方域。
- **结果展示**：网格画廊，支持 base64 与 URL 两种返回格式，可下载。

## 目录结构

```
backend/    Spring Boot 代理服务 (端口 8080)
frontend/   React + Vite 工作台 (开发端口 5173)
```

## 运行

### 后端

```bash
cd backend
mvn spring-boot:run
```

可选：通过环境变量设置服务端默认值（避免在浏览器暴露 Key）：

```bash
IMAGE_BASE_URL=https://api.openai.com IMAGE_API_KEY=sk-xxx mvn spring-boot:run
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 。开发模式下 `/api` 已代理到后端 `:8080`。

## Docker 部署

项目可通过 docker compose 一键部署。前端用 nginx 托管静态文件，并将 `/api` 反代到后端容器，生产环境同样是单入口。

```bash
# 在项目根目录
docker compose up -d --build
```

启动后访问 http://localhost:8088 即可。

可选：在服务端预置默认地址与 Key（前端请求中即可省略这两个字段）：

```bash
IMAGE_BASE_URL=https://api.openai.com IMAGE_API_KEY=sk-xxx docker compose up -d --build
```

或在根目录创建 `.env` 文件：

```
IMAGE_BASE_URL=https://api.openai.com
IMAGE_API_KEY=sk-xxx
```

常用命令：

```bash
docker compose logs -f          # 查看日志
docker compose down             # 停止并移除容器
docker compose up -d --build    # 重新构建并启动
```

| 服务 | 容器内端口 | 对外端口 | 说明 |
|------|-----------|---------|------|
| frontend | 80 | 8088 | nginx 托管 + 反代 `/api` |
| backend | 8080 | 不对外 | Spring Boot 代理，仅 compose 内网可达 |

后端默认不对外暴露端口（仅前端通过内网访问，更安全）。如需直接调试，取消 `docker-compose.yml` 中 backend 的 `ports` 注释即可。

## 请求地址规则

| 模型 | 配置的 Base URL | 实际请求地址 |
|------|----------------|-------------|
| `gpt-image-2` | `https://api.openai.com` | `https://api.openai.com/v1/images/generations` |
| `gpt-image-2` | `https://api.openai.com/v1` | `https://api.openai.com/v1/images/generations` |
| `dall-e-3` | `https://proxy.host` | `https://proxy.host/images/generations` |

## API

`POST /api/images/generate`

```json
{
  "baseUrl": "https://api.openai.com",
  "apiKey": "sk-...",
  "model": "gpt-image-2",
  "prompt": "a shiba inu running on a neon street",
  "size": "1024x1024",
  "quality": "high",
  "n": 1,
  "background": "auto",
  "outputFormat": "png"
}
```

`baseUrl` / `apiKey` 可省略，省略时使用服务端默认配置。
