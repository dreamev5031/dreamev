import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../api/generate-case-draft.js';
import {
  buildDraftPrompt,
  buildOpenAiUserInput,
  callOpenAiDraft,
  isMeaninglessTitle,
  normalizeDraftInput,
  openAiDraftInternals,
  sanitizeProductionDraft,
  sanitizeRepairDraft,
  validateDraftInput,
  validateDraftQuality,
  normalizeRepairWorkItemLabel,
  findUnselectedWorkMentions,
} from '../lib/openai-draft.js';

const env = {
  UPLOAD_ADMIN_SECRET: 'secret',
  OPENAI_API_KEY: 'sk-test',
  OPENAI_MODEL: 'gpt-4.1-mini',
};

const repairInput1 = {
  contentType: 'repair',
  userTitle: '456',
  category: '산업용',
  vehicle: '산업용 전동차',
  location: '',
  workDate: '2026-06-25',
  symptoms: ['전진 불량'],
  diagnosis: ['전자브레이크 쇼트'],
  work: ['배선 보수'],
  result: ['주행 정상 확인'],
};

const repairInput2 = {
  contentType: 'repair',
  userTitle: '345345',
  vehicle: 'SUV형 전동차',
  location: '',
  symptoms: ['전진 불량'],
  diagnosis: ['충전기 불량'],
  work: ['시운전 및 전체 점검'],
  result: ['현장 수리 완료'],
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

const repairSampleDraft = {
  title: '산업용 전동차 전진 불량 전자브레이크 배선 수리',
  summary: '전진이 되지 않는 산업용 전동차를 점검한 결과 전자브레이크 계통의 쇼트가 확인되어 관련 배선을 보수하고 시운전을 진행했습니다.',
  customerRequest: '산업용 전동차가 전진하지 않는 증상으로 현장 점검과 수리를 요청받았습니다.',
  diagnosis: '주행 및 브레이크 계통을 점검한 결과 전자브레이크 회로에서 쇼트가 확인되었습니다.',
  workDetails: '쇼트가 발생한 관련 배선을 점검하고 손상된 부분을 보수한 뒤 시운전을 진행했습니다.',
  result: '작업 후 시운전을 통해 차량이 정상적으로 주행하는 것을 확인했습니다.',
  seoTitle: '산업용 전동차 전진 불량 전자브레이크 배선 수리',
  seoDescription: '전진 불량 증상의 산업용 전동차에서 전자브레이크 쇼트를 확인하고 배선 보수를 진행한 수리 사례입니다.',
  keywords: ['산업용 전동차 수리', '전동차 전진 불량', '전자브레이크 쇼트', '전동차 배선 보수'],
};

test('normalizeRepairWorkItemLabel normalizes spacing and brush spelling', () => {
  assert.equal(normalizeRepairWorkItemLabel('배선교체'), '배선 교체');
  assert.equal(normalizeRepairWorkItemLabel('카본브러쉬 교체'), '카본브러시 교체');
});

test('normalizeDraftInput maps selectedWorkItems', () => {
  const input = normalizeDraftInput({
    contentType: 'repair',
    vehicle: '산업용 전동차',
    symptoms: ['주행 불량'],
    diagnosis: ['컨트롤러 출력 이상'],
    selectedWorkItems: ['컨트롤러 교체', '배선교체'],
    work: ['교체 후 주행 테스트 진행'],
    result: ['주행 정상 확인'],
  });
  assert.deepEqual(input.selectedWorkItems, ['컨트롤러 교체', '배선 교체']);
});

test('validateDraftQuality rejects unselected work mention', () => {
  const input = normalizeDraftInput({
    contentType: 'repair',
    vehicle: '산업용 전동차',
    symptoms: ['주행 불량'],
    selectedWorkItems: ['컨트롤러 교체'],
    work: ['주행 테스트'],
    result: ['주행 정상 확인'],
  });
  const result = validateDraftQuality({
    ...repairSampleDraft,
    workDetails: '컨트롤러를 교체하고 타이어 교체를 진행했습니다.',
  }, input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unselected_work_mention');
});

test('findUnselectedWorkMentions ignores selected items', () => {
  const mentions = findUnselectedWorkMentions(
    '컨트롤러 교체와 배선 교체를 진행했습니다.',
    ['컨트롤러 교체', '배선 교체'],
  );
  assert.deepEqual(mentions, []);
});

test('callOpenAiDraft succeeds with selectedWorkItems in prompt', async () => {
  const fetchImpl = async () => openAiSuccessResponse({
    ...repairSampleDraft,
    workDetails: '점검 결과에 따라 컨트롤러를 교체하고 관련 배선을 정비한 뒤 주행 상태를 확인했습니다.',
  });
  const result = await callOpenAiDraft(env, normalizeDraftInput({
    contentType: 'repair',
    vehicle: '산업용 전동차',
    symptoms: ['주행 불량'],
    diagnosis: ['컨트롤러 출력 이상'],
    selectedWorkItems: ['컨트롤러 교체', '배선 교체'],
    work: ['교체 후 주행 테스트 진행'],
    result: ['주행 정상 확인'],
  }), fetchImpl);
  assert.equal(result.ok, true);
});

test('default model is gpt-4.1-mini', () => {
  assert.equal(openAiDraftInternals.DEFAULT_MODEL, 'gpt-4.1-mini');
});

test('isMeaninglessTitle detects numeric title', () => {
  assert.equal(isMeaninglessTitle('456'), true);
  assert.equal(isMeaninglessTitle('345345'), true);
  assert.equal(isMeaninglessTitle('산업용 전동차 전진 불량'), false);
});

test('buildOpenAiUserInput uses empty location and workTypes', () => {
  const input = normalizeDraftInput(repairInput1);
  const json = buildOpenAiUserInput(input);
  assert.equal(json.location, '');
  assert.equal(json.workTypes, '');
  assert.equal(json.userTitle, '456');
});

test('validateDraftQuality rejects numeric title', () => {
  const input = normalizeDraftInput(repairInput1);
  const result = validateDraftQuality({ ...repairSampleDraft, title: '456' }, input);
  assert.equal(result.ok, false);
});

test('sanitizeRepairDraft returns diagnosis field', () => {
  const input = normalizeDraftInput(repairInput1);
  const draft = sanitizeRepairDraft(repairSampleDraft, input);
  assert.match(draft.title, /전진|전자브레이크|배선/);
  assert.equal(typeof draft.diagnosis, 'string');
  assert.equal('workDetails' in draft, true);
  assert.equal('productionDetails' in draft, false);
});

test('callOpenAiDraft handles OpenAI 401', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'invalid key' });
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInput1), fetchImpl);
  assert.equal(result.code, 'OPENAI_AUTH_ERROR');
});

test('callOpenAiDraft handles OpenAI 429', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => 'rate limit' });
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInput1), fetchImpl);
  assert.equal(result.code, 'OPENAI_RATE_LIMIT');
});

test('callOpenAiDraft handles OpenAI 400 schema error', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({
      error: { type: 'invalid_request_error', param: 'response_format', message: 'Invalid schema' },
    }),
  });
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInput1), fetchImpl);
  assert.equal(result.code, 'OPENAI_SCHEMA_ERROR');
});

test('callOpenAiDraft handles timeout', async () => {
  const fetchImpl = async () => {
    const err = new Error('timeout');
    err.name = 'TimeoutError';
    throw err;
  };
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInput1), fetchImpl);
  assert.equal(result.code, 'OPENAI_TIMEOUT');
});

test('callOpenAiDraft retries once on meaningless title', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return openAiSuccessResponse(
      calls === 1
        ? { ...repairSampleDraft, title: '456' }
        : repairSampleDraft,
    );
  };
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInput1), fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.notEqual(result.draft.title, '456');
});

test('callOpenAiDraft does not invent replacement when only inspection work', async () => {
  const fetchImpl = async () => openAiSuccessResponse({
    ...repairSampleDraft,
    workDetails: '시운전 및 전체 점검을 진행했습니다.',
    result: '현장 수리 완료 상태로 마무리했습니다.',
  });
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInput2), fetchImpl);
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.draft.result, /정상적으로 주행/);
});

test('generate-case-draft handler returns repair draft shape', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => openAiSuccessResponse(repairSampleDraft);
  try {
    const response = await onRequestPost({
      request: new Request('https://dreamev.kr/api/generate-case-draft', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(repairInput1),
      }),
      env,
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(typeof body.draft.diagnosis, 'string');
    assert.equal(typeof body.draft.workDetails, 'string');
    assert.equal(body.draft.productionDetails, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildDraftPrompt includes repair developer rules', () => {
  const prompt = buildDraftPrompt(normalizeDraftInput(repairInput1));
  assert.match(prompt.system, /수리사례/);
  assert.match(prompt.user, /전진 불량/);
  assert.doesNotMatch(prompt.user, /후진/);
});

test('real OpenAI integration repair input 1', { skip: !process.env.OPENAI_API_KEY }, async () => {
  const result = await callOpenAiDraft(
    { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_MODEL: 'gpt-4.1-mini' },
    normalizeDraftInput(repairInput1),
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.notEqual(result.draft.title, '456');
  assert.match(result.draft.workDetails, /배선|보수/);
  assert.match(result.draft.result, /정상|주행/);
  assert.equal(result.model, 'gpt-4.1-mini');
});

test('real OpenAI integration repair input 2', { skip: !process.env.OPENAI_API_KEY }, async () => {
  const result = await callOpenAiDraft(
    { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_MODEL: 'gpt-4.1-mini' },
    normalizeDraftInput(repairInput2),
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.notEqual(result.draft.title, '345345');
  assert.doesNotMatch(result.draft.result, /정상적으로 주행/);
});

test('production schema draft sanitizes productionDetails and features', () => {
  const input = normalizeDraftInput({
    contentType: 'production',
    userTitle: '999',
    category: '산업용',
    workTypes: ['맞춤 제작'],
    result: ['납품 완료'],
  });
  const draft = sanitizeProductionDraft({
    title: '산업용 전동대차 맞춤 제작',
    summary: '공장 내부 운반용 전동대차를 맞춤 제작했습니다.',
    customerRequest: '공장 내부 운반용 차량 제작을 요청받았습니다.',
    productionDetails: '적재함 구조와 구동 계통을 현장 요구에 맞게 제작했습니다.',
    features: '좁은 통로에서 운행하기 쉬운 조향 구조를 적용했습니다.',
    result: '납품 후 현장에서 시운전을 진행했습니다.',
    seoTitle: '산업용 전동대차 맞춤 제작',
    seoDescription: '공장 운반용 맞춤 전동대차 제작 사례입니다.',
    keywords: ['산업용 전동대차 제작', '맞춤 전동차 제작'],
  }, input);
  assert.equal(typeof draft.productionDetails, 'string');
  assert.equal(typeof draft.features, 'string');
});

test('validateDraftInput rejects empty payload', () => {
  const input = normalizeDraftInput({ contentType: 'repair' });
  const result = validateDraftInput(input);
  assert.equal(result.ok, false);
});

test('generate-case-draft handler returns 503 without API key', async () => {
  const response = await onRequestPost({
    request: new Request('https://dreamev.kr/api/generate-case-draft', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(repairInput1),
    }),
    env: { UPLOAD_ADMIN_SECRET: 'secret' },
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'OPENAI_CONFIG_MISSING');
  assert.equal(body.success, false);
  assert.ok(body.requestId);
});
