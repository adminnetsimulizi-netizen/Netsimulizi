CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS languages(code TEXT PRIMARY KEY,name TEXT NOT NULL);
INSERT INTO languages(code,name) VALUES ('sw','Kiswahili'),('en','English') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),language_code TEXT NOT NULL REFERENCES languages(code),name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS story_submissions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),story_id UUID NOT NULL,author_id UUID NOT NULL,status TEXT NOT NULL DEFAULT 'pending',submitted_at TIMESTAMPTZ DEFAULT now(),reviewed_at TIMESTAMPTZ);
