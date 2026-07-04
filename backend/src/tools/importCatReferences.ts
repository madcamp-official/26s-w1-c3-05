import 'dotenv/config'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { pool, query } from '../db/database.js'
import { upsertPlacement } from '../db/repositories.js'
import type { CatPhotoRow, CatRow, UserRow } from '../db/types.js'

const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const defaultLatitude = Number(process.env.REFERENCE_DEFAULT_LATITUDE ?? 36.3727)
const defaultLongitude = Number(process.env.REFERENCE_DEFAULT_LONGITUDE ?? 127.3602)
const defaultZoneId = process.env.REFERENCE_DEFAULT_ZONE_ID ? Number(process.env.REFERENCE_DEFAULT_ZONE_ID) : null

const modelDataDir = await resolveModelDataDir()
const uploadsDir = resolve(process.cwd(), 'uploads', 'reference-cats')
const uploader = await findUploader()
const folders = await listCatFolders(modelDataDir)

let importedPhotoCount = 0

for (const folder of folders) {
  const catName = basename(folder)
  const cat = await findOrCreateCat(catName)
  const imageFiles = await listImageFiles(folder)

  for (const [index, sourcePath] of imageFiles.entries()) {
    const imageUrl = await copyReferenceImage(catName, sourcePath, index + 1)
    const photo = await findOrCreatePhoto({
      cat,
      imageUrl,
      isRepresentative: index === 0,
    })

    if (index === 0) {
      await setRepresentativePhoto(cat.id, photo.id, imageUrl)
    }

    importedPhotoCount += 1
  }

  await upsertPlacement({
    catId: cat.id,
    latitude: defaultLatitude,
    longitude: defaultLongitude,
    zoneId: defaultZoneId,
  })
}

await pool.end()

console.log(`Imported ${importedPhotoCount} reference photos for ${folders.length} cats from ${modelDataDir}`)

async function resolveModelDataDir() {
  const candidates = [
    process.env.MODEL_DATA_DIR,
    resolve(process.cwd(), '..', 'assets', 'model_data'),
    resolve(process.cwd(), '..', '..', 'week1', 'assets', 'model_data'),
    resolve(process.cwd(), 'assets', 'model_data'),
  ].filter((path): path is string => Boolean(path))

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate)
      if (info.isDirectory()) {
        return candidate
      }
    } catch {
      // Try the next likely local path.
    }
  }

  throw new Error(`MODEL_DATA_DIR not found. Tried: ${candidates.join(', ')}`)
}

async function findUploader() {
  const preferredUsername = process.env.REFERENCE_IMPORT_USERNAME ?? 'admin'
  const preferred = await query<UserRow>('SELECT * FROM users WHERE username = $1 LIMIT 1', [preferredUsername])
  if (preferred.rows[0]) {
    return preferred.rows[0]
  }

  const fallback = await query<UserRow>("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
  if (fallback.rows[0]) {
    return fallback.rows[0]
  }

  const anyUser = await query<UserRow>('SELECT * FROM users ORDER BY id ASC LIMIT 1')
  if (anyUser.rows[0]) {
    return anyUser.rows[0]
  }

  throw new Error('No uploader user found. Run npm run db:seed or create a user first.')
}

async function listCatFolders(root: string) {
  const entries = await readdir(root, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .sort()
}

async function listImageFiles(folder: string) {
  const entries = await readdir(folder, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase()))
    .map((entry) => join(folder, entry.name))
    .sort()
}

async function findOrCreateCat(name: string) {
  const existing = await query<CatRow>('SELECT * FROM cats WHERE name = $1 ORDER BY id ASC LIMIT 1', [name])
  if (existing.rows[0]) {
    return existing.rows[0]
  }

  const created = await query<CatRow>(
    `INSERT INTO cats
      (name, description, default_latitude, default_longitude, default_zone_id, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING *`,
    [name, `${name} reference dataset`, defaultLatitude, defaultLongitude, defaultZoneId],
  )
  return created.rows[0]
}

async function copyReferenceImage(catName: string, sourcePath: string, index: number) {
  const targetDir = join(uploadsDir, catName)
  await mkdir(targetDir, { recursive: true })

  const extension = normalizeExtension(extname(sourcePath))
  const filename = `${catName}-${String(index).padStart(3, '0')}${extension}`
  const targetPath = join(targetDir, filename)

  await copyFile(sourcePath, targetPath)
  return `/uploads/reference-cats/${catName}/${filename}`
}

async function findOrCreatePhoto(input: { cat: CatRow; imageUrl: string; isRepresentative: boolean }) {
  const existing = await query<CatPhotoRow>('SELECT * FROM cat_photos WHERE image_url = $1 LIMIT 1', [input.imageUrl])
  if (existing.rows[0]) {
    return existing.rows[0]
  }

  const created = await query<CatPhotoRow>(
    `INSERT INTO cat_photos
      (user_id, cat_id, image_url, latitude, longitude, zone_id, taken_at, is_cat,
       cat_detection_confidence, cat_identification_confidence, is_gallery_visible, is_representative, identification_status)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, TRUE, 1.0, 1.0, TRUE, $7, 'matched')
     RETURNING *`,
    [uploader.id, input.cat.id, input.imageUrl, input.cat.default_latitude ?? defaultLatitude, input.cat.default_longitude ?? defaultLongitude, input.cat.default_zone_id ?? defaultZoneId, input.isRepresentative],
  )
  return created.rows[0]
}

async function setRepresentativePhoto(catId: number, photoId: number, imageUrl: string) {
  await query(
    `UPDATE cats
     SET representative_photo_id = COALESCE(representative_photo_id, $1),
         representative_photo_url = COALESCE(representative_photo_url, $2),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [photoId, imageUrl, catId],
  )
}

function normalizeExtension(extension: string) {
  const lower = extension.toLowerCase()
  return lower === '.jpeg' ? '.jpg' : lower
}
