DO $$
DECLARE
  v_admin_id BIGINT;
  v_user_id BIGINT;
  v_cat_id BIGINT;
  v_photo_id BIGINT;
  v_cat_name VARCHAR(50);
  v_cat_names TEXT[] := ARRAY['망고', '베리', '밤이', '뚱이', '페페', '퐁듀'];
BEGIN
  -- 1. admin 계정 확인 및 생성 (없으면 생성, 비밀번호: 12345678)
  SELECT id INTO v_admin_id FROM users WHERE username = 'admin@example.com' LIMIT 1;
  IF v_admin_id IS NULL THEN
    INSERT INTO users (username, password_hash, nickname, role)
    VALUES ('admin@example.com', '$2b$10$TGOnpKrBye2hNI3WXUq78eCjnfp336wVu8o7Dj3hGKgYCBsi74agO', '관리자', 'admin')
    RETURNING id INTO v_admin_id;
  END IF;

  -- 2. catlover123 계정 확인 및 생성 (없으면 생성, 비밀번호: 12345678)
  SELECT id INTO v_user_id FROM users WHERE username = 'catlover123@example.com' LIMIT 1;
  IF v_user_id IS NULL THEN
    INSERT INTO users (username, password_hash, nickname, role)
    VALUES ('catlover123@example.com', '$2b$10$TGOnpKrBye2hNI3WXUq78eCjnfp336wVu8o7Dj3hGKgYCBsi74agO', '고양이수집가', 'user')
    RETURNING id INTO v_user_id;
  END IF;

  -- 3. 모든 고양이 이름을 기준으로 조회하여 admin과 catlover123 계정에 목격담(sighting) 및 도감 컬렉션(collection) 생성
  FOREACH v_cat_name IN ARRAY v_cat_names LOOP
    -- 고양이 이름으로 ID 조회 (실제 DB 상의 ID가 시드와 다를 수 있으므로 안전하게 이름으로 찾음)
    SELECT id INTO v_cat_id FROM cats WHERE name = v_cat_name LIMIT 1;
    
    IF v_cat_id IS NOT NULL THEN
      -- 각 고양이의 대표 사진 ID 조회
      SELECT id INTO v_photo_id FROM cat_photos WHERE cat_id = v_cat_id AND is_representative = TRUE LIMIT 1;
      
      IF v_photo_id IS NOT NULL THEN
        -- 도감 컬렉션 생성 (admin)
        INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
        VALUES (v_admin_id, v_cat_id, v_photo_id, v_photo_id, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, cat_id) DO NOTHING;

        -- 도감 컬렉션 생성 (catlover123)
        INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
        VALUES (v_user_id, v_cat_id, v_photo_id, v_photo_id, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, cat_id) DO NOTHING;

        -- 지도 마커용 목격담 생성 (admin)
        IF NOT EXISTS (SELECT 1 FROM cat_sightings WHERE cat_id = v_cat_id AND user_id = v_admin_id) THEN
          INSERT INTO cat_sightings (cat_id, user_id, photo_id, latitude, longitude, zone_id, seen_at)
          SELECT v_cat_id, v_admin_id, v_photo_id, latitude, longitude, zone_id, taken_at
          FROM cat_photos WHERE id = v_photo_id;
        END IF;

        -- 지도 마커용 목격담 생성 (catlover123)
        IF NOT EXISTS (SELECT 1 FROM cat_sightings WHERE cat_id = v_cat_id AND user_id = v_user_id) THEN
          INSERT INTO cat_sightings (cat_id, user_id, photo_id, latitude, longitude, zone_id, seen_at)
          SELECT v_cat_id, v_user_id, v_photo_id, latitude, longitude, zone_id, taken_at
          FROM cat_photos WHERE id = v_photo_id;
        END IF;
      END IF;
    END IF;
  END LOOP;

END $$;
