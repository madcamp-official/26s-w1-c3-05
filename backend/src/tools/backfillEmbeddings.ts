import 'dotenv/config'
import { pool, query } from '../db/database.js'
import { findMatchedPhotosMissingEmbedding, insertEmbedding, setCatModelKeyIfNull } from '../db/repositories.js'
import { resolveModelKey } from '../lib/catModels.js'
import type { CatRow } from '../db/types.js'

// The vision service reports which model it used; keep this in sync with it so the
// "missing embedding" filter and the stored rows agree (see IDENTIFIER_MODEL_NAME).
const MODEL_NAME = process.env.EMBEDDING_MODEL_NAME ?? 'megadescriptor-t-224'
const visionBaseUrl = (process.env.VISION_SERVICE_URL ?? 'http://localhost:8001').replace(/\/$/, '')
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`

const resolveImageUrl = (imageUrl: string) =>
  /^https?:\/\//i.test(imageUrl) ? imageUrl : new URL(imageUrl, publicBaseUrl).toString()

const analyze = async (imageUrl: string) => {
  const response = await fetch(`${visionBaseUrl}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl: resolveImageUrl(imageUrl), includeCrop: false }),
  })
  if (!response.ok) throw new Error(`/analyze failed with ${response.status}`)
  return (await response.json()) as {
    isCat?: boolean
    modelName?: string
    embedding?: number[]
    qualityScore?: number | null
    dominantColor?: string | null
  }
}

// Phase 1: embeddings for matched photos that don't have one yet.
const photos = await findMatchedPhotosMissingEmbedding(MODEL_NAME)
console.log(`Phase 1: embedding ${photos.length} matched photos (model=${MODEL_NAME}).`)

let embedded = 0
let skipped = 0

for (const photo of photos) {
  try {
    const analysis = await analyze(photo.image_url)
    if (!analysis.embedding || analysis.embedding.length === 0) {
      skipped += 1
      console.warn(`  photo ${photo.id}: no embedding returned (isCat=${analysis.isCat})`)
      continue
    }
    await insertEmbedding({
      photoId: photo.id,
      catId: photo.cat_id,
      modelName: analysis.modelName ?? MODEL_NAME,
      embedding: analysis.embedding,
      cropImageUrl: null,
      qualityScore: analysis.qualityScore ?? null,
    })
    embedded += 1
    console.log(`  photo ${photo.id} (cat ${photo.cat_id}) embedded.`)
  } catch (error) {
    skipped += 1
    console.error(`  photo ${photo.id}: ${(error as Error).message}`)
  }
}

// Phase 2: assign a 3D model_key to every cat that lacks one. Cats with a pattern
// resolve from it directly; the rest need one crop analyzed for its coat color.
const unkeyed = (await query<CatRow>("SELECT * FROM cats WHERE model_key IS NULL AND status <> 'merged'")).rows
console.log(`\nPhase 2: assigning model_key to ${unkeyed.length} cats.`)

let modelKeyed = 0

for (const cat of unkeyed) {
  try {
    let modelKey = resolveModelKey({ model_key: null, pattern: cat.pattern })
    // Only cats without a usable pattern need color inference from an image.
    if (modelKey === 'default') {
      const imageUrl = cat.representative_photo_url ?? (await query<{ image_url: string }>(
        "SELECT image_url FROM cat_photos WHERE cat_id = $1 AND is_cat = TRUE ORDER BY is_representative DESC, id ASC LIMIT 1",
        [cat.id],
      )).rows[0]?.image_url
      if (imageUrl) {
        const analysis = await analyze(imageUrl)
        modelKey = resolveModelKey({ model_key: null, pattern: cat.pattern }, analysis.dominantColor)
      }
    }
    await setCatModelKeyIfNull(Number(cat.id), modelKey)
    modelKeyed += 1
    console.log(`  cat ${cat.id} (${cat.name ?? 'unnamed'}, pattern=${cat.pattern ?? 'none'}) -> ${modelKey}`)
  } catch (error) {
    console.error(`  cat ${cat.id}: ${(error as Error).message}`)
  }
}

await pool.end()
console.log(`\nDone. Embedded ${embedded}, skipped ${skipped}; model_key set for ${modelKeyed} cats.`)
