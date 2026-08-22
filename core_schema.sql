CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('reader','author','editor','admin','super_admin')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id UUID NOT NULL REFERENCES users(id),
 language TEXT NOT NULL CHECK (language IN ('sw','en')),
 title TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft',
 promoted BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ownership_declarations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 story_id UUID NOT NULL REFERENCES stories(id),
 declaration_text TEXT NOT NULL,
 accepted BOOLEAN NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chapters (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 story_id UUID NOT NULL REFERENCES stories(id),
 chapter_number INTEGER NOT NULL,
 title TEXT NOT NULL,
 content_ref TEXT NOT NULL,
 UNIQUE(story_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS audit_log (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id UUID,
 action TEXT NOT NULL,
 entity_type TEXT,
 entity_id UUID,
 metadata JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
