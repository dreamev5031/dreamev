import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../api/generate-case-draft.js';
import {
  buildDraftPrompt,
  buildOpenAiUserInput,
  buildRepairFallbackDraft,
  callOpenAiDraft,
  isMeaninglessTitle,
  normalizeDraftInput,
  openAiDraftInternals,
  parseOpenAiDraftJson,
  sanitizeProductionDraft,
  sanitizeRepairDraft,
  stripJsonCodeFence,
  validateDraftInput,
  validateDraftQuality,
  normalizeRepairWorkItemLabel,
  findUnselectedWorkMentions,
  findInformalSpeechInText,
  findDraftInformalSpeechViolations,
  resolveOpenAiModel,
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
  workContent: '배선 보수',
  result: ['주행 정상 확인'],
};

const repairInput2 = {
  contentType: 'repair',
  userTitle: '345345',
  vehicle: 'SUV형 전동차',
  location: '',
  symptoms: ['전진 불량'],
  diagnosis: ['충전기 불량'],
  workContent: '시운전 및 전체 점검',
  result: ['현장 수리 완료'],
};

const repairInputContactor = {
  contentType: 'repair',
  userTitle: '석고 운반용 전동차',
  vehicle: '석고 운반용 전동차',
  symptoms: ['컨택터 작동 불량', '주행 불가'],
  diagnosis: [],
  workContent: '컨택터 이상으로 주행 불가 컨택터 신품으로 교체후 정상작동',
  result: ['정상 작동'],
};

function openAiRawContentResponse(rawContent) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{ message: { content: rawContent } }],
    }),
  };
}

const repairInputSuv = {
  contentType: 'repair',
  vehicle: '산업용 SUV',
  symptoms: ['주행 불가'],
  diagnosis: ['컨트롤러 이상'],
  workContent: '컨트롤러 교체, 충전기 점검',
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

const repairSampleDraft = {
  title: '산업용 전동차 전진 불량 전자브레이크 배선 수리',
  summary: '산업용 전동차에서 전진 불량 증상이 발생해 현장 점검을 진행했습니다. 점검 결과 전자브레이크 계통 쇼트가 확인되어 배선 보수 작업을 진행했습니다.',
  customerRequest: '산업용 전동차가 전진하지 않는 증상으로 현장 점검과 수리를 요청받았습니다.',
  diagnosis: '주행 및 브레이크 계통을 점검한 결과 전자브레이크 회로에서 쇼트가 확인되었습니다.',
  workDetails: '쇼트가 발생한 관련 배선을 점검하고 손상된 부분을 보수한 뒤 시운전을 진행했습니다.',
  result: '작업 후 차량이 정상적으로 주행하는 것을 확인했습니다.',
  seoTitle: '산업용 전동차 전진 불량 전자브레이크 배선 수리',
  seoDescription: '전진 불량 증상의 산업용 전동차에서 전자브레이크 쇼트를 확인하고 배선 보수를 진행한 수리 사례입니다.',
  keywords: ['산업용 전동차 수리', '전동차 전진 불량', '전자브레이크 쇼트', '전동차 배선 보수'],
};

const repairSampleDraft2 = {
  title: 'SUV형 전동차 전진 불량 충전기 점검',
  summary: 'SUV형 전동차에서 전진 불량 증상이 발생해 현장 점검을 진행했습니다. 점검 결과 원인이 확인되어 관련 수리 작업을 진행했습니다.',
  customerRequest: 'SUV형 전동차가 전진하지 않는 증상으로 점검을 요청받았습니다.',
  diagnosis: '전원 및 충전 계통을 점검한 결과 충전기 불량 상태가 확인되었습니다.',
  workDetails: '시운전과 전체 점검을 진행하여 차량 상태를 종합적으로 확인했습니다.',
  result: '현장에서 수리 작업을 완료하고 차량을 인계했습니다.',
  seoTitle: 'SUV형 전동차 전진 불량 충전기 점검',
  seoDescription: 'SUV형 전동차 전진 불량 증상에서 충전기 상태를 점검하고 시운전 및 전체 점검을 실시한 수리 사례입니다.',
  keywords: ['SUV형 전동차 수리', '전동차 전진 불량', '충전기 점검', '전동차 시운전'],
};

const repairSampleDraftSuv = {
  title: '산업용 SUV 주행 불가 컨트롤러 교체',
  summary: '산업용 SUV 전동차에서 주행 불가 증상으로 현장 점검을 진행했습니다. 점검 결과 컨트롤러 이상이 확인되어 교체 작업을 진행했습니다.',
  customerRequest: '산업용 SUV 전동차가 주행되지 않는 증상으로 점검과 수리를 요청받았습니다.',
  diagnosis: '차량의 주행 계통과 전원 상태를 점검한 결과 컨트롤러 이상이 확인되었습니다.',
  workDetails: '이상이 확인된 컨트롤러를 교체했습니다. 이후 충전기 작동 상태를 점검하고 주행 확인을 위해 시운전을 진행했습니다.',
  result: '작업 후 차량이 정상적으로 주행하는 것을 확인했습니다.',
  seoTitle: '산업용 SUV 주행 불가 컨트롤러 교체',
  seoDescription: '산업용 SUV 전동차 주행 불가 증상에서 컨트롤러 이상을 확인하고 교체 및 충전기 점검을 진행한 수리 사례입니다.',
  keywords: ['산업용 SUV 수리', '전동차 주행 불가', '컨트롤러 교체', '충전기 점검'],
};

const repairSampleDraftController = {
  title: '산업용 전동차 주행 불량 컨트롤러 배선 교체',
  summary: '산업용 전동차에서 주행 불량 증상이 발생해 현장 점검을 진행했습니다. 점검 결과 컨트롤러 출력 이상이 확인되어 교체 작업을 진행했습니다.',
  customerRequest: '산업용 전동차가 주행 불량 증상으로 점검과 수리를 요청받았습니다.',
  diagnosis: '주행 계통을 점검한 결과 컨트롤러 출력 이상이 확인되었습니다.',
  workDetails: '점검 결과에 따라 컨트롤러를 교체하고 관련 배선을 정비한 뒤 주행 테스트를 진행했습니다.',
  result: '작업 후 차량이 정상적으로 주행하는 것을 확인했습니다.',
  seoTitle: '산업용 전동차 주행 불량 컨트롤러 배선 교체',
  seoDescription: '산업용 전동차 주행 불량 증상에서 컨트롤러 출력 이상을 확인하고 컨트롤러·배선 교체를 진행한 수리 사례입니다.',
  keywords: ['산업용 전동차 수리', '컨트롤러 교체', '배선 교체', '주행 불량'],
};

test('findInformalSpeechInText detects haera-che sentence endings only', () => {
  assert.deepEqual(findInformalSpeechInText('점검을 진행했다.'), ['했다.']);
  assert.deepEqual(findInformalSpeechInText('점검을 진행했습니다.'), []);
  assert.deepEqual(findInformalSpeechInText('주행 불량 전자브레이크 수리'), []);
  assert.deepEqual(findInformalSpeechInText('요청했다. 작업 후 확인했습니다.'), ['했다.']);
});

test('validateDraftQuality rejects informal speech in body fields', () => {
  const input = normalizeDraftInput(repairInput2);
  const result = validateDraftQuality({
    ...repairSampleDraft,
    summary: '주행이 되지 않는 증상으로 점검을 요청했다.',
    customerRequest: '점검을 요청받았습니다.',
  }, input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'informal_speech');
});

test('validateDraftQuality allows noun-style title with informal-like substring', () => {
  const input = normalizeDraftInput(repairInput1);
  const result = validateDraftQuality({
    ...repairSampleDraft,
    title: '산업용 전동차 전진 불량 배선 수리',
  }, input);
  assert.equal(result.ok, true);
});

test('callOpenAiDraft retries once when informal speech detected', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return openAiSuccessResponse({
        ...repairSampleDraft,
        workDetails: '컨트롤러를 교체하고 충전기 상태를 점검했다.',
      });
    }
    return openAiSuccessResponse(repairSampleDraft);
  };
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInput1), fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

test('callOpenAiDraft fails without auto-replace when informal speech persists', async () => {
  const fetchImpl = async () => openAiSuccessResponse({
    ...repairSampleDraft,
    result: '작업 후 정상 주행을 확인했다.',
  });
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInput1), fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(result.qualityReason, 'informal_speech');
  assert.match(result.message, /존댓말/);
});

test('normalizeRepairWorkItemLabel normalizes spacing and brush spelling', () => {
  assert.equal(normalizeRepairWorkItemLabel('배선교체'), '배선 교체');
  assert.equal(normalizeRepairWorkItemLabel('카본브러쉬 교체'), '카본브러시 교체');
});

test('normalizeDraftInput maps legacy work fields to workContent', () => {
  const input = normalizeDraftInput({
    contentType: 'repair',
    vehicle: '산업용 전동차',
    symptoms: ['주행 불량'],
    diagnosis: ['컨트롤러 출력 이상'],
    selectedWorkItems: ['컨트롤러 교체', '배선교체'],
    work: ['교체 후 주행 테스트 진행'],
    result: ['주행 정상 확인'],
  });
  assert.match(input.workContent, /컨트롤러 교체/);
  assert.match(input.workContent, /배선교체|배선 교체/);
  assert.match(input.workContent, /주행 테스트/);
});

test('normalizeDraftInput accepts string symptoms and results', () => {
  const input = normalizeDraftInput({
    contentType: 'repair',
    vehicle: '전동차',
    symptoms: '컨택터 작동 불량, 주행 불가',
    workContent: '컨택터 교체',
    result: '정상 작동',
  });
  assert.deepEqual(input.symptoms, ['컨택터 작동 불량', '주행 불가']);
  assert.deepEqual(input.result, ['정상 작동']);
});

test('normalizeDraftInput accepts repairContent and repairDetails aliases', () => {
  const input = normalizeDraftInput({
    contentType: 'repair',
    vehicle: '전동차',
    symptoms: ['주행 불가'],
    repairDetails: '컨택터 이상으로 교체 작업',
    result: ['정상 작동'],
  });
  assert.match(input.workContent, /컨택터/);
});

test('stripJsonCodeFence and parseOpenAiDraftJson handle fenced JSON', () => {
  const fenced = '```json\n{"title":"테스트"}\n```';
  assert.equal(stripJsonCodeFence(fenced), '{"title":"테스트"}');
  const parsed = parseOpenAiDraftJson(fenced);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.title, '테스트');
});

test('callOpenAiDraft uses input fallback when OpenAI returns invalid JSON', async () => {
  const fetchImpl = async () => openAiRawContentResponse('not-json-at-all');
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInputContactor), fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.usedFallback, true);
  assert.match(result.draft.workDetails, /컨택터/);
});

test('callOpenAiDraft uses input fallback when OpenAI returns empty content', async () => {
  const fetchImpl = async () => openAiRawContentResponse('');
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInputContactor), fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.usedFallback, true);
});

test('buildRepairFallbackDraft uses only user facts', () => {
  const draft = buildRepairFallbackDraft(normalizeDraftInput(repairInputContactor));
  assert.match(draft.customerRequest, /컨택터 작동 불량/);
  assert.match(draft.workDetails, /컨택터/);
  assert.match(draft.result, /정상 작동/);
});

test('generate-case-draft handler succeeds with workContent-only contactor payload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => openAiSuccessResponse({
    ...repairSampleDraft,
    title: '석고 운반용 전동차 컨택터 교체 작업',
    customerRequest: '석고 운반용 전동차에서 컨택터 작동 불량과 주행 불가 증상으로 점검을 요청받았습니다.',
    workDetails: '점검 결과 컨택터 이상이 확인되어 신품 컨택터로 교체 작업을 진행했습니다.',
    result: '작업 후 정상 작동 상태를 확인했습니다.',
  });
  try {
    const response = await onRequestPost({
      request: new Request('https://dreamev.kr/api/generate-case-draft', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(repairInputContactor),
      }),
      env,
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.match(body.draft.workDetails, /컨택터/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generate-case-draft handler does not throw when legacy work arrays are absent', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => openAiSuccessResponse(repairSampleDraft);
  const payload = {
    contentType: 'repair',
    vehicle: '전동차',
    symptoms: ['주행 불가'],
    workContent: '컨택터 교체 작업 진행',
    result: ['정상 작동'],
  };
  try {
    const response = await onRequestPost({
      request: new Request('https://dreamev.kr/api/generate-case-draft', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }),
      env,
    });
    assert.notEqual(response.status, 500);
    const body = await response.json();
    assert.notEqual(body.code, 'INTERNAL_ERROR');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('validateDraftInput requires workContent when symptoms provided', () => {
  const input = normalizeDraftInput({
    contentType: 'repair',
    vehicle: '전동차',
    symptoms: ['전진 불량'],
    result: ['주행 정상 확인'],
  });
  const result = validateDraftInput(input);
  assert.equal(result.ok, false);
  assert.match(result.message, /작업 내용/);
});

test('findUnselectedWorkMentions ignores selected items', () => {
  const mentions = findUnselectedWorkMentions(
    '컨트롤러 교체와 배선 교체를 진행했습니다.',
    ['컨트롤러 교체', '배선 교체'],
  );
  assert.deepEqual(mentions, []);
});

test('callOpenAiDraft succeeds with workContent in prompt', async () => {
  const fetchImpl = async () => openAiSuccessResponse({
    ...repairSampleDraftController,
    workDetails: '점검 결과에 따라 컨트롤러를 교체하고 관련 배선을 정비한 뒤 주행 상태를 확인했습니다.',
  });
  const result = await callOpenAiDraft(env, normalizeDraftInput({
    contentType: 'repair',
    vehicle: '산업용 전동차',
    symptoms: ['주행 불량'],
    diagnosis: ['컨트롤러 출력 이상'],
    workContent: '컨트롤러 교체, 배선 교체, 주행 테스트',
    result: ['주행 정상 확인'],
  }), fetchImpl);
  assert.equal(result.ok, true);
});

test('default model is gpt-4.1-mini', () => {
  assert.equal(openAiDraftInternals.DEFAULT_MODEL, 'gpt-4.1-mini');
});

test('resolveOpenAiModel uses OPENAI_MODEL env when set', () => {
  assert.equal(resolveOpenAiModel({ OPENAI_MODEL: 'gpt-4.1-mini' }), 'gpt-4.1-mini');
  assert.equal(resolveOpenAiModel({ OPENAI_MODEL: '  gpt-4.1-mini  ' }), 'gpt-4.1-mini');
  assert.equal(resolveOpenAiModel({}), 'gpt-4.1-mini');
});

test('callOpenAiDraft sends OPENAI_MODEL to OpenAI API', async () => {
  let requestModel = '';
  const fetchImpl = async (_url, init) => {
    requestModel = JSON.parse(init.body).model;
    return openAiSuccessResponse(repairSampleDraft);
  };
  const result = await callOpenAiDraft(
    { ...env, OPENAI_MODEL: 'gpt-4.1-mini' },
    normalizeDraftInput(repairInput1),
    fetchImpl,
  );
  assert.equal(result.ok, true);
  assert.equal(requestModel, 'gpt-4.1-mini');
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

test('callOpenAiDraft does not retry on meaningless title', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return openAiSuccessResponse({ ...repairSampleDraft, title: '456' });
  };
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInput1), fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.equal(result.qualityReason, 'numeric_title');
});

test('callOpenAiDraft does not invent replacement when only inspection work', async () => {
  const fetchImpl = async () => openAiSuccessResponse({
    ...repairSampleDraft2,
    workDetails: '시운전과 전체 점검을 진행하여 차량의 전반적인 상태를 확인했습니다.',
    result: '현장 수리 완료 상태로 작업을 마무리했습니다.',
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

test('real OpenAI integration contactor repair input', { skip: !process.env.OPENAI_API_KEY }, async () => {
  const result = await callOpenAiDraft(
    { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_MODEL: 'gpt-4.1-mini' },
    normalizeDraftInput(repairInputContactor),
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(result.draft.workDetails, /컨택터/);
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
    normalizeDraftInput(repairInputSuv),
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(result.draft.diagnosis, /컨트롤러/);
});

test('production schema draft sanitizes productionDetails features and specifications', () => {
  const input = normalizeDraftInput({
    contentType: 'production',
    title: '공장 자재 운반용 전동대차',
    vehicleCategory: '전동대차',
    purpose: '공장 내 자재 운반',
    customerRequest: '좁은 통로 운반 요청',
    customWork: '적재함 맞춤 제작',
    specifications: { voltage: '48V', motor: '3kW' },
    result: '제작 및 납품 완료',
  });
  assert.equal(input.vehicleCategory, '전동대차');
  assert.equal(input.specifications.voltage, '48V');
  const draft = sanitizeProductionDraft({
    title: '공장 자재 운반용 전동대차 맞춤 제작',
    summary: '공장 내부 운반용 전동대차를 맞춤 제작했습니다.',
    customerRequest: '공장 내부 운반용 차량 제작을 요청받았습니다.',
    productionDetails: '적재함 구조와 구동 계통을 현장 요구에 맞게 제작했습니다.',
    specifications: '전압 48V, 모터 3kW',
    features: '좁은 통로에서 운행하기 쉬운 조향 구조를 적용했습니다.',
    result: '납품 후 현장에서 시운전을 진행했습니다.',
    seoTitle: '산업용 전동대차 맞춤 제작',
    seoDescription: '공장 운반용 맞춤 전동대차 제작 사례입니다.',
    keywords: ['산업용 전동대차 제작', '맞춤 전동차 제작'],
  }, input);
  assert.equal(typeof draft.productionDetails, 'string');
  assert.equal(typeof draft.specifications, 'string');
  assert.equal(typeof draft.features, 'string');
});

test('repair input ignores production specifications fields', () => {
  const input = normalizeDraftInput({
    contentType: 'repair',
    userTitle: '수리',
    vehicle: '전동차',
    symptoms: ['전진 불량'],
    workContent: '배선 보수',
    specifications: { voltage: '48V' },
    result: ['주행 정상 확인'],
  });
  assert.equal(input.contentType, 'repair');
  assert.equal(input.specifications, undefined);
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
  assert.equal(body.code, 'CONFIG_ERROR');
  assert.equal(body.success, false);
  assert.ok(body.requestId);
});
