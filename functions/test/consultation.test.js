import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { onRequestPost } from '../api/consultation.js';
import {
  buildConsultationMessage,
  detectImageMime,
  getInquiryTypeLabel,
  isValidPhone,
  processConsultationRequest,
  sendConsultationToTelegram,
  validateConsultationPayload,
} from '../lib/consultation.js';

const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function buildMultipartRequest(fields = {}, files = []) {
  const boundary = '----dreamevtest';
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    );
  }

  files.forEach((file, index) => {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    );
    chunks.push(file.bytes);
    chunks.push('\r\n');
  });

  chunks.push(`--${boundary}--\r\n`);

  const body = new Blob(chunks, { type: `multipart/form-data; boundary=${boundary}` });

  return new Request('https://dreamev.kr/api/consultation', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Origin: 'https://dreamev.kr',
      Referer: 'https://dreamev.kr/contact.html',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/124 Mobile',
      'CF-Connecting-IP': '203.0.113.44',
    },
    body,
  });
}

function baseFields(overrides = {}) {
  return {
    inquiryType: 'repair',
    name: '홍길동',
    phone: '010-1234-5678',
    region: '경기도 양주',
    vehicle: '다목적 전동차',
    message: '주행 중 전원이 끊깁니다.',
    privacy: 'yes',
    pathname: '/contact.html',
    website: '',
    formLoadedAt: String(Date.now() - 5000),
    ...overrides,
  };
}

function createCache() {
  const store = new Map();
  return {
    async match(req) {
      return store.get(req.url) || null;
    },
    async put(req, res, opts) {
      store.set(req.url, res);
      return opts;
    },
  };
}

test('getInquiryTypeLabel maps known inquiry types', () => {
  assert.equal(getInquiryTypeLabel('repair'), '전동차 수리·점검');
  assert.equal(getInquiryTypeLabel('custom'), '맞춤 제작·개조');
});

test('isValidPhone accepts common phone formats', () => {
  assert.equal(isValidPhone('010-1234-5678'), true);
  assert.equal(isValidPhone('abc'), false);
  assert.equal(isValidPhone('123'), false);
});

test('detectImageMime validates png magic bytes', () => {
  assert.equal(detectImageMime(PNG_1X1.buffer, 'image/png'), 'image/png');
  assert.equal(detectImageMime(new Uint8Array([1, 2, 3]).buffer, 'image/png'), null);
});

test('buildConsultationMessage includes required fields', () => {
  const message = buildConsultationMessage({
    inquiryTypeLabel: '전동차 수리·점검',
    name: '홍길동',
    phone: '010-1234-5678',
    region: '경기도 양주',
    vehicle: '다목적 전동차',
    message: '증상 설명',
    pathname: '/contact.html',
    submittedAt: '2026-06-26 14:30',
    photoCount: 0,
  });
  assert.match(message, /드림전동차 신규 상담/);
  assert.match(message, /첨부 사진: 없음/);
  assert.doesNotMatch(message, /<[^>]+>/);
});

test('validateConsultationPayload rejects honeypot and fast submit', () => {
  const honeypot = validateConsultationPayload({
    honeypot: 'spam',
    formLoadedAt: Date.now() - 5000,
    inquiryType: 'repair',
    name: '홍길동',
    phone: '010-1234-5678',
    message: '내용',
    privacy: 'yes',
    photos: [],
  });
  assert.equal(honeypot.error, 'SPAM_BLOCKED');

  const fast = validateConsultationPayload({
    honeypot: '',
    formLoadedAt: Date.now(),
    inquiryType: 'repair',
    name: '홍길동',
    phone: '010-1234-5678',
    message: '내용',
    privacy: 'yes',
    photos: [],
  });
  assert.equal(fast.error, 'SPAM_BLOCKED');
});

test('sendConsultationToTelegram uses sendMessage when no photos', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, text: async () => '{"ok":true}' };
  };

  const result = await sendConsultationToTelegram(
    { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' },
    {
      inquiryType: 'repair',
      name: '홍길동',
      phone: '010-1234-5678',
      region: '경기도',
      vehicle: '전동차',
      message: '문의',
      pathname: '/contact.html',
      photos: [],
    },
    fetchImpl,
  );

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /sendMessage/);
});

test('sendConsultationToTelegram sends photo and text for multi-photo', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, text: async () => '{"ok":true}' };
  };

  const result = await sendConsultationToTelegram(
    { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' },
    {
      inquiryType: 'repair',
      name: '홍길동',
      phone: '010-1234-5678',
      region: '',
      vehicle: '',
      message: '문의',
      pathname: '/contact.html',
      photos: [
        { bytes: PNG_1X1.buffer, mimeType: 'image/png', filename: 'a.png' },
        { bytes: PNG_1X1.buffer, mimeType: 'image/png', filename: 'b.png' },
      ],
    },
    fetchImpl,
  );

  assert.equal(result.ok, true);
  assert.equal(calls.some((url) => url.includes('sendMediaGroup')), true);
  assert.equal(calls.some((url) => url.includes('sendMessage')), true);
});

test('sendConsultationToTelegram fails when text send fails', async () => {
  const fetchImpl = async (url) => ({
    ok: !url.includes('sendMessage'),
    status: 500,
    text: async () => 'fail',
  });

  const result = await sendConsultationToTelegram(
    { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' },
    {
      inquiryType: 'repair',
      name: '홍길동',
      phone: '010-1234-5678',
      region: '',
      vehicle: '',
      message: '문의',
      pathname: '/contact.html',
      photos: [],
    },
    fetchImpl,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'text_failed');
});

test('processConsultationRequest returns CONFIG_ERROR without telegram secrets', async () => {
  const request = buildMultipartRequest(baseFields());
  const result = await processConsultationRequest({ request, env: {} }, { cache: createCache() });
  assert.equal(result.error, 'CONFIG_ERROR');
});

test('processConsultationRequest accepts text-only consultation', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, text: async () => '{"ok":true}' };
  };

  const request = buildMultipartRequest(baseFields());
  const result = await processConsultationRequest(
    { request, env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' } },
    { fetchImpl, cache: createCache() },
  );

  assert.equal(result.ok, true);
  assert.equal(result.photoCount, 0);
  assert.equal(calls.length, 1);
});

test('processConsultationRequest rejects invalid image mime', async () => {
  const request = buildMultipartRequest(baseFields(), [
    { bytes: new Uint8Array([1, 2, 3, 4]).buffer, mimeType: 'application/pdf', filename: 'bad.pdf' },
  ]);
  const result = await processConsultationRequest(
    { request, env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' } },
    { cache: createCache() },
  );
  assert.equal(result.error, 'INVALID_IMAGE');
});

test('processConsultationRequest keeps text success when photo send fails', async () => {
  const fetchImpl = async (url) => ({
    ok: url.includes('sendMessage'),
    status: url.includes('sendMessage') ? 200 : 500,
    text: async () => '{"ok":true}',
  });

  const request = buildMultipartRequest(baseFields(), [
    { bytes: PNG_1X1.buffer, mimeType: 'image/png', filename: 'a.png' },
  ]);
  const result = await processConsultationRequest(
    { request, env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' } },
    { fetchImpl, cache: createCache() },
  );

  assert.equal(result.ok, true);
  assert.equal(result.photoCount, 1);
});

test('consultation API returns success response shape', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => '{"ok":true}' });
  try {
    const request = buildMultipartRequest(baseFields());
    const response = await onRequestPost({
      request,
      env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' },
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.photoCount, 0);
    assert.match(data.message, /접수되었습니다/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('contact-inquiry.js posts to consultation API', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
  const js = readFileSync(join(root, 'js', 'contact-inquiry.js'), 'utf8');
  assert.match(js, /\/api\/consultation/);
  assert.match(js, /상담 신청을 보내는 중입니다/);
  assert.match(js, /FormData/);
});
