CREATE TABLE IF NOT EXISTS payment_transactions(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 internal_reference TEXT UNIQUE NOT NULL, provider_reference TEXT,
 user_id UUID NOT NULL, story_id UUID, chapter_id UUID,
 amount NUMERIC(14,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'TZS',
 status TEXT NOT NULL DEFAULT 'pending', provider TEXT NOT NULL DEFAULT 'selcom',
 promoted BOOLEAN NOT NULL DEFAULT false, verified_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_events(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider TEXT NOT NULL,
 event_key TEXT UNIQUE NOT NULL, payload JSONB NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
