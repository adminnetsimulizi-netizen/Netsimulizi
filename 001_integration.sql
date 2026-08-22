CREATE TABLE IF NOT EXISTS app_settings (
 key VARCHAR(100) PRIMARY KEY,
 value JSONB NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_settings(key,value) VALUES
('revenue.standard','{"authorPercent":70,"platformPercent":30}'),
('revenue.promoted','{"authorPercent":50,"platformPercent":50}'),
('withdrawal.minimum_tsh','{"amount":50000}')
ON CONFLICT(key) DO NOTHING;
