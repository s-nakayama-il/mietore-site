CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  ts TEXT, sid TEXT, event TEXT NOT NULL, param TEXT,
  url TEXT, os TEXT, v TEXT, ua_family TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);
