CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  ts TEXT, sid TEXT, event TEXT NOT NULL, param TEXT,
  url TEXT, os TEXT, v TEXT, ua_family TEXT,
  -- 2026-10-28 追加（TASK-I16-20261028-001）。ua・asn〜postal は受け取った側（Cloudflare）で分かる値、
  -- model・os_version はブラウザが送れたときだけ（Android の Chrome 系）。既存の D1 には mm_20261028_add_cf.sql で足す
  ua TEXT, asn INTEGER, as_org TEXT, region TEXT, city TEXT, postal TEXT,
  model TEXT, os_version TEXT,
  -- 2026-10-30 追加（TASK-I16-20261030-001）。Cloudflare が付ける国の 2 文字。既存の D1 には mm_20261030_add_country.sql で足す
  country TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);
