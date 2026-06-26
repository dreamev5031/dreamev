import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as visitorStatsGet } from '../api/visitor-stats.js';
import {
  buildTelegramMessage,
  classifyReferrer,
  describeDevice,
  formatKstDateTime,
  getKstVisitDate,
  isAllowedVisitorPath,
  isBotUserAgent,
  isValidStatsDate,
  isValidVisitorId,
  isVisitorAlertEnabled,
  normalizeVisitorPath,
  processVisitorAlertRequest,
  sanitizeVisitorText,
} from '../lib/visitor-alert.js';
import { countDailyVisitors, getDailyVisitorStats, resetVisitorSchemaFlag } from '../lib/visitor-db.js';

const VISITOR_ID_A = '550e8400-e29b-41d4-a716-446655440000';
const VISITOR_ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function createMemoryDb() {
  const rows = [];

  function execute(sql, args = []) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      return { meta: { changes: 0 } };
    }
    if (sql.includes('INSERT OR IGNORE')) {
      const [
        visitDate,
        visitorId,
        firstPath,
        firstReferrer,
        source,
        deviceType,
        country,
        firstSeenAt,
      ] = args;
      const exists = rows.some(
        (r) => r.visit_date === visitDate && r.visitor_id === visitorId,
      );
      if (exists) return { meta: { changes: 0 } };
      rows.push({
        visit_date: visitDate,
        visitor_id: visitorId,
        first_path: firstPath,
        first_referrer: firstReferrer,
        source,
        device_type: deviceType,
        country,
        first_seen_at: firstSeenAt,
      });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }

  function queryFirst(sql, args = []) {
    if (sql.includes('COUNT(*)')) {
      const [visitDate] = args;
      const total = rows.filter((r) => r.visit_date === visitDate).length;
      return { total };
    }
    return null;
  }

  function queryAll(sql, args = []) {
    if (sql.includes('GROUP BY source')) {
      const [visitDate] = args;
      const map = new Map();
      for (const row of rows.filter((r) => r.visit_date === visitDate)) {
        map.set(row.source, (map.get(row.source) || 0) + 1);
      }
      return {
        results: [...map.entries()].map(([source, count]) => ({ source, count })),
      };
    }
    return { results: [] };
  }

  const db = {
    prepare(sql) {
      const stmt = {
        bind(...args) {
          return {
            run: async () => execute(sql, args),
            first: async () => queryFirst(sql, args),
            all: async () => queryAll(sql, args),
          };
        },
        run: async () => execute(sql, []),
      };
      return stmt;
    },
    _rows: rows,
  };

  return db;
}

function makeRequest(overrides = {}) {
  return new Request('https://dreamev.kr/api/visitor-alert', {
    method: 'POST',
    headers: {
      'User-Agent':
        overrides.userAgent ||
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile',
      'CF-IPCountry': 'KR',
      Referer: overrides.referer !== undefined ? overrides.referer : 'https://search.naver.com/search.naver?query=test',
      Origin: 'https://dreamev.kr',
      'Content-Type': 'application/json',
      ...overrides.headers,
    },
    body: JSON.stringify({
      visitorId: overrides.visitorId || VISITOR_ID_A,
      path: overrides.path || '/repair-cases',
      screenType: overrides.screenType || 'mobile',
      referrer: overrides.referrer,
    }),
  });
}

test('getKstVisitDate uses Asia/Seoul midnight boundary', () => {
  assert.equal(getKstVisitDate(new Date('2026-06-26T14:59:59.000Z')), '2026-06-26');
  assert.equal(getKstVisitDate(new Date('2026-06-26T15:00:00.000Z')), '2026-06-27');
});

test('isValidVisitorId accepts UUID and rejects invalid values', () => {
  assert.equal(isValidVisitorId(VISITOR_ID_A), true);
  assert.equal(isValidVisitorId('not-a-uuid'), false);
  assert.equal(isValidVisitorId(`${VISITOR_ID_A}x`), false);
});

test('normalizeVisitorPath handles html suffix and index', () => {
  assert.equal(normalizeVisitorPath('/cases.html'), '/cases');
  assert.equal(normalizeVisitorPath('/index.html'), '/');
  assert.equal(normalizeVisitorPath('/repair-cases/'), '/repair-cases');
});

test('isAllowedVisitorPath only tracks main pages', () => {
  assert.equal(isAllowedVisitorPath('/cases'), true);
  assert.equal(isAllowedVisitorPath('/repair-cases.html'), true);
  assert.equal(isAllowedVisitorPath('/api/visitor-alert'), false);
  assert.equal(isAllowedVisitorPath('/css/style.css'), false);
});

test('isBotUserAgent excludes common crawlers', () => {
  assert.equal(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(isBotUserAgent('Mozilla/5.0 (compatible; Yeti/1.1)'), true);
  assert.equal(isBotUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/124 Mobile'), false);
});

test('classifyReferrer maps known sources and keywords', () => {
  const naver = classifyReferrer('https://search.naver.com/search.naver?query=%EC%A0%84%EB%8F%99%EC%B0%A8');
  assert.equal(naver.source, '네이버');
  assert.equal(naver.keyword, '전동차');

  const direct = classifyReferrer('');
  assert.equal(direct.source, '직접 방문');
});

test('buildTelegramMessage includes today visitor count', () => {
  const message = buildTelegramMessage({
    todayVisitors: 7,
    source: '네이버',
    pathname: '/repair-cases',
    keyword: '확인 불가',
    device: 'Android 모바일',
    country: 'KR',
    visitedAt: '2026-06-26 13:25',
  });
  assert.match(message, /드림전동차 홈페이지 신규 방문/);
  assert.match(message, /오늘 방문자: 7명/);
  assert.match(message, /첫 페이지: \/repair-cases/);
  assert.doesNotMatch(message, /<[^>]+>/);
});

test('processVisitorAlertRequest returns CONFIG_ERROR without VISITOR_DB', async () => {
  const result = await processVisitorAlertRequest(
    { request: makeRequest(), env: {}, waitUntil() {} },
    { visitorId: VISITOR_ID_A, path: '/cases' },
  );
  assert.equal(result.error, 'CONFIG_ERROR');
});

test('first visit counts as new visitor and triggers telegram', async () => {
  resetVisitorSchemaFlag();
  const db = createMemoryDb();
  let sentBody = null;
  const fetchImpl = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return { ok: true, text: async () => '{"ok":true}' };
  };

  const result = await processVisitorAlertRequest(
    {
      request: makeRequest(),
      env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' },
    },
    { visitorId: VISITOR_ID_A, path: '/repair-cases', screenType: 'mobile' },
    { db, fetchImpl, visitDate: '2026-06-26' },
  );

  assert.equal(result.isNewVisitorToday, true);
  assert.equal(result.todayVisitors, 1);
  assert.equal(result.visitDate, '2026-06-26');
  assert.equal(result.telegramTriggered, true);
  assert.ok(sentBody);
  assert.match(sentBody.text, /오늘 방문자: 1명/);
});

test('same visitor refresh on same day is duplicate without telegram', async () => {
  resetVisitorSchemaFlag();
  const db = createMemoryDb();
  let telegramCalls = 0;
  const fetchImpl = async () => {
    telegramCalls += 1;
    return { ok: true, text: async () => '{"ok":true}' };
  };

  const context = {
    request: makeRequest(),
    env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' },
    waitUntil() {},
  };
  const body = { visitorId: VISITOR_ID_A, path: '/repair-cases', screenType: 'mobile' };
  const deps = { db, fetchImpl, visitDate: '2026-06-26' };

  const first = await processVisitorAlertRequest(context, body, deps);
  const second = await processVisitorAlertRequest(
    { ...context, request: makeRequest({ path: '/cases' }) },
    { ...body, path: '/cases' },
    deps,
  );

  assert.equal(first.isNewVisitorToday, true);
  assert.equal(second.isNewVisitorToday, false);
  assert.equal(second.todayVisitors, 1);
  assert.equal(second.telegramTriggered, false);
  assert.equal(telegramCalls, 1);
});

test('different visitorId on same day increments count', async () => {
  resetVisitorSchemaFlag();
  const db = createMemoryDb();
  const deps = { db, visitDate: '2026-06-26', fetchImpl: async () => ({ ok: true, text: async () => '' }) };

  await processVisitorAlertRequest(
    { request: makeRequest(), env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' }, waitUntil() {} },
    { visitorId: VISITOR_ID_A, path: '/' },
    deps,
  );
  const second = await processVisitorAlertRequest(
    {
      request: makeRequest({ visitorId: VISITOR_ID_B }),
      env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' },
      waitUntil() {},
    },
    { visitorId: VISITOR_ID_B, path: '/contact' },
    deps,
  );

  assert.equal(second.isNewVisitorToday, true);
  assert.equal(second.todayVisitors, 2);
});

test('same visitorId after KST date change counts as new visitor', async () => {
  resetVisitorSchemaFlag();
  const db = createMemoryDb();
  const deps = { db, fetchImpl: async () => ({ ok: true, text: async () => '' }) };
  const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' };
  const body = { visitorId: VISITOR_ID_A, path: '/' };

  await processVisitorAlertRequest(
    { request: makeRequest(), env, waitUntil() {} },
    body,
    { ...deps, visitDate: '2026-06-26' },
  );
  const nextDay = await processVisitorAlertRequest(
    { request: makeRequest(), env, waitUntil() {} },
    body,
    { ...deps, visitDate: '2026-06-27' },
  );

  assert.equal(nextDay.isNewVisitorToday, true);
  assert.equal(nextDay.todayVisitors, 1);
  assert.equal(await countDailyVisitors(db, '2026-06-26'), 1);
  assert.equal(await countDailyVisitors(db, '2026-06-27'), 1);
});

test('telegram failure keeps visitor count and returns warning', async () => {
  resetVisitorSchemaFlag();
  const db = createMemoryDb();
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'fail' });

  const result = await processVisitorAlertRequest(
    { request: makeRequest(), env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' } },
    { visitorId: VISITOR_ID_A, path: '/' },
    { db, fetchImpl, visitDate: '2026-06-26' },
  );

  assert.equal(result.isNewVisitorToday, true);
  assert.equal(result.todayVisitors, 1);
  assert.equal(result.telegramTriggered, false);
  assert.deepEqual(result.warnings, ['TELEGRAM_SEND_FAILED']);
});

test('bot visits are skipped without db writes', async () => {
  resetVisitorSchemaFlag();
  const db = createMemoryDb();

  const result = await processVisitorAlertRequest(
    {
      request: makeRequest({ userAgent: 'Googlebot/2.1' }),
      env: { VISITOR_DB: db, TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' },
      waitUntil() {},
    },
    { visitorId: VISITOR_ID_A, path: '/' },
    { db, visitDate: '2026-06-26' },
  );

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'bot');
  assert.equal(db._rows.length, 0);
});

test('concurrent inserts only create one row per visitor/date', async () => {
  resetVisitorSchemaFlag();
  const db = createMemoryDb();
  const deps = { db, visitDate: '2026-06-26', fetchImpl: async () => ({ ok: true, text: async () => '' }) };
  const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' };
  const body = { visitorId: VISITOR_ID_A, path: '/' };

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      processVisitorAlertRequest(
        { request: makeRequest(), env, waitUntil() {} },
        body,
        deps,
      ),
    ),
  );

  const newCount = results.filter((r) => r.isNewVisitorToday).length;
  assert.equal(newCount, 1);
  assert.equal(await countDailyVisitors(db, '2026-06-26'), 1);
});

test('getDailyVisitorStats groups sources', async () => {
  resetVisitorSchemaFlag();
  const db = createMemoryDb();
  const deps = { db, visitDate: '2026-06-26', fetchImpl: async () => ({ ok: true, text: async () => '' }) };
  const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' };

  await processVisitorAlertRequest(
    { request: makeRequest({ referrer: 'https://search.naver.com/?query=a' }), env, waitUntil() {} },
    { visitorId: VISITOR_ID_A, path: '/', referrer: 'https://search.naver.com/?query=a' },
    deps,
  );
  await processVisitorAlertRequest(
    {
      request: makeRequest({ visitorId: VISITOR_ID_B, referer: '', referrer: '' }),
      env,
      waitUntil() {},
    },
    { visitorId: VISITOR_ID_B, path: '/cases', referrer: '' },
    deps,
  );

  const stats = await getDailyVisitorStats(db, '2026-06-26');
  assert.equal(stats.uniqueVisitors, 2);
  assert.equal(stats.sources['네이버'], 1);
  assert.equal(stats.sources['직접 방문'], 1);
});

test('visitor-stats API requires admin auth', async () => {
  const db = createMemoryDb();
  const response = await visitorStatsGet({
    request: new Request('https://dreamev.kr/api/visitor-stats?date=2026-06-26'),
    env: { VISITOR_DB: db, UPLOAD_ADMIN_SECRET: 'secret' },
  });
  assert.equal(response.status, 401);
});

test('visitor-stats API returns stats for authorized admin', async () => {
  resetVisitorSchemaFlag();
  const db = createMemoryDb();
  await processVisitorAlertRequest(
    {
      request: makeRequest(),
      env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' },
      waitUntil() {},
    },
    { visitorId: VISITOR_ID_A, path: '/' },
    { db, visitDate: '2026-06-26', fetchImpl: async () => ({ ok: true, text: async () => '' }) },
  );

  const response = await visitorStatsGet({
    request: new Request('https://dreamev.kr/api/visitor-stats?date=2026-06-26', {
      headers: { Authorization: 'Bearer secret' },
    }),
    env: { VISITOR_DB: db, UPLOAD_ADMIN_SECRET: 'secret' },
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.uniqueVisitors, 1);
  assert.equal(data.date, '2026-06-26');
});

test('isValidStatsDate validates YYYY-MM-DD', () => {
  assert.equal(isValidStatsDate('2026-06-26'), true);
  assert.equal(isValidStatsDate('2026-13-01'), false);
  assert.equal(isValidStatsDate('invalid'), false);
});

test('isVisitorAlertEnabled respects env flag', () => {
  assert.equal(isVisitorAlertEnabled({ VISITOR_ALERT_ENABLED: 'true' }), true);
  assert.equal(isVisitorAlertEnabled({ VISITOR_ALERT_ENABLED: 'false' }), false);
});

test('formatKstDateTime returns korean timezone format', () => {
  const value = formatKstDateTime(new Date('2026-06-26T04:25:00.000Z'));
  assert.match(value, /^2026-06-26 \d{2}:\d{2}$/);
});

test('sanitizeVisitorText strips control characters', () => {
  assert.equal(sanitizeVisitorText('hello\nworld'), 'hello world');
});
