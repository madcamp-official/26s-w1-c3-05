CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(50) NOT NULL,
  profile_image_url TEXT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Email used for signup verification. Nullable so pre-existing rows are unaffected;
-- Postgres unique indexes treat NULLs as distinct, so multiple legacy rows without
-- an email can coexist.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Short-lived codes emailed to prove ownership of an address before signup completes.
CREATE TABLE IF NOT EXISTS email_verifications (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email_created_at ON email_verifications(email, created_at DESC);

CREATE TABLE IF NOT EXISTS campus_zones (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  radius_meters INT NOT NULL,
  model_type VARCHAR(50) NULL,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cats (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(50) NULL,
  description TEXT NULL,
  representative_photo_id BIGINT NULL,
  representative_photo_url TEXT NULL,
  first_seen_at TIMESTAMPTZ NULL,
  last_seen_at TIMESTAMPTZ NULL,
  pattern VARCHAR(30) NULL,
  personality TEXT NULL,
  default_latitude DECIMAL(10, 7) NULL,
  default_longitude DECIMAL(10, 7) NULL,
  default_zone_id BIGINT NULL REFERENCES campus_zones(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_photos (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  cat_id BIGINT NULL REFERENCES cats(id),
  image_url TEXT NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  zone_id BIGINT NULL REFERENCES campus_zones(id),
  taken_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_cat BOOLEAN NOT NULL DEFAULT TRUE,
  cat_detection_confidence DECIMAL(5, 4) NULL,
  cat_identification_confidence DECIMAL(5, 4) NULL,
  is_gallery_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_representative BOOLEAN NOT NULL DEFAULT FALSE,
  identification_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_sightings (
  id BIGSERIAL PRIMARY KEY,
  cat_id BIGINT NOT NULL REFERENCES cats(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  photo_id BIGINT NOT NULL REFERENCES cat_photos(id),
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  zone_id BIGINT NULL REFERENCES campus_zones(id),
  seen_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_placements (
  id BIGSERIAL PRIMARY KEY,
  cat_id BIGINT NOT NULL UNIQUE REFERENCES cats(id),
  source_sighting_id BIGINT NULL REFERENCES cat_sightings(id),
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  zone_id BIGINT NULL REFERENCES campus_zones(id),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_cat_collections (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  cat_id BIGINT NOT NULL REFERENCES cats(id),
  first_discovered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NULL,
  discovery_photo_id BIGINT NULL REFERENCES cat_photos(id),
  representative_photo_id BIGINT NULL REFERENCES cat_photos(id),
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, cat_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_identification_candidates (
  id BIGSERIAL PRIMARY KEY,
  photo_id BIGINT NOT NULL REFERENCES cat_photos(id),
  cat_id BIGINT NOT NULL REFERENCES cats(id),
  image_similarity_score DECIMAL(5, 4) NOT NULL,
  location_score DECIMAL(5, 4) NULL,
  final_score DECIMAL(5, 4) NOT NULL,
  rank_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cat_photos_user_taken_at ON cat_photos(user_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_cat_photos_cat_taken_at ON cat_photos(cat_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_cat_sightings_cat_seen_at ON cat_sightings(cat_id, seen_at);
CREATE INDEX IF NOT EXISTS idx_cat_sightings_user_created_at ON cat_sightings(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cat_placements_updated_at ON cat_placements(updated_at);
