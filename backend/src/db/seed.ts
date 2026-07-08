import bcrypt from 'bcryptjs'
import { migrate, pool } from './database.js'
import { applyRandomOffset, createSighting, run, upsertCollection, upsertPlacement } from './repositories.js'

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

await run("INSERT INTO users (id, username, password_hash, nickname, role) VALUES (1, 'catlover123@example.com', $1, '고양이수집가', 'user')", [passwordHash])
await run("INSERT INTO users (id, username, password_hash, nickname, role) VALUES (2, 'admin@example.com', $1, '관리자', 'admin')", [passwordHash])
await run("INSERT INTO users (id, username, password_hash, nickname, role) VALUES (3, 'campuscat@example.com', $1, '캠퍼스냥냥이', 'user')", [passwordHash])

// type은 캣타워 3D 모델 색상 키(blue/green/pink/purple/yellow/gray_wood)로 지정한다 —
// resolveBuildingModelKey()가 이 값으로 실제 에셋을 찾는다 (lib/buildingModels.ts 참고).
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (1, '학생회관', 'blue', 36.3727, 127.3602, 180, 'building', '학생회관 주변')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (2, '본관', 'green', 36.3718, 127.3611, 150, 'building', '본관 산책로 주변')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (3, '생활관', 'pink', 36.3733, 127.3615, 200, 'building', '생활관 언덕 주변')")

// 캠퍼스 전역 캣타워 배치 (실제 KAIST 좌표 기준).
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (4, '오리연못 캣타워', 'blue', 36.36735, 127.36345, 60, 'building', '오리연못 / E4 KI빌딩 근처 — 물가+산책로라 고양이 배치에 잘 맞음')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (5, '정문 캣타워', 'green', 36.36595, 127.36375, 60, 'building', '정문 안쪽 / E1 근처 — 첫 접속 시 랜드마크')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (6, '학술문화관 캣타워', 'pink', 36.36915, 127.36345, 60, 'building', '학술문화관 E9 / 학생회관 주변 — 유동인구 많은 메인 캣타워')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (7, '자연과학동 캣타워', 'purple', 36.37025, 127.36410, 60, 'building', '자연과학동 E11 주변 — 중앙부-동측 연결점')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (8, '대강당 캣타워', 'yellow', 36.37145, 127.36370, 60, 'building', '대강당 E15 근처 — 큰 건물 옆 광장')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (9, '스포츠컴플렉스 캣타워', 'gray_wood', 36.37195, 127.36230, 60, 'building', '스포츠 컴플렉스 N3 근처 — 중앙 북쪽 허브')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (10, '학생식당 캣타워', 'blue', 36.37370, 127.36070, 60, 'building', 'N11 학생식당 / N12 학생회관 근처 — 북측 생활권')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (11, 'IT융합빌딩 캣타워', 'green', 36.37410, 127.36590, 60, 'building', 'N1 IT융합빌딩 근처 — 동문 쪽 접근 지점')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (12, '서측 기숙사 캣타워', 'pink', 36.36715, 127.35895, 60, 'building', 'W2 서측 기숙사/식당 근처 — 서측 생활권 핵심')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (13, '노천극장 캣타워', 'purple', 36.37070, 127.35745, 60, 'building', 'W9 노천극장 / 동산길 주변 — 언덕/숲 느낌')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (14, '기숙사 캣타워', 'yellow', 36.37175, 127.35510, 60, 'building', 'W5/W6 기숙사 밀집 구역 — 반복 방문 유도')")
await run("INSERT INTO campus_zones (id, name, type, latitude, longitude, radius_meters, model_type, description) VALUES (15, '전산학부동 캣타워', 'gray_wood', 36.36785, 127.36625, 60, 'building', 'E17 전산학부동 근처 — 탁 트인 이벤트 타워')")

await run(
  `INSERT INTO cats
    (id, name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
   VALUES (1, '망고', '학생회관 계단과 벤치 근처를 좋아하는 애교 많은 캠퍼스 고양이.', 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=500&q=80', 'cheese', '사람을 잘 따름', 36.3726, 127.3603, 1, 'active')`,
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
await run(
  `INSERT INTO cats
    (id, name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
   VALUES (4, '뚱이', '서측 기숙사 주변을 서성이는 뚱뚱하고 듬직한 고양이.', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=500&q=80', 'cheese', '먹을 것을 밝힘', 36.36715, 127.35895, 12, 'active')`,
)
await run(
  `INSERT INTO cats
    (id, name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
   VALUES (5, '페페', '오리연못 근처에서 사람들을 구경하는 시크한 턱시도 고양이.', 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=500&q=80', 'tuxedo', '도도하고 시크함', 36.36735, 127.36345, 4, 'active')`,
)
await run(
  `INSERT INTO cats
    (id, name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
   VALUES (6, '퐁듀', '생활관 언덕 잔디밭에서 낮잠 자는 것을 즐기는 삼색이 고양이.', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=500&q=80', 'calico', '여유롭고 잠이 많음', 36.3733, 127.3615, 3, 'active')`,
)

await seedPhoto(1, 1, 1, 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=500&q=80', 36.3726, 127.3603, 1, '2026-07-01T12:20:00+09:00', true)
await seedPhoto(2, 1, 2, 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=500&q=80', 36.3717, 127.3611, 2, '2026-07-01T18:02:00+09:00', true)
await seedPhoto(3, 3, 3, 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&w=500&q=80', 36.3734, 127.3615, 3, '2026-06-30T21:15:00+09:00', true)
await seedPhoto(4, 1, 3, 'https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?auto=format&fit=crop&w=500&q=80', 36.3736, 127.3617, 3, '2026-06-26T19:45:00+09:00', false)
await seedPhoto(5, 1, 4, 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=500&q=80', 36.36715, 127.35895, 12, '2026-07-02T10:00:00+09:00', true)
await seedPhoto(6, 1, 5, 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=500&q=80', 36.36735, 127.36345, 4, '2026-07-02T11:15:00+09:00', true)
await seedPhoto(7, 1, 6, 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=500&q=80', 36.3733, 127.3615, 3, '2026-07-02T14:30:00+09:00', true)

await upsertCollection({ userId: 1, catId: 1, photoId: 1, seenAt: '2026-07-01T12:20:00+09:00' })
await upsertCollection({ userId: 1, catId: 3, photoId: 4, seenAt: '2026-06-26T19:45:00+09:00' })
await upsertCollection({ userId: 3, catId: 2, photoId: 2, seenAt: '2026-07-01T18:02:00+09:00' })
await upsertCollection({ userId: 1, catId: 4, photoId: 5, seenAt: '2026-07-02T10:00:00+09:00' })
await upsertCollection({ userId: 1, catId: 5, photoId: 6, seenAt: '2026-07-02T11:15:00+09:00' })
await upsertCollection({ userId: 1, catId: 6, photoId: 7, seenAt: '2026-07-02T14:30:00+09:00' })

  const offset1 = applyRandomOffset(36.3726, 127.3603)
  await upsertPlacement({ catId: 1, sourceSightingId: 1, latitude: offset1.latitude, longitude: offset1.longitude, zoneId: 1 })
  const offset2 = applyRandomOffset(36.3717, 127.3611)
  await upsertPlacement({ catId: 2, sourceSightingId: 2, latitude: offset2.latitude, longitude: offset2.longitude, zoneId: 2 })
  const offset3 = applyRandomOffset(36.3734, 127.3615)
  await upsertPlacement({ catId: 3, sourceSightingId: 3, latitude: offset3.latitude, longitude: offset3.longitude, zoneId: 3 })
  const offset4 = applyRandomOffset(36.36715, 127.35895)
  await upsertPlacement({ catId: 4, sourceSightingId: 5, latitude: offset4.latitude, longitude: offset4.longitude, zoneId: 12 })
  const offset5 = applyRandomOffset(36.36735, 127.36345)
  await upsertPlacement({ catId: 5, sourceSightingId: 6, latitude: offset5.latitude, longitude: offset5.longitude, zoneId: 4 })
  const offset6 = applyRandomOffset(36.3733, 127.3615)
  await upsertPlacement({ catId: 6, sourceSightingId: 7, latitude: offset6.latitude, longitude: offset6.longitude, zoneId: 3 })

await run("UPDATE cat_placements SET surface = 'roof', anchor_key = 'roof_center', height_offset_meters = 12, movement_radius_meters = 5, animation_key = 'sit' WHERE cat_id = 1")
await run("UPDATE cat_placements SET surface = 'ground', anchor_key = 'entrance', height_offset_meters = 0, movement_radius_meters = 7, animation_key = 'walk' WHERE cat_id = 2")
await run("UPDATE cat_placements SET surface = 'roof', anchor_key = 'roof_edge', height_offset_meters = 10, movement_radius_meters = 4, animation_key = 'sleep' WHERE cat_id = 3")
await run("UPDATE cat_placements SET surface = 'roof', anchor_key = 'roof_center', height_offset_meters = 12, movement_radius_meters = 4, animation_key = 'sit' WHERE cat_id = 4")
await run("UPDATE cat_placements SET surface = 'ground', anchor_key = 'entrance', height_offset_meters = 0, movement_radius_meters = 6, animation_key = 'walk' WHERE cat_id = 5")
await run("UPDATE cat_placements SET surface = 'roof', anchor_key = 'roof_edge', height_offset_meters = 10, movement_radius_meters = 3, animation_key = 'sleep' WHERE cat_id = 6")

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
