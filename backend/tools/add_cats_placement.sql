DO $$
DECLARE
  v_cat_id BIGINT;
  v_photo_id BIGINT;
  v_sighting_id BIGINT;
BEGIN
  -- ==========================================
  -- 1. 뚱이 (서측 기숙사 캣타워 - Zone ID 12)
  -- ==========================================
  SELECT id INTO v_cat_id FROM cats WHERE name = '뚱이' LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO cats (name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
    VALUES ('뚱이', '서측 기숙사 주변을 서성이는 뚱뚱하고 듬직한 고양이.', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=500&q=80', 'cheese', '먹을 것을 밝힘', 36.36715, 127.35895, 12, 'active')
    RETURNING id INTO v_cat_id;
    
    INSERT INTO cat_photos (user_id, cat_id, image_url, latitude, longitude, zone_id, taken_at, is_cat, cat_detection_confidence, cat_identification_confidence, is_gallery_visible, is_representative, identification_status)
    VALUES (1, v_cat_id, 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=500&q=80', 36.36715, 127.35895, 12, '2026-07-02T10:00:00+09:00', TRUE, 0.95, 0.91, TRUE, TRUE, 'matched')
    RETURNING id INTO v_photo_id;

    INSERT INTO cat_sightings (cat_id, user_id, photo_id, latitude, longitude, zone_id, seen_at)
    VALUES (v_cat_id, 1, v_photo_id, 36.36715, 127.35895, 12, '2026-07-02T10:00:00+09:00')
    RETURNING id INTO v_sighting_id;
    
    INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
    VALUES (1, v_cat_id, v_photo_id, v_photo_id, '2026-07-02T10:00:00+09:00')
    ON CONFLICT (user_id, cat_id) DO NOTHING;
  ELSE
    SELECT id INTO v_sighting_id FROM cat_sightings WHERE cat_id = v_cat_id LIMIT 1;
  END IF;

  INSERT INTO cat_placements (cat_id, source_sighting_id, latitude, longitude, zone_id, surface, anchor_key, height_offset_meters, movement_radius_meters, animation_key)
  VALUES (v_cat_id, v_sighting_id, 36.36715 + 0.00005, 127.35895 - 0.00005, 12, 'roof', 'roof_center', 12.00, 4.00, 'sit')
  ON CONFLICT (cat_id) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    zone_id = EXCLUDED.zone_id,
    surface = EXCLUDED.surface,
    anchor_key = EXCLUDED.anchor_key,
    height_offset_meters = EXCLUDED.height_offset_meters,
    movement_radius_meters = EXCLUDED.movement_radius_meters,
    animation_key = EXCLUDED.animation_key;

  -- ==========================================
  -- 2. 페페 (오리연못 캣타워 - Zone ID 4)
  -- ==========================================
  SELECT id INTO v_cat_id FROM cats WHERE name = '페페' LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO cats (name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
    VALUES ('페페', '오리연못 근처에서 사람들을 구경하는 시크한 턱시도 고양이.', 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=500&q=80', 'tuxedo', '도도하고 시크함', 36.36735, 127.36345, 4, 'active')
    RETURNING id INTO v_cat_id;
    
    INSERT INTO cat_photos (user_id, cat_id, image_url, latitude, longitude, zone_id, taken_at, is_cat, cat_detection_confidence, cat_identification_confidence, is_gallery_visible, is_representative, identification_status)
    VALUES (1, v_cat_id, 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=500&q=80', 36.36735, 127.36345, 4, '2026-07-02T11:15:00+09:00', TRUE, 0.95, 0.91, TRUE, TRUE, 'matched')
    RETURNING id INTO v_photo_id;

    INSERT INTO cat_sightings (cat_id, user_id, photo_id, latitude, longitude, zone_id, seen_at)
    VALUES (v_cat_id, 1, v_photo_id, 36.36735, 127.36345, 4, '2026-07-02T11:15:00+09:00')
    RETURNING id INTO v_sighting_id;
    
    INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
    VALUES (1, v_cat_id, v_photo_id, v_photo_id, '2026-07-02T11:15:00+09:00')
    ON CONFLICT (user_id, cat_id) DO NOTHING;
  ELSE
    SELECT id INTO v_sighting_id FROM cat_sightings WHERE cat_id = v_cat_id LIMIT 1;
  END IF;

  INSERT INTO cat_placements (cat_id, source_sighting_id, latitude, longitude, zone_id, surface, anchor_key, height_offset_meters, movement_radius_meters, animation_key)
  VALUES (v_cat_id, v_sighting_id, 36.36735 - 0.00004, 127.36345 + 0.00003, 4, 'ground', 'entrance', 0.00, 6.00, 'walk')
  ON CONFLICT (cat_id) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    zone_id = EXCLUDED.zone_id,
    surface = EXCLUDED.surface,
    anchor_key = EXCLUDED.anchor_key,
    height_offset_meters = EXCLUDED.height_offset_meters,
    movement_radius_meters = EXCLUDED.movement_radius_meters,
    animation_key = EXCLUDED.animation_key;

  -- ==========================================
  -- 3. 퐁듀 (생활관 언덕 - Zone ID 3)
  -- ==========================================
  SELECT id INTO v_cat_id FROM cats WHERE name = '퐁듀' LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO cats (name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
    VALUES ('퐁듀', '생활관 언덕 잔디밭에서 낮잠 자는 것을 즐기는 삼색이 고양이.', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=500&q=80', 'calico', '여유롭고 잠이 많음', 36.3733, 127.3615, 3, 'active')
    RETURNING id INTO v_cat_id;
    
    INSERT INTO cat_photos (user_id, cat_id, image_url, latitude, longitude, zone_id, taken_at, is_cat, cat_detection_confidence, cat_identification_confidence, is_gallery_visible, is_representative, identification_status)
    VALUES (1, v_cat_id, 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=500&q=80', 36.3733, 127.3615, 3, '2026-07-02T14:30:00+09:00', TRUE, 0.95, 0.91, TRUE, TRUE, 'matched')
    RETURNING id INTO v_photo_id;

    INSERT INTO cat_sightings (cat_id, user_id, photo_id, latitude, longitude, zone_id, seen_at)
    VALUES (v_cat_id, 1, v_photo_id, 36.3733, 127.3615, 3, '2026-07-02T14:30:00+09:00')
    RETURNING id INTO v_sighting_id;
    
    INSERT INTO user_cat_collections (user_id, cat_id, discovery_photo_id, representative_photo_id, first_discovered_at)
    VALUES (1, v_cat_id, v_photo_id, v_photo_id, '2026-07-02T14:30:00+09:00')
    ON CONFLICT (user_id, cat_id) DO NOTHING;
  ELSE
    SELECT id INTO v_sighting_id FROM cat_sightings WHERE cat_id = v_cat_id LIMIT 1;
  END IF;

  INSERT INTO cat_placements (cat_id, source_sighting_id, latitude, longitude, zone_id, surface, anchor_key, height_offset_meters, movement_radius_meters, animation_key)
  VALUES (v_cat_id, v_sighting_id, 36.3733 + 0.00002, 127.3615 + 0.00004, 3, 'roof', 'roof_edge', 10.00, 3.00, 'sleep')
  ON CONFLICT (cat_id) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    zone_id = EXCLUDED.zone_id,
    surface = EXCLUDED.surface,
    anchor_key = EXCLUDED.anchor_key,
    height_offset_meters = EXCLUDED.height_offset_meters,
    movement_radius_meters = EXCLUDED.movement_radius_meters,
    animation_key = EXCLUDED.animation_key;

END $$;
