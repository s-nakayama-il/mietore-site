-- LP を開いた回数（離脱バナーの分母）。1回ずつの行は持たず、鍵ごとの件数だけ（src/lib/banner/pv.ts）
CREATE TABLE IF NOT EXISTS banner_pv (
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  lp TEXT NOT NULL,
  ad TEXT NOT NULL,
  campaign TEXT NOT NULL,
  os TEXT NOT NULL,
  ua_family TEXT NOT NULL,
  v TEXT NOT NULL,
  seen INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, lp, ad, campaign, os, ua_family, v, seen)
) WITHOUT ROWID;
