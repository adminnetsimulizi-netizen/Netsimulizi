CREATE TABLE IF NOT EXISTS audit_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id UUID REFERENCES users(id),
 action VARCHAR(120) NOT NULL,
 entity_type VARCHAR(80),
 entity_id UUID,
 metadata JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submission_reviews (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 story_id UUID REFERENCES stories(id),
 chapter_id UUID REFERENCES chapters(id),
 reviewer_id UUID REFERENCES users(id),
 decision VARCHAR(30) NOT NULL,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID REFERENCES users(id),
 title VARCHAR(255) NOT NULL,
 body TEXT NOT NULL,
 read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS copyright_complaints (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 story_id UUID REFERENCES stories(id),
 complainant_name TEXT NOT NULL,
 contact TEXT NOT NULL,
 claim TEXT NOT NULL,
 evidence_reference TEXT,
 status VARCHAR(30) NOT NULL DEFAULT 'pending',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
