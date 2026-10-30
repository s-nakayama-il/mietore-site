-- 本番 D1（mietore-mm）の events に国（country）の列を足す（TASK-I16-20261030-001）。人が push の前に 1 回だけ流す。
-- 流す前に push されても記録は落ちない（track.ts が今の 17 列で入れ直し、stats.ts は 17 列で書き出す）。
-- SQLite の ADD COLUMN は既にある列で失敗するため、2 回目は流さない。
ALTER TABLE events ADD COLUMN country TEXT;
