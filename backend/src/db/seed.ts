import bcrypt from 'bcryptjs'
import { migrate, pool } from './database.js'
import { createSighting, run, upsertCollection, upsertPlacement } from './repositories.js'

await migrate()

await run(`
  TRUNCATE
    cat_identification_candidates,
    refresh_tokens,
    user_cat_collections,
    cat_placements,
    cat_sightings,
    cat_photos,
    cats,
    campus_zones,
    users
  RESTART IDENTITY CASCADE
`)

const passwordHash = await bcrypt.hash('12345678', 10)

await run("INSERT INTO users (id, username, password_hash, nickname, role) VALUES (1, 'catlover123', $1, '고양이수집가', 'user')", [passwordHash])
await run("INSERT INTO users (id, username, password_hash, nickname, role) VALUES (2, 'admin', $1, '관리자', 'admin')", [passwordHash])
await run("INSERT INTO users (id, username, password_hash, nickname, role) VALUES (3, 'campuscat', $1, '캠퍼스냥냥이', 'user')", [passwordHash])

await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (1, '중앙도서관', 'library', 36.3727, 127.3602, 180, 'building', '중앙도서관 주변')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (2, 'N1', 'building', 36.3718, 127.3611, 150, 'building', 'N1 산책로 주변')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (3, '생활관', 'dorm', 36.3733, 127.3615, 200, 'building', '생활관 언덕 주변')")

await run(
  `INSERT INTO cats
    (id, name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
   VALUES (1, '망고', '중앙도서관 계단과 벤치 근처를 좋아하는 애교 많은 캠퍼스 고양이.', 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=500&q=80', 'cheese', '사람을 잘 따름', 36.3726, 127.3603, 1, 'active')`,
)
await run(
  `INSERT INTO cats
    (id, name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
   VALUES (2, '베리', '사람을 보면 살짝 다가오다가 금방 사라지는 빠른 친구.', 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=500&q=80', 'white', '조심스럽고 빠름', 36.3717, 127.3611, 2, 'active')`,
)
await run(
  `INSERT INTO cats
    (id, name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
   VALUES (3, '밤이', '늦은 시간 기숙사 길목에서 자주 보이는 조용한 고양이.', 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&w=500&q=80', 'black', '조용하고 신중함', 36.3734, 127.3615, 3, 'active')`,
)

await seedPhoto(1, 1, 1, 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=500&q=80', 36.3726, 127.3603, 1, '2026-07-01T12:20:00+09:00', true)
await seedPhoto(2, 1, 2, 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=500&q=80', 36.3717, 127.3611, 2, '2026-07-01T18:02:00+09:00', true)
await seedPhoto(3, 3, 3, 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&w=500&q=80', 36.3734, 127.3615, 3, '2026-06-30T21:15:00+09:00', true)
await seedPhoto(4, 1, 3, 'https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?auto=format&fit=crop&w=500&q=80', 36.3736, 127.3617, 3, '2026-06-26T19:45:00+09:00', false)

await upsertCollection({ userId: 1, catId: 1, photoId: 1, seenAt: '2026-07-01T12:20:00+09:00' })
await upsertCollection({ userId: 1, catId: 3, photoId: 4, seenAt: '2026-06-26T19:45:00+09:00' })
await upsertCollection({ userId: 3, catId: 2, photoId: 2, seenAt: '2026-07-01T18:02:00+09:00' })

await upsertPlacement({ catId: 1, sourceSightingId: 1, latitude: 36.3726, longitude: 127.3603, zoneId: 1 })
await upsertPlacement({ catId: 2, sourceSightingId: 2, latitude: 36.3717, longitude: 127.3611, zoneId: 2 })
await upsertPlacement({ catId: 3, sourceSightingId: 3, latitude: 36.3734, longitude: 127.3615, zoneId: 3 })

await syncSerialSequences()

await pool.end()
console.log('Seeded PostgreSQL database. Login: catlover123 / 12345678, admin / 12345678')

async function seedPhoto(id: number, userId: number, catId: number, imageUrl: string, latitude: number, longitude: number, zoneId: number, takenAt: string, representative: boolean) {
  await run(
    `INSERT INTO cat_photos
      (id, user_id, cat_id, image_url, latitude, longitude, zone_id, taken_at, is_cat,
       cat_detection_confidence, cat_identification_confidence, is_gallery_visible, is_representative, identification_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 0.95, 0.91, TRUE, $9, 'matched')`,
    [id, userId, catId, imageUrl, latitude, longitude, zoneId, takenAt, representative],
  )
  await createSighting({ catId, userId, photoId: id, latitude, longitude, zoneId, seenAt: takenAt })
}

async function syncSerialSequences() {
  const tables = [
    'users',
    'campus_zones',
    'cats',
    'cat_photos',
    'cat_sightings',
    'cat_placements',
    'user_cat_collections',
  ]

  for (const table of tables) {
    await run(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`)
  }
}
