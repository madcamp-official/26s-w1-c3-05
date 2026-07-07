// 3D model catalog. Similar-looking cats reuse the same model, keyed by a small
// set of coat archetypes. Asset paths point at frontend files under /models/cats.
export interface CatModel {
  key: string
  label: string
  assetUrl: string
  scale: number
}

// The 11 coat-type models (+ generic default). Asset files live under
// frontend/public/models/cats/<key>.glb — rename these paths if the actual GLB
// filenames differ.
export const CAT_MODELS: Record<string, CatModel> = {
  calico: { key: 'calico', label: '삼색', assetUrl: '/models/cats/cat_cute_calico_01.glb', scale: 1 },
  gray: { key: 'gray', label: '회색', assetUrl: '/models/cats/cat_cute_gray_01.glb', scale: 1 },
  cheese_tabby: { key: 'cheese_tabby', label: '치즈 태비', assetUrl: '/models/cats/cat_cute_cheese_01.glb', scale: 1 },
  bicolor: { key: 'bicolor', label: '하양/검정', assetUrl: '/models/cats/cat_cute_mask_01.glb', scale: 1 },
  orange: { key: 'orange', label: '오렌지', assetUrl: '/models/cats/cat_cute_orange_01.glb', scale: 1 },
  oatmeal: { key: 'oatmeal', label: '귀리', assetUrl: '/models/cats/cat_cute_orange_01.glb', scale: 1 },
  gray_tabby: { key: 'gray_tabby', label: '회색 태비', assetUrl: '/models/cats/cat_cute_tabby_gray_01.glb', scale: 1 },
  orange_tabby: { key: 'orange_tabby', label: '오렌지 태비', assetUrl: '/models/cats/cat_cute_tabby_orange_01.glb', scale: 1 },
  tuxedo: { key: 'tuxedo', label: '턱시도', assetUrl: '/models/cats/cat_cute_tuxedo_01.glb', scale: 1 },
  white: { key: 'white', label: '흰색', assetUrl: '/models/cats/cat_cute_white_01.glb', scale: 1 },
  black: { key: 'black', label: '까만', assetUrl: '/models/cats/cat_cute_black_01.glb', scale: 1 },
  default: { key: 'default', label: '기본 고양이', assetUrl: '/models/cat.glb', scale: 1 },
  // Backward-compat aliases for values that may already be stored in the DB.
  tricolor: { key: 'tricolor', label: '삼색', assetUrl: '/models/cats/cat_cute_calico_01.glb', scale: 1 },
  brown_tabby: { key: 'brown_tabby', label: '갈색 태비', assetUrl: '/models/cats/cat_cute_cheese_01.glb', scale: 1 },
}

// 아직 발견하지 않은 고양이를 가리는 수풀 모델.
export const BUSH_MODEL: CatModel = { key: 'bush', label: '수풀', assetUrl: '/models/bush_01.glb', scale: 1 }

// Human/admin-provided pattern label -> model key. Covers common English and
// Korean labels. Tabby variants are only reachable here (and via the finder),
// never from auto colour detection — stripes can't be told from solid coats
// reliably without a trained model.
const PATTERN_TO_MODEL: Record<string, string> = {
  // orange family
  orange: 'orange',
  ginger: 'orange',
  오렌지: 'orange',
  cheese: 'cheese_tabby',
  치즈: 'cheese_tabby',
  cheese_tabby: 'cheese_tabby',
  치즈태비: 'cheese_tabby',
  orange_tabby: 'orange_tabby',
  오렌지태비: 'orange_tabby',
  tabby: 'cheese_tabby',
  mackerel: 'cheese_tabby',
  brown: 'cheese_tabby',
  brown_tabby: 'cheese_tabby',
  // gray family
  gray: 'gray',
  grey: 'gray',
  회색: 'gray',
  gray_tabby: 'gray_tabby',
  grey_tabby: 'gray_tabby',
  회색태비: 'gray_tabby',
  // black / white / bicolor
  black: 'black',
  검정: 'black',
  까만: 'black',
  white: 'white',
  흰색: 'white',
  tuxedo: 'tuxedo',
  턱시도: 'tuxedo',
  bicolor: 'bicolor',
  '하양/검정': 'bicolor',
  흑백: 'bicolor',
  // multi-colour
  calico: 'calico',
  tricolor: 'calico',
  삼색: 'calico',
  tortoiseshell: 'calico',
  tortie: 'calico',
  // cream / oatmeal
  oatmeal: 'oatmeal',
  cream: 'oatmeal',
  귀리: 'oatmeal',
}

// Auto-detected coat label from the vision service -> model key.
// Only the labels the classifier can emit (see detector.dominant_color).
const COLOR_TO_MODEL: Record<string, string> = {
  calico: 'calico',
  tuxedo: 'tuxedo',
  bicolor: 'bicolor',
  orange: 'orange',
  oatmeal: 'oatmeal',
  gray: 'gray',
  white: 'white',
  black: 'black',
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
  if (isModelKey(cat.model_key)) return cat.model_key
  const byPattern = cat.pattern ? PATTERN_TO_MODEL[cat.pattern.toLowerCase()] : undefined
  if (byPattern) return byPattern
  const byColor = colorArchetype(dominantColor)
  if (byColor) return byColor
  return 'default'
}

export const modelAsset = (key: string): CatModel => CAT_MODELS[key] ?? CAT_MODELS.default
