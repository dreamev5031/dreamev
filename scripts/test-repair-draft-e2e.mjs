#!/usr/bin/env node
/**
 * 수리사례 AI 초안 E2E 시나리오 (A/B/C/D)
 * Production: UPLOAD_ADMIN_SECRET=... node scripts/test-repair-draft-e2e.mjs production
 * Local handler: USE_LOCAL_HANDLER=1 node scripts/test-repair-draft-e2e.mjs local
 */
import { onRequestPost } from '../functions/api/generate-case-draft.js';

const mode = process.argv[2] || 'local';
const baseUrl = 'https://dreamev.kr/';
const endpoint = `${baseUrl}api/generate-case-draft`;
const secret = process.env.UPLOAD_ADMIN_SECRET || '';

const scenarios = {
  A: {
    label: '정상 입력',
    payload: {
      contentType: 'repair',
      userTitle: '석고 운반용 전동차',
      vehicle: '석고 운반용 전동차',
      location: '',
      workDate: '2026-06-26',
      symptoms: ['컨택터 작동 불량', '주행 불가'],
      diagnosis: [],
      workContent: '컨택터 이상을 확인하여 신품 컨택터로 교체했습니다.',
      result: ['정상 작동'],
      additionalNote: '',
    },
    expectStatus: 200,
    expectCode: null,
  },
  B: {
    label: '약한 workContent',
    payload: {
      contentType: 'repair',
      userTitle: '테스트',
      vehicle: '전동차',
      location: '',
      workDate: '2026-06-26',
      symptoms: ['전진 불량'],
      diagnosis: [],
      workContent: '7272',
      result: ['정상 작동'],
      additionalNote: '',
    },
    expectStatus: 400,
    expectCode: 'VALIDATION_ERROR',
    expectMessageIncludes: '자세히',
  },
  C: {
    label: '빈 result',
    payload: {
      contentType: 'repair',
      userTitle: '석고 운반용 전동차',
      vehicle: '석고 운반용 전동차',
      location: '',
      workDate: '2026-06-26',
      symptoms: ['컨택터 작동 불량'],
      diagnosis: [],
      workContent: '컨택터 이상을 확인하여 신품 컨택터로 교체했습니다.',
      result: [],
      additionalNote: '',
    },
    expectStatus: 200,
    forbidStatus: 500,
  },
  D: {
    label: 'OpenAI 강제 실패',
    payload: {
      contentType: 'repair',
      userTitle: '전동차',
      vehicle: '전동차',
      location: '',
      workDate: '2026-06-26',
      symptoms: ['전진 불량'],
      diagnosis: [],
      workContent: '배선 보수 및 시운전 점검을 진행했습니다.',
      result: ['주행 정상 확인'],
      additionalNote: '',
    },
    forceOpenAiStatus: 429,
    expectNotCode: 'INTERNAL_ERROR',
    forbidStatus: 500,
  },
};

async function callRemote(payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch { /* ignore */ }
  return { httpStatus: response.status, bodyText, parsed };
}

async function callLocal(payload, scenario) {
  const openAiStatus = scenario.forceOpenAiStatus;
  const originalFetch = globalThis.fetch;
  if (openAiStatus) {
    globalThis.fetch = async () => ({
      ok: false,
      status: openAiStatus,
      text: async () => JSON.stringify({ error: { message: 'rate limit' } }),
    });
  }
  try {
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
        OPENAI_API_KEY: openAiStatus ? 'sk-test' : (process.env.OPENAI_API_KEY || 'sk-test'),
        OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      },
    });
    const bodyText = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(bodyText); } catch { /* ignore */ }
    return { httpStatus: response.status, bodyText, parsed };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runScenario(key, scenario) {
  const useLocal = mode === 'local';
  const result = useLocal
    ? await callLocal(scenario.payload, scenario)
    : await callRemote(scenario.payload);

  const { httpStatus, parsed, bodyText } = result;
  const code = parsed?.code ?? null;
  const message = parsed?.message ?? null;
  const requestId = parsed?.requestId ?? null;

  let ok = true;
  const failures = [];

  if (scenario.expectStatus && httpStatus !== scenario.expectStatus) {
    ok = false;
    failures.push(`expected HTTP ${scenario.expectStatus}, got ${httpStatus}`);
  }
  if (scenario.forbidStatus && httpStatus === scenario.forbidStatus) {
    ok = false;
    failures.push(`forbidden HTTP ${scenario.forbidStatus}`);
  }
  if (scenario.expectCode && code !== scenario.expectCode) {
    ok = false;
    failures.push(`expected code ${scenario.expectCode}, got ${code}`);
  }
  if (scenario.expectNotCode && code === scenario.expectNotCode) {
    ok = false;
    failures.push(`forbidden code ${scenario.expectNotCode}`);
  }
  if (scenario.expectMessageIncludes && !String(message || '').includes(scenario.expectMessageIncludes)) {
    ok = false;
    failures.push(`message should include "${scenario.expectMessageIncludes}"`);
  }
  if (scenario.expectStatus === 200 && !parsed?.success) {
    ok = false;
    failures.push('expected success=true');
  }

  return {
    key,
    label: scenario.label,
    ok,
    failures,
    httpStatus,
    code,
    message,
    requestId,
    usedFallback: parsed?.usedFallback ?? null,
    bodyPreview: bodyText.slice(0, 300),
  };
}

async function main() {
  if (mode === 'production' && !secret) {
    console.error('UPLOAD_ADMIN_SECRET required for production mode');
    process.exit(2);
  }

  console.log(`=== Repair Draft E2E (${mode}) ===`);
  const results = [];
  for (const [key, scenario] of Object.entries(scenarios)) {
    const result = await runScenario(key, scenario);
    results.push(result);
    console.log(`\n[${key}] ${result.label}: ${result.ok ? 'PASS' : 'FAIL'}`);
    console.log('  HTTP:', result.httpStatus);
    console.log('  code:', result.code);
    console.log('  message:', result.message);
    console.log('  requestId:', result.requestId);
    if (result.usedFallback != null) console.log('  usedFallback:', result.usedFallback);
    if (!result.ok) console.log('  failures:', result.failures.join('; '));
  }

  const allOk = results.every((r) => r.ok);
  process.exit(allOk ? 0 : 1);
}

main();
