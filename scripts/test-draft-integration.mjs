#!/usr/bin/env node
/**
 * Android DraftPayloadBuilder와 동일/호환 필드로 통합 테스트
 * USE_LOCAL_HANDLER=1 UPLOAD_ADMIN_SECRET=... OPENAI_API_KEY=... node scripts/test-draft-integration.mjs
 */
import { onRequestPost } from '../functions/api/generate-case-draft.js';

const baseUrl = (process.argv[2] || 'https://dreamev.kr/').replace(/\/?$/, '/');
const endpoint = `${baseUrl}api/generate-case-draft`;
const useLocalHandler = process.env.USE_LOCAL_HANDLER === '1';

const payloads = {
  legacy: {
    contentType: 'repair',
    userTitle: 'SUV 수리',
    category: '산업용',
    vehicle: '산업용 SUV',
    location: '',
    workDate: '2026-06-25',
    workTypes: [],
    symptoms: ['주행 불가'],
    diagnosis: ['컨트롤러 이상'],
    selectedWorkItems: ['컨트롤러 교체'],
    work: ['충전기 점검', '시운전'],
    result: ['주행 정상 확인'],
    additionalNote: '',
  },
  workContent: {
    contentType: 'repair',
    userTitle: '석고 운반용 전동차',
    vehicle: '석고 운반용 전동차',
    location: '',
    workDate: '2026-06-26',
    symptoms: ['컨택터 작동 불량', '주행 불가'],
    diagnosis: [],
    workContent: '컨택터 이상으로 주행 불가 컨택터 신품으로 교체후 정상작동',
    result: ['정상 작동'],
    additionalNote: '',
  },
};

const payloadName = process.argv[3] || 'workContent';
const androidPayload = payloads[payloadName] || payloads.workContent;

const secret = process.env.UPLOAD_ADMIN_SECRET || '';

async function callRemote() {
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(androidPayload),
  });
  const bodyText = await response.text();
  return { httpStatus: response.status, bodyText, elapsedMs: Date.now() - started };
}

async function callLocal() {
  const started = Date.now();
  const response = await onRequestPost({
    request: new Request(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret || 'secret'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(androidPayload),
    }),
    env: {
      UPLOAD_ADMIN_SECRET: secret || 'secret',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    },
  });
  const bodyText = await response.text();
  return { httpStatus: response.status, bodyText, elapsedMs: Date.now() - started };
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const { httpStatus, bodyText, elapsedMs } = useLocalHandler
  ? await callLocal()
  : await callRemote();

const parsed = safeParse(bodyText);
const isHtml502 = httpStatus === 502 && bodyText.trim().startsWith('<');

console.log('=== AI Draft Integration ===');
console.log('mode:', useLocalHandler ? 'local_handler' : 'production');
console.log('payload:', payloadName);
console.log('HTTP status:', httpStatus);
console.log('isHtml502:', isHtml502);
console.log('elapsedMs:', elapsedMs);
console.log('isJson:', Boolean(parsed));
console.log('code:', parsed?.code ?? null);
console.log('message:', parsed?.message ?? null);
console.log('requestId:', parsed?.requestId ?? null);
console.log('model:', parsed?.model ?? null);
console.log('usedFallback:', parsed?.usedFallback ?? null);
if (parsed?.draft) {
  console.log('draft.title:', parsed.draft.title);
  console.log('draft.summary:', parsed.draft.summary);
  console.log('draft.customerRequest:', parsed.draft.customerRequest);
  console.log('draft.workDetails:', parsed.draft.workDetails);
  console.log('draft.result:', parsed.draft.result);
} else {
  console.log('bodyPreview:', bodyText.slice(0, 500));
}
