import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../api/generate-case-draft.js';
import {
  buildDraftPrompt,
  callOpenAiDraft,
  normalizeDraftInput,
  sanitizeDraftFields,
  validateDraftInput,
} from '../lib/openai-draft.js';

const env = {
  UPLOAD_ADMIN_SECRET: 'secret',
  OPENAI_API_KEY: 'sk-test',
  OPENAI_MODEL: 'gpt-4o-mini',
};

const userProductionPayload = {
  contentType: 'production',
  title: '456',
  category: '산업용',
  symptoms: ['전진 불량'],
  diagnosis: ['전자브레이크 쇼트'],
  work: ['배선 보수'],
  result: ['주행 정상 확인'],
};

function authHeaders() {
  return { Authorization: 'Bearer secret', 'Content-Type': 'application/json' };
}

function openAiSuccessResponse(draft) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{ message: { content: JSON.stringify(draft) } }],
    }),
  };
}

const sampleDraft = {
  title: '산업용 전동차 전진 불량 배선 수리 사례',
  summary: '전진이 되지 않고 후진만 작동하는 산업용 전동차를 점검해 전진 배선 단선을 확인하고 보수했습니다.',
  customerRequest: '전진이 되지 않고 후진만 작동하는 증상으로 현장 점검을 요청받았습니다.',
  diagnosis: '점검 결과 전진 신호 계통의 배선 단선이 확인되었습니다.',
  workDetails: '손상된 배선을 보수하고 연결 상태를 점검한 뒤 전진 및 후진 시운전을 진행했습니다.',
  result: '작업 후 전진과 후진이 모두 정상적으로 작동하는 것을 확인했습니다.',
  seoTitle: '산업용 전동차 전진 불량 배선 수리 사례 | 드림전동차',
  seoDescription: '전진 불량 수리 사례',
  keywords: ['전동차 수리', '배선 보수'],
};

test('normalizeDraftInput maps repair payload', () => {
  const input = normalizeDraftInput({
    contentType: 'repair',
    title: '산업용 전동차 전진 불량 수리',
    vehicle: '산업용 전동차',
    location: '양주',
    symptoms: '전진은 되지 않고 후진만 작동함',
    diagnosis: '전진 배선 단선 확인',
    work: '배선 보수 후 전후진 시운전',
    result: '전진과 후진 모두 정상 작동 확인',
  });
  assert.equal(input.contentType, 'repair');
  assert.equal(input.symptoms[0], '전진은 되지 않고 후진만 작동함');
  assert.equal(input.diagnosis[0], '전진 배선 단선 확인');
});

test('normalizeDraftInput maps user production payload', () => {
  const input = normalizeDraftInput(userProductionPayload);
  assert.equal(input.contentType, 'production');
  assert.equal(input.title, '456');
  assert.equal(input.category, '산업용');
  assert.deepEqual(input.diagnosis, ['전자브레이크 쇼트']);
});

test('validateDraftInput rejects empty payload', () => {
  const input = normalizeDraftInput({ contentType: 'repair' });
  const result = validateDraftInput(input);
  assert.equal(result.ok, false);
});

test('sanitizeDraftFields rejects template particles', () => {
  assert.throws(
    () => sanitizeDraftFields({ ...sampleDraft, summary: '배선 단선(이)가 확인' }, { contentType: 'repair' }),
    (err) => err.code === 'OPENAI_RESPONSE_PARSE_FAILED',
  );
});

test('sanitizeDraftFields accepts legacy inspectionResult from model output', () => {
  const draft = sanitizeDraftFields({
    ...sampleDraft,
    diagnosis: undefined,
    inspectionResult: '전자브레이크 쇼트 확인',
  }, { contentType: 'repair' });
  assert.match(draft.diagnosis, /전자브레이크/);
});

test('callOpenAiDraft handles OpenAI 429', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 429,
    text: async () => 'rate limit',
  });
  const result = await callOpenAiDraft(env, normalizeDraftInput({
    contentType: 'repair',
    symptoms: ['전진 불량'],
    work: ['배선 보수'],
    result: ['정상 확인'],
  }), fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OPENAI_RATE_LIMIT');
  assert.equal(result.status, 429);
});

test('callOpenAiDraft handles OpenAI 401', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'invalid key' });
  const result = await callOpenAiDraft(env, normalizeDraftInput({
    contentType: 'production',
    category: '산업용',
    workTypes: ['신규 제작'],
    result: ['제작 완료'],
  }), fetchImpl);
  assert.equal(result.code, 'OPENAI_UNAUTHORIZED');
});

test('callOpenAiDraft handles OpenAI 400', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({
      error: { type: 'invalid_request_error', param: 'response_format', message: 'bad schema' },
    }),
  });
  const result = await callOpenAiDraft(env, normalizeDraftInput(userProductionPayload), fetchImpl);
  assert.equal(result.code, 'OPENAI_BAD_REQUEST');
  assert.equal(result.openAiStatus, 400);
});

test('callOpenAiDraft handles timeout', async () => {
  const fetchImpl = async () => {
    const err = new Error('timeout');
    err.name = 'TimeoutError';
    throw err;
  };
  const result = await callOpenAiDraft(env, normalizeDraftInput({
    contentType: 'repair',
    symptoms: ['전진 불량'],
    result: ['정상 확인'],
  }), fetchImpl);
  assert.equal(result.code, 'OPENAI_TIMEOUT');
});

test('callOpenAiDraft handles invalid JSON content', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }),
  });
  const result = await callOpenAiDraft(env, normalizeDraftInput({
    contentType: 'repair',
    symptoms: ['전진 불량'],
    result: ['정상 확인'],
  }), fetchImpl);
  assert.equal(result.code, 'OPENAI_RESPONSE_PARSE_FAILED');
});

test('callOpenAiDraft handles missing required draft fields', async () => {
  const fetchImpl = async () => openAiSuccessResponse({
    ...sampleDraft,
    workDetails: '',
  });
  const result = await callOpenAiDraft(env, normalizeDraftInput(userProductionPayload), fetchImpl);
  assert.equal(result.code, 'OPENAI_RESPONSE_PARSE_FAILED');
});

test('callOpenAiDraft succeeds with structured output', async () => {
  const fetchImpl = async () => openAiSuccessResponse(sampleDraft);
  const result = await callOpenAiDraft(env, normalizeDraftInput({
    contentType: 'repair',
    symptoms: ['전진 불량'],
    diagnosis: ['배선 단선'],
    work: ['배선 보수'],
    result: ['정상 확인'],
  }), fetchImpl);
  assert.equal(result.ok, true);
  assert.match(result.draft.summary, /배선/);
  assert.equal(result.draft.diagnosis.length > 0, true);
  assert.equal('inspectionResult' in result.draft, false);
});

test('generate-case-draft handler returns 503 without API key', async () => {
  const response = await onRequestPost({
    request: new Request('https://dreamev.kr/api/generate-case-draft', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ contentType: 'repair', symptoms: ['전진 불량'] }),
    }),
    env: { UPLOAD_ADMIN_SECRET: 'secret' },
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'CONFIG_ERROR');
});

test('generate-case-draft handler requires auth', async () => {
  const response = await onRequestPost({
    request: new Request('https://dreamev.kr/api/generate-case-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: 'repair', symptoms: ['전진 불량'], result: ['정상'] }),
    }),
    env,
  });
  assert.equal(response.status, 401);
});

test('generate-case-draft handler returns fixed success draft shape', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => openAiSuccessResponse(sampleDraft);
  try {
    const response = await onRequestPost({
      request: new Request('https://dreamev.kr/api/generate-case-draft', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(userProductionPayload),
      }),
      env,
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.draft.title, sampleDraft.title);
    assert.equal(typeof body.draft.diagnosis, 'string');
    assert.equal(Array.isArray(body.draft.keywords), true);
    assert.equal('inspectionResult' in body.draft, false);
    assert.equal('warnings' in body.draft, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildDraftPrompt includes only provided repair facts', () => {
  const prompt = buildDraftPrompt(normalizeDraftInput({
    contentType: 'repair',
    symptoms: ['전진 불량'],
    diagnosis: ['배선 단선'],
    work: ['배선 보수'],
    result: ['정상 확인'],
  }));
  assert.match(prompt.user, /전진 불량/);
  assert.match(prompt.user, /배선 단선/);
  assert.doesNotMatch(prompt.user, /서울/);
});

test('real OpenAI integration with user production payload', { skip: !process.env.OPENAI_API_KEY }, async () => {
  const result = await callOpenAiDraft(
    { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_MODEL: 'gpt-4o-mini' },
    normalizeDraftInput(userProductionPayload),
  );
  assert.equal(result.ok, true);
  assert.equal(typeof result.draft.diagnosis, 'string');
  assert.match(result.draft.workDetails, /배선|보수|작업/);
});
