export const DAILY_VISITORS_DDL = `
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
`;

let schemaReady = false;

export async function ensureVisitorSchema(db) {
  if (!db || schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS daily_visitors (
      visit_date TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      first_path TEXT NOT NULL,
      first_referrer TEXT,
      source TEXT NOT NULL,
      device_type TEXT,
      country TEXT,
      first_seen_at TEXT NOT NULL,
      PRIMARY KEY (visit_date, visitor_id)
    )`,
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_daily_visitors_date ON daily_visitors (visit_date)`,
    )
    .run();
  schemaReady = true;
}

export async function insertDailyVisitor(db, row) {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO daily_visitors
       (visit_date, visitor_id, first_path, first_referrer, source, device_type, country, first_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.visitDate,
      row.visitorId,
      row.firstPath,
      row.firstReferrer || null,
      row.source,
      row.deviceType || null,
      row.country || null,
      row.firstSeenAt,
    )
    .run();

  return (result?.meta?.changes ?? 0) > 0;
}

export async function countDailyVisitors(db, visitDate) {
  const row = await db
    .prepare('SELECT COUNT(*) AS total FROM daily_visitors WHERE visit_date = ?')
    .bind(visitDate)
    .first();
  return Number(row?.total ?? 0);
}

export async function getDailyVisitorStats(db, visitDate) {
  const countRow = await db
    .prepare('SELECT COUNT(*) AS total FROM daily_visitors WHERE visit_date = ?')
    .bind(visitDate)
    .first();

  const sourceRows = await db
    .prepare(
      `SELECT source, COUNT(*) AS count
       FROM daily_visitors
       WHERE visit_date = ?
       GROUP BY source
       ORDER BY count DESC`,
    )
    .bind(visitDate)
    .all();

  const sources = {};
  for (const row of sourceRows?.results ?? []) {
    sources[row.source] = Number(row.count);
  }

  return {
    uniqueVisitors: Number(countRow?.total ?? 0),
    sources,
  };
}

/** 테스트용: 스키마 초기화 플래그 리셋 */
export function resetVisitorSchemaFlag() {
  schemaReady = false;
}
