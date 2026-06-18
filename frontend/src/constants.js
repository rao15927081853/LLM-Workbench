// Preset options for the workbench controls.

export const MODEL_PRESETS = [
  'gpt-image-2',
  'gpt-image-1',
  'dall-e-3',
  'dall-e-2',
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
