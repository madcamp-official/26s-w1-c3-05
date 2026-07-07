export interface BuildingModel {
  key: string
  label: string
  assetUrl: string
  scale: number
}

// "building" map objects are cat towers — the reusable models are the color
// variants under frontend/public/models/tower/, not literal building models.
// Facing (rotationY) lives on campus_zones per-instance, not here — see schema.sql.
export const BUILDING_MODELS: Record<string, BuildingModel> = {
  blue: { key: 'blue', label: '캣타워 (블루)', assetUrl: '/models/tower/cat_tower_blue_01_muted_unlit.glb', scale: 1 },
  green: { key: 'green', label: '캣타워 (그린)', assetUrl: '/models/tower/cat_tower_green_01_muted_unlit.glb', scale: 1 },
  pink: { key: 'pink', label: '캣타워 (핑크)', assetUrl: '/models/tower/cat_tower_pink_01_muted_unlit.glb', scale: 1 },
  purple: { key: 'purple', label: '캣타워 (퍼플)', assetUrl: '/models/tower/cat_tower_purple_01_muted_unlit.glb', scale: 1 },
  yellow: { key: 'yellow', label: '캣타워 (옐로우)', assetUrl: '/models/tower/cat_tower_yellow_01_muted_unlit.glb', scale: 1 },
  gray_wood: { key: 'gray_wood', label: '캣타워 (그레이 우드)', assetUrl: '/models/tower/cat_tower_gray_wood_01_muted_unlit.glb', scale: 1 },
  default: { key: 'default', label: '캣타워 (기본)', assetUrl: '/models/tower/cat_tower_blue_01_muted_unlit.glb', scale: 1 },
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
