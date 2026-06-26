import {
  countDailyVisitors,
  ensureVisitorSchema,
  insertDailyVisitor,
} from './visitor-db.js';

const BOT_UA_PATTERN =
  /googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|yeti|naverbot|daumoa|kakaotalk-scrap|bytespider|applebot|petalbot|semrush|ahrefsbot|mj12bot|dotbot|curl\/|wget\/|python-requests|headlesschrome|phantomjs/i;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_PATHS = new Set(['/', '/cases', '/repair-cases', '/contact']);

const REFERRER_RULES = [
  { pattern: /naver\.com/i, source: '네이버', keyword: extractNaverKeyword },
  { pattern: /google\./i, source: '구글', keyword: extractGoogleKeyword },
  { pattern: /(daum\.net|kakao\.com)/i, source: '다음·카카오', keyword: () => '확인 불가' },
  { pattern: /bing\.com/i, source: 'Bing', keyword: extractBingKeyword },
  { pattern: /instagram\.com/i, source: '인스타그램', keyword: () => '확인 불가' },
  { pattern: /facebook\.com|fb\.com/i, source: '페이스북', keyword: () => '확인 불가' },
];

export function isVisitorAlertEnabled(env) {
  const flag = (env?.VISITOR_ALERT_ENABLED ?? 'true').toString().toLowerCase();
  return flag !== 'false' && flag !== '0';
}

export function isBotUserAgent(userAgent) {
  if (!userAgent) return true;
  return BOT_UA_PATTERN.test(userAgent);
}

export function isValidVisitorId(visitorId) {
  if (!visitorId || typeof visitorId !== 'string') return false;
  if (visitorId.length > 36) return false;
  return UUID_PATTERN.test(visitorId);
}

export function normalizeVisitorPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return '';
  let path = pathname.trim();
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '/index.html') return '/';
  if (path.endsWith('.html')) {
    const stripped = path.slice(0, -5);
    return stripped || '/';
  }
  return path;
}

export function isAllowedVisitorPath(pathname) {
  return ALLOWED_PATHS.has(normalizeVisitorPath(pathname));
}

export function sanitizeVisitorText(value, maxLen = 200) {
  if (value == null) return '';
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function getKstVisitDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function extractQueryKeyword(referrer, paramNames) {
  try {
    const url = new URL(referrer);
    for (const name of paramNames) {
      const value = url.searchParams.get(name);
      if (value && value.trim()) {
        return sanitizeVisitorText(decodeURIComponent(value.replace(/\+/g, ' ')), 80);
      }
    }
  } catch {
    return '확인 불가';
  }
  return '확인 불가';
}

function extractNaverKeyword(referrer) {
  return extractQueryKeyword(referrer, ['query', 'nquery', 'q']);
}

function extractGoogleKeyword(referrer) {
  return extractQueryKeyword(referrer, ['q']);
}

function extractBingKeyword(referrer) {
  return extractQueryKeyword(referrer, ['q']);
}

export function classifyReferrer(referrer) {
  const clean = sanitizeVisitorText(referrer, 500);
  if (!clean) {
    return { source: '직접 방문', keyword: '확인 불가' };
  }

  let host = '';
  try {
    host = new URL(clean).hostname.toLowerCase();
  } catch {
    return { source: '기타', keyword: '확인 불가', rawHost: '' };
  }

  if (host.includes('dreamev.kr')) {
    return { source: '사이트 내부', keyword: '확인 불가', rawHost: host };
  }

  for (const rule of REFERRER_RULES) {
    if (rule.pattern.test(host)) {
      return {
        source: rule.source,
        keyword: rule.keyword(clean),
        rawHost: host,
      };
    }
  }

  return { source: host, keyword: '확인 불가', rawHost: host };
}

export function summarizeBrowser(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return '확인 불가';
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'Chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
  if (ua.includes('firefox/')) return 'Firefox';
  if (ua.includes('samsungbrowser')) return 'Samsung Internet';
  return '기타 브라우저';
}

export function describeDevice(userAgent, screenType) {
  const ua = (userAgent || '').toLowerCase();
  const browser = summarizeBrowser(userAgent);
  let os = '';

  if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os') || ua.includes('macintosh')) os = 'macOS';

  const typeLabel =
    screenType === 'mobile' ? '모바일' : screenType === 'tablet' ? '태블릿' : 'PC';

  if (os && screenType === 'mobile') return `${os} 모바일 (${browser})`;
  if (os && screenType === 'tablet') return `${os} 태블릿 (${browser})`;
  if (os) return `${os} ${typeLabel} (${browser})`;
  return `${typeLabel} (${browser})`;
}

export function describeDeviceShort(userAgent, screenType) {
  return describeDevice(userAgent, screenType).replace(/\s*\([^)]+\)$/, '');
}

export function formatKstDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function buildTelegramMessage({
  todayVisitors,
  source,
  pathname,
  keyword,
  device,
  country,
  visitedAt,
}) {
  return [
    '드림전동차 홈페이지 신규 방문',
    '',
    `오늘 방문자: ${todayVisitors}명`,
    `유입: ${sanitizeVisitorText(source, 80)}`,
    `첫 페이지: ${sanitizeVisitorText(pathname, 120)}`,
    `검색어: ${sanitizeVisitorText(keyword, 80)}`,
    `기기: ${sanitizeVisitorText(device, 120)}`,
    `국가: ${sanitizeVisitorText(country, 8)}`,
    `시간: ${sanitizeVisitorText(visitedAt, 32)}`,
  ].join('\n');
}

export function hasVisitorSilenceCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  return /(?:^|;\s*)dreamev_va_silence=1(?:;|$)/.test(cookie);
}

export function isAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === 'dreamev.kr' ||
      host === 'www.dreamev.kr' ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

export function isValidStatsDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export async function sendTelegramVisitorAlert(env, message, fetchImpl = fetch) {
  const token = env?.TELEGRAM_BOT_TOKEN;
  const chatId = env?.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, reason: 'not_configured' };
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      reason: 'telegram_http_error',
      status: response.status,
      body: body.slice(0, 200),
    };
  }

  return { ok: true };
}

export async function processVisitorAlertRequest(context, body, deps = {}) {
  const { request, env, waitUntil } = context;
  const fetchImpl = deps.fetchImpl || fetch;
  const db = deps.db || env.VISITOR_DB;
  const visitDate = deps.visitDate || getKstVisitDate();
  const now = deps.now || new Date();

  if (!db) {
    return { error: 'CONFIG_ERROR', message: 'VISITOR_DB 바인딩이 설정되지 않았습니다.' };
  }

  if (!isAllowedOrigin(request)) {
    return {
      isNewVisitorToday: false,
      visitDate,
      todayVisitors: null,
      telegramTriggered: false,
      skipped: true,
      reason: 'origin_blocked',
    };
  }

  const userAgent = request.headers.get('User-Agent') || '';
  if (isBotUserAgent(userAgent)) {
    return {
      isNewVisitorToday: false,
      visitDate,
      todayVisitors: null,
      telegramTriggered: false,
      skipped: true,
      reason: 'bot',
    };
  }

  if (hasVisitorSilenceCookie(request)) {
    return {
      isNewVisitorToday: false,
      visitDate,
      todayVisitors: null,
      telegramTriggered: false,
      skipped: true,
      reason: 'silenced',
    };
  }

  const visitorId = sanitizeVisitorText(body?.visitorId || '', 36);
  if (!isValidVisitorId(visitorId)) {
    return { error: 'VALIDATION_ERROR', message: '유효한 visitorId(UUID)가 필요합니다.' };
  }

  const headerReferrer = sanitizeVisitorText(request.headers.get('Referer') || '', 500);
  const bodyReferrer = sanitizeVisitorText(body?.referrer || '', 500);
  const referrer = bodyReferrer || headerReferrer;

  const pathname = normalizeVisitorPath(body?.path || new URL(request.url).pathname);
  if (!isAllowedVisitorPath(pathname)) {
    return {
      isNewVisitorToday: false,
      visitDate,
      todayVisitors: null,
      telegramTriggered: false,
      skipped: true,
      reason: 'path_not_tracked',
    };
  }

  const screenType = sanitizeVisitorText(body?.screenType || '', 20).toLowerCase();
  const refInfo = classifyReferrer(referrer);
  const { source, keyword } = refInfo;
  const deviceType = describeDevice(userAgent, screenType);
  const deviceShort = describeDeviceShort(userAgent, screenType);
  const country = sanitizeVisitorText(request.headers.get('CF-IPCountry') || '??', 8);
  const firstSeenAt = formatKstDateTime(now);

  await ensureVisitorSchema(db);

  const isNew = await insertDailyVisitor(db, {
    visitDate,
    visitorId,
    firstPath: pathname,
    firstReferrer: referrer || null,
    source,
    deviceType,
    country,
    firstSeenAt,
  });

  const todayVisitors = await countDailyVisitors(db, visitDate);

  if (!isNew) {
    return {
      isNewVisitorToday: false,
      visitDate,
      todayVisitors,
      telegramTriggered: false,
    };
  }

  const warnings = [];
  let telegramTriggered = false;

  if (isVisitorAlertEnabled(env) && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const message = buildTelegramMessage({
      todayVisitors,
      source,
      pathname,
      keyword,
      device: deviceShort,
      country,
      visitedAt: firstSeenAt,
    });

    const sendPromise = sendTelegramVisitorAlert(env, message, fetchImpl).then((result) => {
      if (!result.ok) {
        console.error('visitor-alert telegram failed', {
          reason: result.reason,
          status: result.status,
        });
      }
      return result;
    });

    if (typeof waitUntil === 'function') {
      waitUntil(sendPromise);
      telegramTriggered = true;
    } else {
      const result = await sendPromise;
      telegramTriggered = result.ok;
      if (!result.ok) warnings.push('TELEGRAM_SEND_FAILED');
    }
  } else if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    warnings.push('TELEGRAM_NOT_CONFIGURED');
  }

  const response = {
    isNewVisitorToday: true,
    visitDate,
    todayVisitors,
    telegramTriggered,
  };

  if (warnings.length > 0) {
    response.warnings = warnings;
  }

  return response;
}
