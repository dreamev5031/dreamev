import {
  formatKstDateTime,
  isAllowedOrigin,
  isBotUserAgent,
  sanitizeVisitorText,
} from './visitor-alert.js';

const INQUIRY_TYPE_LABELS = {
  repair: '전동차 수리·점검',
  custom: '맞춤 제작·개조',
  consult: '견적·기술 상담',
  parts: '부품 문의',
  other: '기타 문의',
};

const ALLOWED_INQUIRY_TYPES = new Set(Object.keys(INQUIRY_TYPE_LABELS));
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_MESSAGE_LEN = 3000;
const MIN_SUBMIT_MS = 3000;
const RATE_LIMIT_SECONDS = 60;
const TELEGRAM_CAPTION_LIMIT = 1024;
const PHONE_PATTERN = /^[\d\s\-+()]{8,30}$/;

export function getInquiryTypeLabel(type) {
  return INQUIRY_TYPE_LABELS[type] || type;
}

export function sanitizeConsultationText(value, maxLen = 200) {
  if (value == null) return '';
  return sanitizeVisitorText(
    String(value)
      .replace(/<[^>]*>/g, '')
      .trim(),
    maxLen,
  );
}

export function isValidPhone(phone) {
  const clean = sanitizeConsultationText(phone, 30);
  if (!clean || clean.length < 8 || clean.length > 30) return false;
  const digits = clean.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 && PHONE_PATTERN.test(clean);
}

export function isAllowedReferer(request) {
  const referer = request.headers.get('Referer') || '';
  if (!referer) return true;
  try {
    const host = new URL(referer).hostname.toLowerCase();
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

export function detectImageMime(bytes, declaredType) {
  if (!bytes || bytes.byteLength < 12) return null;
  const view = new Uint8Array(bytes);
  if (view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) return 'image/jpeg';
  if (
    view[0] === 0x89 &&
    view[1] === 0x50 &&
    view[2] === 0x4e &&
    view[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x45 &&
    view[10] === 0x42 &&
    view[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (declaredType && ALLOWED_IMAGE_MIME.has(declaredType)) return declaredType;
  return null;
}

export async function hashRateLimitKey(ip, userAgent, pepper) {
  const material = `consultation|${pepper || 'dreamev'}|${ip || 'unknown'}|${(userAgent || '').slice(0, 120)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function isConsultationRateLimited(cache, key, ttlSeconds = RATE_LIMIT_SECONDS) {
  if (!cache || !key) return false;
  const cacheRequest = new Request(`https://consultation.ratelimit/${encodeURIComponent(key)}`);
  const hit = await cache.match(cacheRequest);
  if (hit) return true;
  await cache.put(cacheRequest, new Response('1', { status: 200 }), {
    expirationTtl: Math.max(1, ttlSeconds),
  });
  return false;
}

export function buildConsultationMessage(data) {
  const lines = [
    '🔔 드림전동차 신규 상담',
    '',
    `상담 구분: ${data.inquiryTypeLabel}`,
    `이름/업체명: ${data.name}`,
    `연락처: ${data.phone}`,
  ];

  if (data.region) lines.push(`지역: ${data.region}`);
  if (data.vehicle) lines.push(`차량 종류: ${data.vehicle}`);

  lines.push('', '문의 내용:', data.message, '', `접수 페이지: ${data.pathname}`, `접수 시간: ${data.submittedAt}`);

  lines.push(`첨부 사진: ${data.photoCount > 0 ? `${data.photoCount}장` : '없음'}`);

  return lines.join('\n');
}

export function buildShortPhotoCaption(data) {
  const lines = [
    '🔔 드림전동차 신규 상담',
    `상담 구분: ${data.inquiryTypeLabel}`,
    `이름/업체명: ${data.name}`,
    `연락처: ${data.phone}`,
    `첨부 사진: ${data.photoCount}장`,
  ];
  return lines.join('\n').slice(0, TELEGRAM_CAPTION_LIMIT);
}

export async function parseConsultationForm(request) {
  const formData = await request.formData();
  const honeypot = sanitizeConsultationText(formData.get('website') || '', 100);
  const formLoadedAt = Number.parseInt(String(formData.get('formLoadedAt') || ''), 10);

  const inquiryType = sanitizeConsultationText(formData.get('inquiryType') || '', 30);
  const name = sanitizeConsultationText(formData.get('name') || '', 100);
  const phone = sanitizeConsultationText(formData.get('phone') || '', 30);
  const region = sanitizeConsultationText(formData.get('region') || '', 100);
  const vehicle = sanitizeConsultationText(formData.get('vehicle') || '', 150);
  const message = sanitizeConsultationText(formData.get('message') || '', MAX_MESSAGE_LEN);
  const privacy = sanitizeConsultationText(formData.get('privacy') || '', 10);
  const pathname = sanitizeConsultationText(formData.get('pathname') || '/', 200);

  const photoEntries = [];
  let totalBytes = 0;

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('photos') && key !== 'photos') continue;
    if (!(value instanceof File) || value.size === 0) continue;
    const bytes = await value.arrayBuffer();
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > MAX_PHOTO_BYTES) {
      return { error: 'INVALID_IMAGE', message: '사진 한 장은 8MB 이하여야 합니다.' };
    }
    const mimeType = detectImageMime(bytes, value.type);
    if (!mimeType || !ALLOWED_IMAGE_MIME.has(mimeType)) {
      return { error: 'INVALID_IMAGE', message: 'JPG, PNG, WEBP 사진만 첨부할 수 있습니다.' };
    }
    photoEntries.push({
      bytes,
      mimeType,
      filename: sanitizeConsultationText(value.name || 'photo.jpg', 120) || 'photo.jpg',
    });
    if (photoEntries.length > MAX_PHOTOS) {
      return { error: 'INVALID_IMAGE', message: '사진은 최대 5장까지 첨부할 수 있습니다.' };
    }
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return { error: 'INVALID_IMAGE', message: '첨부 파일 전체 크기가 너무 큽니다.' };
  }

  return {
    honeypot,
    formLoadedAt,
    inquiryType,
    name,
    phone,
    region,
    vehicle,
    message,
    privacy,
    pathname: pathname.startsWith('/') ? pathname : `/${pathname}`,
    photos: photoEntries,
  };
}

export function validateConsultationPayload(payload) {
  if (payload.honeypot) {
    return { error: 'SPAM_BLOCKED', message: '상담 신청을 처리할 수 없습니다.' };
  }

  if (!Number.isFinite(payload.formLoadedAt) || Date.now() - payload.formLoadedAt < MIN_SUBMIT_MS) {
    return { error: 'SPAM_BLOCKED', message: '잠시 후 다시 시도해 주세요.' };
  }

  if (!payload.inquiryType || !ALLOWED_INQUIRY_TYPES.has(payload.inquiryType)) {
    return { error: 'VALIDATION_ERROR', message: '문의 유형을 확인해 주세요.' };
  }

  if (!payload.name) {
    return { error: 'VALIDATION_ERROR', message: '성함을 입력해 주세요.' };
  }

  if (!isValidPhone(payload.phone)) {
    return { error: 'VALIDATION_ERROR', message: '연락처와 문의 내용을 확인해 주세요.' };
  }

  if (!payload.message) {
    return { error: 'VALIDATION_ERROR', message: '연락처와 문의 내용을 확인해 주세요.' };
  }

  if (payload.privacy !== 'yes') {
    return { error: 'VALIDATION_ERROR', message: '개인정보 수집 및 이용에 동의해 주세요.' };
  }

  return { ok: true };
}

async function sendTelegramMessage(env, text, fetchImpl) {
  const token = env?.TELEGRAM_BOT_TOKEN;
  const chatId = env?.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, reason: 'not_configured' };

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    return { ok: false, reason: 'telegram_http_error', status: response.status };
  }
  return { ok: true };
}

async function sendTelegramPhoto(env, photo, caption, fetchImpl) {
  const token = env?.TELEGRAM_BOT_TOKEN;
  const chatId = env?.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, reason: 'not_configured' };

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption.slice(0, TELEGRAM_CAPTION_LIMIT));
  form.append('photo', new Blob([photo.bytes], { type: photo.mimeType }), photo.filename);

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    return { ok: false, reason: 'telegram_http_error', status: response.status };
  }
  return { ok: true };
}

async function sendTelegramMediaGroup(env, photos, caption, fetchImpl) {
  const token = env?.TELEGRAM_BOT_TOKEN;
  const chatId = env?.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, reason: 'not_configured' };

  const form = new FormData();
  form.append('chat_id', chatId);
  const media = photos.map((photo, index) => ({
    type: 'photo',
    media: `attach://photo${index}`,
    ...(index === 0 && caption ? { caption: caption.slice(0, TELEGRAM_CAPTION_LIMIT) } : {}),
  }));
  form.append('media', JSON.stringify(media));
  photos.forEach((photo, index) => {
    form.append(`photo${index}`, new Blob([photo.bytes], { type: photo.mimeType }), photo.filename);
  });

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    return { ok: false, reason: 'telegram_http_error', status: response.status };
  }
  return { ok: true };
}

export async function sendConsultationToTelegram(env, payload, fetchImpl = fetch) {
  const messageData = {
    inquiryTypeLabel: getInquiryTypeLabel(payload.inquiryType),
    name: payload.name,
    phone: payload.phone,
    region: payload.region,
    vehicle: payload.vehicle,
    message: payload.message,
    pathname: payload.pathname,
    submittedAt: formatKstDateTime(),
    photoCount: payload.photos.length,
  };

  const fullMessage = buildConsultationMessage(messageData);
  const photos = payload.photos;
  let photoSent = false;

  if (photos.length === 1) {
    const caption =
      fullMessage.length <= TELEGRAM_CAPTION_LIMIT
        ? fullMessage
        : buildShortPhotoCaption(messageData);
    const photoResult = await sendTelegramPhoto(env, photos[0], caption, fetchImpl);
    photoSent = photoResult.ok;
    if (!photoResult.ok) {
      console.error('consultation photo send failed', { status: photoResult.status });
    }
    if (!photoResult.ok || fullMessage.length > TELEGRAM_CAPTION_LIMIT) {
      const textResult = await sendTelegramMessage(env, fullMessage, fetchImpl);
      if (!textResult.ok) {
        return { ok: false, reason: 'text_failed', photoSent };
      }
      return { ok: true, photoSent: photoResult.ok };
    }
    return { ok: true, photoSent: true };
  }

  if (photos.length > 1) {
    const shortCaption = buildShortPhotoCaption(messageData);
    const groupResult = await sendTelegramMediaGroup(env, photos, shortCaption, fetchImpl);
    photoSent = groupResult.ok;
    if (!groupResult.ok) {
      console.error('consultation media group send failed', { status: groupResult.status });
    }
  }

  const textResult = await sendTelegramMessage(env, fullMessage, fetchImpl);
  if (!textResult.ok) {
    return { ok: false, reason: 'text_failed', photoSent };
  }
  return { ok: true, photoSent };
}

export async function processConsultationRequest(context, deps = {}) {
  const { request, env } = context;
  const fetchImpl = deps.fetchImpl || fetch;
  const cache = deps.cache || globalThis.caches?.default;

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { error: 'CONFIG_ERROR', message: '상담 접수 설정을 확인해 주세요.' };
  }

  if (!isAllowedOrigin(request) || !isAllowedReferer(request)) {
    return { error: 'SPAM_BLOCKED', message: '상담 신청을 처리할 수 없습니다.' };
  }

  const userAgent = request.headers.get('User-Agent') || '';
  if (isBotUserAgent(userAgent)) {
    return { error: 'SPAM_BLOCKED', message: '상담 신청을 처리할 수 없습니다.' };
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return { error: 'VALIDATION_ERROR', message: '요청 형식이 올바르지 않습니다.' };
  }

  let payload;
  try {
    payload = await parseConsultationForm(request);
  } catch (err) {
    console.error('consultation parse failed', err.message);
    return { error: 'VALIDATION_ERROR', message: '상담 신청 내용을 확인해 주세요.' };
  }

  if (payload.error) {
    return payload;
  }

  const validation = validateConsultationPayload(payload);
  if (validation.error) {
    return validation;
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const pepper = (env.TELEGRAM_BOT_TOKEN || '').slice(-12);
  const rateKey = await hashRateLimitKey(ip, userAgent, pepper);
  if (await isConsultationRateLimited(cache, rateKey)) {
    return { error: 'SPAM_BLOCKED', message: '잠시 후 다시 시도해 주세요.' };
  }

  const telegramResult = await sendConsultationToTelegram(env, payload, fetchImpl);
  if (!telegramResult.ok) {
    return {
      error: 'SEND_FAILED',
      message: '상담 신청 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  if (!telegramResult.photoSent && payload.photos.length > 0) {
    console.warn('consultation accepted with photo send warning');
  }

  return {
    ok: true,
    message: '상담 신청이 접수되었습니다.',
    photoCount: payload.photos.length,
  };
}
