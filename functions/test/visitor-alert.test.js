import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTelegramMessage,
  classifyReferrer,
  describeDevice,
  formatKstDateTime,
  isAllowedVisitorPath,
  isBotUserAgent,
  isServerCooldownActive,
  isVisitorAlertEnabled,
  normalizeVisitorPath,
  processVisitorAlertRequest,
  sanitizeVisitorText,
} from '../lib/visitor-alert.js';

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
  assert.equal(isAllowedVisitorPath('/images/logo.png'), false);
});

test('isBotUserAgent excludes common crawlers', () => {
  assert.equal(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(isBotUserAgent('Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)'), true);
  assert.equal(isBotUserAgent('facebookexternalhit/1.1'), true);
  assert.equal(isBotUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/124 Mobile'), false);
});

test('classifyReferrer maps known sources and keywords', () => {
  const naver = classifyReferrer('https://search.naver.com/search.naver?query=%EC%A0%84%EB%8F%99%EC%B0%A8');
  assert.equal(naver.source, '네이버');
  assert.equal(naver.keyword, '전동차');

  const google = classifyReferrer('https://www.google.com/search?q=dreamev');
  assert.equal(google.source, '구글');
  assert.equal(google.keyword, 'dreamev');

  const direct = classifyReferrer('');
  assert.equal(direct.source, '직접 방문');
  assert.equal(direct.keyword, '확인 불가');

  const internal = classifyReferrer('https://dreamev.kr/cases');
  assert.equal(internal.source, '사이트 내부');
});

test('buildTelegramMessage uses plain text without html', () => {
  const message = buildTelegramMessage({
    source: '네이버',
    pathname: '/repair-cases',
    keyword: '전동차',
    device: 'Android 모바일 (Chrome)',
    country: 'KR',
    visitedAt: '2026-06-26 13:25',
  });
  assert.match(message, /드림전동차 홈페이지 방문/);
  assert.match(message, /유입: 네이버/);
  assert.match(message, /페이지: \/repair-cases/);
  assert.doesNotMatch(message, /<[^>]+>/);
});

test('describeDevice distinguishes mobile and desktop', () => {
  const mobile = describeDevice('Mozilla/5.0 (Linux; Android 14) Chrome/124 Mobile', 'mobile');
  assert.match(mobile, /Android 모바일/);
  const desktop = describeDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/124', 'desktop');
  assert.match(desktop, /Windows/);
});

test('isVisitorAlertEnabled respects env flag', () => {
  assert.equal(isVisitorAlertEnabled({ VISITOR_ALERT_ENABLED: 'true' }), true);
  assert.equal(isVisitorAlertEnabled({ VISITOR_ALERT_ENABLED: 'false' }), false);
});

test('processVisitorAlertRequest skips bots and static paths', async () => {
  const request = new Request('https://dreamev.kr/api/visitor-alert', {
    method: 'POST',
    headers: {
      'User-Agent': 'Googlebot/2.1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: '/cases' }),
  });
  const result = await processVisitorAlertRequest(
    { request, env: { TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: '1' }, waitUntil() {} },
    { path: '/cases' },
  );
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'bot');
});

test('processVisitorAlertRequest sends telegram asynchronously', async () => {
  let sentBody = null;
  const fetchImpl = async (url, init) => {
    sentBody = JSON.parse(init.body);
    return { ok: true, text: async () => '{"ok":true}' };
  };

  const cache = {
    store: new Map(),
    async match(req) {
      return this.store.get(req.url) || null;
    },
    async put(req, res) {
      this.store.set(req.url, res);
    },
  };

  const request = new Request('https://dreamev.kr/api/visitor-alert', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile',
      'CF-Connecting-IP': '203.0.113.10',
      'CF-IPCountry': 'KR',
      'Referer': 'https://search.naver.com/search.naver?query=%EC%A0%84%EB%8F%99%EC%B0%A8',
      Origin: 'https://dreamev.kr',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: '/repair-cases', screenType: 'mobile' }),
  });

  let waitUntilPromise;
  const result = await processVisitorAlertRequest(
    {
      request,
      env: {
        TELEGRAM_BOT_TOKEN: 'test-token-value',
        TELEGRAM_CHAT_ID: '123456',
        VISITOR_ALERT_COOLDOWN_MINUTES: '30',
      },
      waitUntil(promise) {
        waitUntilPromise = promise;
      },
    },
    { path: '/repair-cases', screenType: 'mobile', referrer: 'https://search.naver.com/search.naver?query=%EC%A0%84%EB%8F%99%EC%B0%A8' },
    { fetchImpl, cache },
  );

  assert.equal(result.sent, true);
  assert.ok(waitUntilPromise);
  await waitUntilPromise;
  assert.ok(sentBody);
  assert.match(sentBody.text, /드림전동차 홈페이지 방문/);
  assert.match(sentBody.text, /유입: 네이버/);
  assert.match(sentBody.text, /페이지: \/repair-cases/);
  assert.doesNotMatch(sentBody.text, /203\.0\.113\.10/);
});

test('isServerCooldownActive prevents duplicate within ttl', async () => {
  const cache = {
    store: new Map(),
    async match(req) {
      return this.store.get(req.url) || null;
    },
    async put(req, res) {
      this.store.set(req.url, res);
    },
  };

  const first = await isServerCooldownActive(cache, 'abc', 30);
  const second = await isServerCooldownActive(cache, 'abc', 30);
  assert.equal(first, false);
  assert.equal(second, true);
});

test('sanitizeVisitorText strips control characters', () => {
  assert.equal(sanitizeVisitorText('hello\nworld'), 'hello world');
});

test('formatKstDateTime returns korean timezone format', () => {
  const value = formatKstDateTime(new Date('2026-06-26T04:25:00.000Z'));
  assert.match(value, /^2026-06-26 \d{2}:\d{2}$/);
});
