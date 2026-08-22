CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 username VARCHAR(80) UNIQUE NOT NULL,
 email VARCHAR(255) UNIQUE,
 password_hash TEXT NOT NULL,
 role VARCHAR(20) NOT NULL CHECK(role IN ('reader','author','editor','admin','super_admin')),
 status VARCHAR(20) NOT NULL DEFAULT 'active',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS languages (
 code VARCHAR(10) PRIMARY KEY,
 name VARCHAR(80) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS categories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 language_code VARCHAR(10) NOT NULL REFERENCES languages(code),
 name VARCHAR(120) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS stories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id UUID NOT NULL REFERENCES users(id),
 language_code VARCHAR(10) NOT NULL REFERENCES languages(code),
 title VARCHAR(255) NOT NULL,
 synopsis TEXT,
 cover_url TEXT,
 status VARCHAR(30) NOT NULL DEFAULT 'draft',
 promoted BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chapters (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
 chapter_number INT NOT NULL,
 title VARCHAR(255),
 content_ciphertext TEXT NOT NULL,
 price_coins INT NOT NULL DEFAULT 0,
 status VARCHAR(30) NOT NULL DEFAULT 'draft',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(story_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS ownership_declarations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 story_id UUID NOT NULL REFERENCES stories(id),
 author_id UUID NOT NULL REFERENCES users(id),
 terms_version VARCHAR(40) NOT NULL,
 declaration_text TEXT NOT NULL,
 accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 ip_hash TEXT,
 session_id TEXT
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID REFERENCES users(id),
 story_id UUID REFERENCES stories(id),
 chapter_id UUID REFERENCES chapters(id),
 transaction_type VARCHAR(40) NOT NULL,
 gross_tsh BIGINT NOT NULL DEFAULT 0,
 author_share_tsh BIGINT NOT NULL DEFAULT 0,
 platform_share_tsh BIGINT NOT NULL DEFAULT 0,
 split_code VARCHAR(20) NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'completed',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id UUID NOT NULL REFERENCES users(id),
 amount_tsh BIGINT NOT NULL CHECK(amount_tsh >= 50000),
 payment_method VARCHAR(50) NOT NULL,
 destination_reference TEXT NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'pending',
 requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotion_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 story_id UUID NOT NULL REFERENCES stories(id),
 author_id UUID NOT NULL REFERENCES users(id),
 status VARCHAR(30) NOT NULL DEFAULT 'pending',
 starts_at TIMESTAMPTZ,
 ends_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO languages(code,name) VALUES
('en','English'),('sw','Kiswahili')
ON CONFLICT(code) DO NOTHING;
