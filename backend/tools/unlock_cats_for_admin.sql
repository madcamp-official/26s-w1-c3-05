DO $$
DECLARE
  v_admin_id BIGINT;
  v_user_id BIGINT;
  v_cat_id BIGINT;
  v_photo_id BIGINT;
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

  -- 3. 뚱이 해금 (admin & catlover123)
  SELECT id INTO v_cat_id FROM cats WHERE name = '뚱이' LIMIT 1;
  IF v_cat_id IS NOT NULL THEN
    SELECT id INTO v_photo_id FROM cat_photos WHERE cat_id = v_cat_id LIMIT 1;
    IF v_photo_id IS NOT NULL THEN
      INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
      VALUES (v_admin_id, v_cat_id, v_photo_id, v_photo_id, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, cat_id) DO NOTHING;

      INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
      VALUES (v_user_id, v_cat_id, v_photo_id, v_photo_id, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, cat_id) DO NOTHING;
    END IF;
  END IF;

  -- 4. 페페 해금 (admin & catlover123)
  SELECT id INTO v_cat_id FROM cats WHERE name = '페페' LIMIT 1;
  IF v_cat_id IS NOT NULL THEN
    SELECT id INTO v_photo_id FROM cat_photos WHERE cat_id = v_cat_id LIMIT 1;
    IF v_photo_id IS NOT NULL THEN
      INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
      VALUES (v_admin_id, v_cat_id, v_photo_id, v_photo_id, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, cat_id) DO NOTHING;

      INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
      VALUES (v_user_id, v_cat_id, v_photo_id, v_photo_id, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, cat_id) DO NOTHING;
    END IF;
  END IF;

  -- 5. 퐁듀 해금 (admin & catlover123)
  SELECT id INTO v_cat_id FROM cats WHERE name = '퐁듀' LIMIT 1;
  IF v_cat_id IS NOT NULL THEN
    SELECT id INTO v_photo_id FROM cat_photos WHERE cat_id = v_cat_id LIMIT 1;
    IF v_photo_id IS NOT NULL THEN
      INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
      VALUES (v_admin_id, v_cat_id, v_photo_id, v_photo_id, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, cat_id) DO NOTHING;

      INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
      VALUES (v_user_id, v_cat_id, v_photo_id, v_photo_id, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, cat_id) DO NOTHING;
    END IF;
  END IF;

END $$;
