-- 本番 D1（mietore-mm）の events に 8 列を足す（TASK-I16-20261028-001）。人が push の前に 1 回だけ流す。
-- 流す前に push されても記録は落ちない（track.ts が今の 9 列で入れ直し、stats.ts は 9 列で書き出す）。
-- SQLite の ADD COLUMN は既にある列で失敗するため、2 回目は流さない。
ALTER TABLE events ADD COLUMN ua TEXT;
ALTER TABLE events ADD COLUMN asn INTEGER;
ALTER TABLE events ADD COLUMN as_org TEXT;
ALTER TABLE events ADD COLUMN region TEXT;
ALTER TABLE events ADD COLUMN city TEXT;
ALTER TABLE events ADD COLUMN postal TEXT;
ALTER TABLE events ADD COLUMN model TEXT;
ALTER TABLE events ADD COLUMN os_version TEXT;
