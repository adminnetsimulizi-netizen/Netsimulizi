-- Net Simulizi core schema outline
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(80) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('reader','author','editor','admin','super_admin')),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stories (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  synopsis TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  is_promoted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chapters (
  id UUID PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES stories(id),
  chapter_number INT NOT NULL,
  title VARCHAR(255),
  content_ciphertext TEXT NOT NULL,
  price_coins INT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ownership_declarations (
  id UUID PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES stories(id),
  author_id UUID NOT NULL REFERENCES users(id),
  declaration_text TEXT NOT NULL,
  terms_version VARCHAR(40) NOT NULL,
  accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash TEXT,
  session_id TEXT
);

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  story_id UUID REFERENCES stories(id),
  chapter_id UUID REFERENCES chapters(id),
  type VARCHAR(40) NOT NULL,
  gross_amount_tsh BIGINT NOT NULL DEFAULT 0,
  author_share_tsh BIGINT NOT NULL DEFAULT 0,
  platform_share_tsh BIGINT NOT NULL DEFAULT 0,
  split_code VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE withdrawal_requests (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES users(id),
  amount_tsh BIGINT NOT NULL CHECK (amount_tsh >= 50000),
  payment_method VARCHAR(50) NOT NULL,
  destination_reference TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE promotion_requests (
  id UUID PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES stories(id),
  author_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_complaints (
  id UUID PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES stories(id),
  complainant_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  claim TEXT NOT NULL,
  evidence_reference TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
