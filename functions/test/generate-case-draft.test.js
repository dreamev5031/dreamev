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
  findInformalSpeechInText,
  findDraftInformalSpeechViolations,
  resolveOpenAiModel,
  countSentences,
  isResultTooBrief,
  isGenericDiagnosis,
  isSummaryInsufficient,
  findDraftExpansionViolations,
  findDraftFieldDuplicationViolations,
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

const repairInputSuv = {
  contentType: 'repair',
  vehicle: '산업용 SUV',
  symptoms: ['주행 불가'],
  diagnosis: ['컨트롤러 이상'],
  selectedWorkItems: ['컨트롤러 교체'],
  work: ['충전기 점검'],
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

test('isResultTooBrief rejects short literal result phrases', () => {
  assert.equal(isResultTooBrief('주행 정상 확인'), true);
  assert.equal(isResultTooBrief('현장 수리 완료'), true);
  assert.equal(isResultTooBrief('작업 후 시운전을 통해 차량이 정상적으로 주행하는 것을 확인했습니다.'), false);
});

test('isGenericDiagnosis rejects inspection-only diagnosis', () => {
  const input = normalizeDraftInput(repairInputSuv);
  assert.equal(isGenericDiagnosis('주행 불가 증상에 대해 점검을 진행했습니다.', input), true);
  assert.equal(
    isGenericDiagnosis('차량의 주행 계통을 점검한 결과 컨트롤러 이상이 확인되었습니다.', input),
    false,
  );
});

test('validateDraftQuality rejects insufficient expansion', () => {
  const input = normalizeDraftInput(repairInputSuv);
  const result = validateDraftQuality({
    ...repairSampleDraftSuv,
    summary: '주행 불가 점검을 진행했습니다.',
    diagnosis: '증상에 대해 점검을 진행했습니다.',
    workDetails: '컨트롤러 교체',
    result: '주행 정상 확인',
  }, input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient_expansion');
  assert.ok(result.expansionViolations.length >= 3);
});

test('validateDraftQuality rejects field duplication across repair fields', () => {
  const input = normalizeDraftInput(repairInputSuv);
  const result = validateDraftQuality({
    ...repairSampleDraftSuv,
    diagnosis: '차량의 주행 계통을 점검한 결과 컨트롤러 이상이 확인되었습니다. 충전기 작동 상태도 점검했습니다.',
    workDetails: '충전기 작동 상태를 점검하고 시운전을 진행했습니다.',
    result: '시운전을 통해 차량이 정상적으로 주행하는 것을 확인했습니다.',
    summary: '산업용 SUV에서 주행 불가 증상으로 점검을 진행했습니다. 충전기 상태를 확인하고 시운전을 진행했습니다.',
  }, input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'field_duplication');
  assert.ok(result.duplicationViolations.length >= 1);
});

test('findDraftFieldDuplicationViolations detects repeated topics', () => {
  const input = normalizeDraftInput({ contentType: 'repair', vehicle: '테스트', symptoms: ['주행 불량'] });
  const violations = findDraftFieldDuplicationViolations({
    summary: '시운전을 진행했습니다.',
    diagnosis: '컨트롤러 이상이 확인되었습니다.',
    workDetails: '시운전을 진행했습니다.',
    result: '정상 주행을 확인했습니다.',
  }, input);
  assert.ok(violations.some((v) => v.issue === 'repeated_topic' && v.topic === 'test_drive'));
});

test('callOpenAiDraft retries once when expansion quality fails', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return openAiSuccessResponse({
        ...repairSampleDraft,
        result: '주행 정상 확인',
      });
    }
    return openAiSuccessResponse(repairSampleDraftSuv);
  };
  const result = await callOpenAiDraft(env, normalizeDraftInput(repairInputSuv), fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

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
    ...repairSampleDraftController,
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
  assert.equal(findDraftFieldDuplicationViolations(result.draft, normalizeDraftInput(repairInputSuv)).length, 0);
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
