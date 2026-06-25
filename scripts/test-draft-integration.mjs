#!/usr/bin/env node
/**
 * AI 초안 API 통합 점검 스크립트
 * 사용: UPLOAD_ADMIN_SECRET=... OPENAI_API_KEY=... node scripts/test-draft-integration.mjs [baseUrl]
 */
import { onRequestPost } from '../functions/api/generate-case-draft.js';

const baseUrl = (process.argv[2] || 'https://dreamev.kr/').replace(/\/?$/, '/');
const endpoint = `${baseUrl}api/generate-case-draft`;

const payload = {
  contentType: 'repair',
  userTitle: '456',
  vehicle: '산업용 전동차',
  symptoms: ['전진 불량'],
  diagnosis: ['전자브레이크 쇼트'],
  selectedWorkItems: ['컨트롤러 교체', '배선 교체'],
  work: ['교체 후 주행 테스트 진행'],
  result: ['주행 정상 확인'],
};

const secret = process.env.UPLOAD_ADMIN_SECRET || '';
const useLocalHandler = process.env.USE_LOCAL_HANDLER === '1';

async function callRemote() {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  return { httpStatus: response.status, bodyText };
}

async function callLocal() {
  const response = await onRequestPost({
    request: new Request(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret || 'secret'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),
    env: {
      UPLOAD_ADMIN_SECRET: secret || 'secret',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    },
  });
  const bodyText = await response.text();
  return { httpStatus: response.status, bodyText };
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const { httpStatus, bodyText } = useLocalHandler
  ? await callLocal()
  : await callRemote();

const parsed = safeParse(bodyText);

console.log('=== AI Draft Integration Report ===');
console.log('1. Request URL:', endpoint);
console.log('2. Request payload fields:', Object.keys(payload).join(', '));
console.log('3. Cloudflare HTTP status:', httpStatus);
console.log('4. Server raw JSON:', bodyText.slice(0, 1200));
console.log('5. Parsed success:', parsed?.success ?? null);
console.log('6. Server code:', parsed?.code ?? null);
console.log('7. Server message:', parsed?.message ?? null);
console.log('8. requestId:', parsed?.requestId ?? null);
console.log('9. draft title:', parsed?.draft?.title ?? null);
console.log('10. Android DTO parse:', parsed && (parsed.success ? parsed.draft != null : parsed.code != null) ? 'OK' : 'FAIL');

if (!secret && !useLocalHandler) {
  console.warn('\nWARN: UPLOAD_ADMIN_SECRET 미설정 — Production 원격 호출은 401이 예상됩니다.');
  console.warn('로컬 핸들러 테스트: USE_LOCAL_HANDLER=1 UPLOAD_ADMIN_SECRET=secret OPENAI_API_KEY=... node scripts/test-draft-integration.mjs');
}
