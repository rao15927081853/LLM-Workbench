// Preset options for the workbench controls.

export const MODEL_PRESETS = [
  'gpt-image-2-4k',
  'gpt-image-2-2k',
  'gpt-image-2-1k',
  'gpt-image-2'
]

export const SIZE_OPTIONS = [
  { value: 'auto', label: '自动 (auto)' },
  { value: '1024x1024', label: '1024×1024 (正方形)' },
  { value: '1536x1024', label: '1536×1024 (横向)' },
  { value: '1024x1536', label: '1024×1536 (纵向)' },
  { value: '1792x1024', label: '1792×1024 (DALL·E 3 横向)' },
  { value: '1024x1792', label: '1024×1792 (DALL·E 3 纵向)' },
  { value: '512x512', label: '512×512' },
  { value: '256x256', label: '256×256' },
]

// 分辨率档位：以「长边像素」表示。通过尺寸控制清晰度（1K/2K/4K）。
export const RESOLUTION_OPTIONS = [
  { value: 1024, label: '1K (1024px 长边)' },
  { value: 2048, label: '2K (2048px 长边)' },
  { value: 4096, label: '4K (4096px 长边)' },
]

// 宽高比：与长边像素组合，算出最终 size 字符串。
export const ASPECT_OPTIONS = [
  { value: '1:1', label: '1:1 正方形', w: 1, h: 1 },
  { value: '3:2', label: '3:2 横向', w: 3, h: 2 },
  { value: '2:3', label: '2:3 纵向', w: 2, h: 3 },
  { value: '16:9', label: '16:9 宽屏', w: 16, h: 9 },
  { value: '9:16', label: '9:16 竖屏', w: 9, h: 16 },
]

// 把整数对齐到 8 的倍数（多数图像模型要求边长为 8/16 的倍数）。
function roundTo8(n) {
  return Math.max(8, Math.round(n / 8) * 8)
}

// 由分辨率（长边像素）+ 宽高比，计算出 "宽x高" 字符串。
export function computeSize(longEdge, aspectValue) {
  const aspect = ASPECT_OPTIONS.find((a) => a.value === aspectValue) || ASPECT_OPTIONS[0]
  const { w, h } = aspect
  let width
  let height
  if (w >= h) {
    width = longEdge
    height = roundTo8((longEdge * h) / w)
  } else {
    height = longEdge
    width = roundTo8((longEdge * w) / h)
  }
  return `${width}x${height}`
}

// "清晰度" / quality options. gpt-image uses low/medium/high/auto; dall-e uses standard/hd.
export const QUALITY_OPTIONS = [
  { value: 'auto', label: '自动 (auto)' },
  { value: 'low', label: '低 (low)' },
  { value: 'medium', label: '中 (medium)' },
  { value: 'high', label: '高 (high)' },
  { value: 'standard', label: '标准 (standard / DALL·E)' },
  { value: 'hd', label: '高清 (hd / DALL·E 3)' },
]

export const BACKGROUND_OPTIONS = [
  { value: '', label: '默认' },
  { value: 'auto', label: '自动 (auto)' },
  { value: 'transparent', label: '透明 (transparent)' },
  { value: 'opaque', label: '不透明 (opaque)' },
]

export const FORMAT_OPTIONS = [
  { value: '', label: '默认' },
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WEBP' },
]
