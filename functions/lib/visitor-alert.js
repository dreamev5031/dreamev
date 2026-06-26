const BOT_UA_PATTERN =
  /googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|yeti|naverbot|daumoa|kakaotalk-scrap|bytespider|applebot|petalbot|semrush|ahrefsbot|mj12bot|dotbot|curl\/|wget\/|python-requests|headlesschrome|phantomjs/i;

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

function extractQueryKeyword(referrer, paramNames) {
  try {
    const url = new URL(referrer);
    for (const name of paramNames) {
      const value = url.searchParams.get(name);
      if (value && value.trim()) return sanitizeVisitorText(decodeURIComponent(value.replace(/\+/g, ' ')), 80);
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
  source,
  pathname,
  keyword,
  device,
  country,
  visitedAt,
}) {
  return [
    '드림전동차 홈페이지 방문',
    '',
    `유입: ${sanitizeVisitorText(source, 80)}`,
    `페이지: ${sanitizeVisitorText(pathname, 120)}`,
    `검색어: ${sanitizeVisitorText(keyword, 80)}`,
    `기기: ${sanitizeVisitorText(device, 120)}`,
    `국가: ${sanitizeVisitorText(country, 8)}`,
    `시간: ${sanitizeVisitorText(visitedAt, 32)}`,
  ].join('\n');
}

export async function hashForDedup(ip, userAgent, pepper) {
  const material = `${pepper || 'dreamev'}|${ip || 'unknown'}|${(userAgent || '').slice(0, 120)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function isServerCooldownActive(cache, dedupKey, cooldownMinutes) {
  if (!cache || !dedupKey) return false;
  const ttl = Math.max(1, Number.parseInt(String(cooldownMinutes || 30), 10) || 30) * 60;
  const cacheRequest = new Request(`https://visitor-alert.dedup/${encodeURIComponent(dedupKey)}`);
  const hit = await cache.match(cacheRequest);
  if (hit) return true;
  await cache.put(cacheRequest, new Response('1', { status: 200 }), { expirationTtl: ttl });
  return false;
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
    return host === 'dreamev.kr' || host === 'www.dreamev.kr' || host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
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
    return { ok: false, reason: 'telegram_http_error', status: response.status, body: body.slice(0, 200) };
  }

  return { ok: true };
}

export async function processVisitorAlertRequest(context, body, deps = {}) {
  const { request, env, waitUntil } = context;
  const fetchImpl = deps.fetchImpl || fetch;
  const cache = deps.cache || globalThis.caches?.default;

  if (!isVisitorAlertEnabled(env)) {
    return { sent: false, reason: 'disabled' };
  }

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { sent: false, reason: 'not_configured' };
  }

  if (!isAllowedOrigin(request)) {
    return { sent: false, reason: 'origin_blocked' };
  }

  const userAgent = request.headers.get('User-Agent') || '';
  if (isBotUserAgent(userAgent)) {
    return { sent: false, reason: 'bot' };
  }

  if (hasVisitorSilenceCookie(request)) {
    return { sent: false, reason: 'silenced' };
  }

  const headerReferrer = sanitizeVisitorText(request.headers.get('Referer') || '', 500);
  const bodyReferrer = sanitizeVisitorText(body?.referrer || '', 500);
  const referrer = bodyReferrer || headerReferrer;

  const pathname = normalizeVisitorPath(body?.path || new URL(request.url).pathname);
  if (!isAllowedVisitorPath(pathname)) {
    return { sent: false, reason: 'path_not_tracked' };
  }

  if (body?.clientCooldownActive === true) {
    return { sent: false, reason: 'client_cooldown' };
  }

  const screenType = sanitizeVisitorText(body?.screenType || '', 20).toLowerCase();
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const pepper = env.TELEGRAM_BOT_TOKEN.slice(-12);
  const dedupKey = await hashForDedup(ip, userAgent, pepper);
  const cooldownMinutes = env.VISITOR_ALERT_COOLDOWN_MINUTES || '30';

  if (await isServerCooldownActive(cache, dedupKey, cooldownMinutes)) {
    return { sent: false, reason: 'server_cooldown' };
  }

  const refInfo = classifyReferrer(referrer);
  if (refInfo.source === '사이트 내부') {
    return { sent: false, reason: 'internal_navigation' };
  }

  const { source, keyword } = refInfo;
  const device = describeDevice(userAgent, screenType);
  const country = sanitizeVisitorText(request.headers.get('CF-IPCountry') || '??', 8);
  const visitedAt = formatKstDateTime();
  const message = buildTelegramMessage({
    source,
    pathname,
    keyword,
    device,
    country,
    visitedAt,
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
  } else {
    await sendPromise;
  }

  return { sent: true };
}
