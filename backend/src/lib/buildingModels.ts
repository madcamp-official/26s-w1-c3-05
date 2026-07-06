export interface BuildingModel {
  key: string
  label: string
  assetUrl: string
  scale: number
  rotationY: number
}

export const BUILDING_MODELS: Record<string, BuildingModel> = {
  library: { key: 'library', label: 'Library', assetUrl: '/models/buildings/library.glb', scale: 1, rotationY: 0 },
  n1: { key: 'n1', label: 'N1', assetUrl: '/models/buildings/n1.glb', scale: 1, rotationY: 0 },
  dorm: { key: 'dorm', label: 'Dormitory', assetUrl: '/models/buildings/dorm.glb', scale: 1, rotationY: 0 },
  building: { key: 'building', label: 'Building', assetUrl: '/models/buildings/building.glb', scale: 1, rotationY: 0 },
  default: { key: 'default', label: 'Campus object', assetUrl: '/models/buildings/default.glb', scale: 1, rotationY: 0 },
}

const normalizeKey = (value: string | null | undefined) =>
  value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const resolveBuildingModelKey = (input: { name?: string | null; type?: string | null; model_type?: string | null }) => {
  const candidates = [normalizeKey(input.name), normalizeKey(input.type), normalizeKey(input.model_type)]
  return candidates.find((key): key is string => Boolean(key && key in BUILDING_MODELS)) ?? 'default'
}

export const buildingModelAsset = (key: string): BuildingModel => BUILDING_MODELS[key] ?? BUILDING_MODELS.default
