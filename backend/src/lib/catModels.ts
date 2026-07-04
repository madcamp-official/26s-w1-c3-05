// 3D model catalog. Similar-looking cats reuse the same model, keyed by a small
// set of coat archetypes. Asset paths point at frontend files under /models/cats.
export interface CatModel {
  key: string
  label: string
  assetUrl: string
  scale: number
}

export const CAT_MODELS: Record<string, CatModel> = {
  orange: { key: 'orange', label: '치즈/오렌지', assetUrl: '/models/cats/orange.glb', scale: 1 },
  black: { key: 'black', label: '검정', assetUrl: '/models/cats/black.glb', scale: 1 },
  white: { key: 'white', label: '흰색', assetUrl: '/models/cats/white.glb', scale: 1 },
  tuxedo: { key: 'tuxedo', label: '턱시도', assetUrl: '/models/cats/tuxedo.glb', scale: 1 },
  tricolor: { key: 'tricolor', label: '삼색', assetUrl: '/models/cats/tricolor.glb', scale: 1 },
  gray_tabby: { key: 'gray_tabby', label: '회색 태비', assetUrl: '/models/cats/gray_tabby.glb', scale: 1 },
  brown_tabby: { key: 'brown_tabby', label: '갈색 태비', assetUrl: '/models/cats/brown_tabby.glb', scale: 1 },
  default: { key: 'default', label: '기본 고양이', assetUrl: '/models/cats/default.glb', scale: 1 },
}

// Human/admin-provided pattern label -> model key.
const PATTERN_TO_MODEL: Record<string, string> = {
  cheese: 'orange',
  orange: 'orange',
  ginger: 'orange',
  tabby: 'brown_tabby',
  brown: 'brown_tabby',
  brown_tabby: 'brown_tabby',
  mackerel: 'brown_tabby',
  gray: 'gray_tabby',
  grey: 'gray_tabby',
  gray_tabby: 'gray_tabby',
  tuxedo: 'tuxedo',
  black: 'black',
  white: 'white',
  calico: 'tricolor',
  tricolor: 'tricolor',
  tortoiseshell: 'tricolor',
  tortie: 'tricolor',
}

// Auto-detected coat color (from the crop) -> model key.
const COLOR_TO_MODEL: Record<string, string> = {
  orange: 'orange',
  black: 'black',
  white: 'white',
  gray: 'gray_tabby',
  brown: 'brown_tabby',
  mixed: 'default',
}

export const isModelKey = (key: string | null | undefined): key is string => Boolean(key && key in CAT_MODELS)

/** Model archetype implied by an auto-detected color, or null if unknown. */
export const colorArchetype = (dominantColor: string | null | undefined): string | null =>
  (dominantColor && COLOR_TO_MODEL[dominantColor.toLowerCase()]) || null

/**
 * Pick the reusable 3D model for a cat. Precedence: explicit stored/admin key >
 * pattern label > auto-detected coat color > generic default.
 */
export const resolveModelKey = (cat: { model_key?: string | null; pattern?: string | null }, dominantColor?: string | null): string => {
  if (isModelKey(cat.model_key)) return cat.model_key as string
  const byPattern = cat.pattern ? PATTERN_TO_MODEL[cat.pattern.toLowerCase()] : undefined
  if (byPattern) return byPattern
  const byColor = colorArchetype(dominantColor)
  if (byColor) return byColor
  return 'default'
}

export const modelAsset = (key: string): CatModel => CAT_MODELS[key] ?? CAT_MODELS.default
