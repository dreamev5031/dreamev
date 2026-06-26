-- Cloudflare D1 콘솔 또는 대시보드에서 실행
-- 데이터베이스 이름 권장: dreamev-visitors

CREATE TABLE IF NOT EXISTS daily_visitors (
  visit_date TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  first_path TEXT NOT NULL,
  first_referrer TEXT,
  source TEXT NOT NULL,
  device_type TEXT,
  country TEXT,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (visit_date, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_visitors_date
ON daily_visitors (visit_date);
