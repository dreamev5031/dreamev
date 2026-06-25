const DEFAULT_MODEL = 'gpt-4.1-mini';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 1_400;
const MAX_RETRIES = 1;

const LIMITS = {
  title: 120,
  category: 40,
  vehicle: 80,
  location: 80,
  listItem: 80,
  listCount: 10,
  additionalNote: 500,
  singleField: 400,
};

const EMPTY_MARKERS = new Set(['', '-', '없음', '미입력', 'n/a', 'N/A']);

const FORBIDDEN_PATTERNS = [
  /\(이\)가/,
  /\(을\)를/,
  /\(은\)는/,
  /\(와\)과/,
];

const MEANINGLESS_TITLE_PATTERNS = [
  /^DREAMEV$/i,
  /^test$/i,
  /^SSSS$/i,
  /^\d+$/,
  /^[a-zA-Z0-9]{1,6}$/,
];

const COMMON_SYSTEM_PROMPT = `너는 산업용 전동차, 전동대차, 전동카트, 골프카의 제작 및 수리 사례를 작성하는 기술 콘텐츠 편집자다.

사용자가 입력한 실제 작업 정보를 바탕으로 회사 홈페이지에 게시할 자연스럽고 신뢰감 있는 한국어 사례 글을 작성한다.

가장 중요한 규칙:
* 사용자가 입력한 사실만 사용한다.
* 입력하지 않은 부품 교체, 고장 원인, 지역, 성능, 수치, 작업 결과를 새로 만들지 않는다.
* 사실을 추가하지 않는 범위에서 문장 구조와 표현은 자연스럽게 확장한다.
* 입력 문장을 단순 복사하지 말고 의미를 유지한 채 전문적인 사례 문장으로 다시 작성한다.
* 현장 기술자가 실제로 작성한 것처럼 구체적이고 차분한 문체를 사용한다.
* 과장 광고, 감탄 표현, 막연한 홍보 문구는 사용하지 않는다.
* 일반 고객도 이해할 수 있는 표현을 사용한다.
* 각 항목은 중복 없이 역할이 분명해야 한다.
* "(이)가", "을(를)", "은(는)" 같은 선택형 조사 표현을 절대 출력하지 않는다.
* "확인했습니다"라는 표현을 한 글에서 지나치게 반복하지 않는다.
* 입력에 없는 정상 작동이나 수리 성공을 임의로 단정하지 않는다.
* 작업 결과에 정상 주행 확인이 입력된 경우에만 정상 작동을 확인했다고 작성한다.
* 실제 교체가 입력된 경우에만 "교체"라고 작성한다.
* 점검만 입력된 경우 교체나 수리를 했다고 확대 해석하지 않는다.
* 제목이 숫자, 임의 문자열, DREAMEV, test, SSSS처럼 의미 없는 값이면 해당 제목을 사용하지 말고 작업 내용을 바탕으로 새 제목을 만든다.
* 차량 명칭이 애매하면 사용자가 입력한 표현을 그대로 유지한다.
* 문장은 짧고 명확하게 작성하되 지나치게 단문만 나열하지 않는다.
* Markdown 기호는 출력하지 않는다.
* JSON 외의 설명은 출력하지 않는다.`;

const REPAIR_DEVELOPER_PROMPT = `contentType이 repair인 수리사례를 작성한다.

작성 목적:
고객이 어떤 증상으로 요청했고, 무엇을 점검했으며, 어떤 작업을 했고, 결과가 어땠는지를 명확히 보여주는 수리사례를 작성한다.

출력 항목: title, summary, customerRequest, diagnosis, workDetails, result, seoTitle, seoDescription, keywords

title: 차량 종류 + 핵심 증상 + 주요 점검 또는 수리 내용, 22~45자 권장, 의미 없는 userTitle 무시, 지역은 입력된 경우에만
summary: 60~130자, 증상·점검 결과·주요 작업 포함
customerRequest: 입력 증상만, 1~2문장
diagnosis: 입력된 점검 결과·원인만, 없으면 점검 진행 수준, 1~2문장
workDetails: 입력된 수리·보수·점검·교체·시운전만, 1~3문장
result: 입력 결과만, "주행 정상 확인"이 있을 때만 정상 주행 확인 표현 가능, "현장 수리 완료"만 있으면 정상 작동 추가 금지
seoTitle: 30~55자, 회사명 불필요 시 생략
seoDescription: 70~140자, 키워드 나열 금지
keywords: 4~7개 문자열 배열, 구체적 조합, 입력 없는 지역·부품 금지

selectedWorkItems 규칙:
* selectedWorkItems는 사용자가 선택한 실제 작업 사실이다.
* 선택된 항목만 workDetails와 keywords에 반영한다.
* 선택하지 않은 부품 교체나 작업을 새로 만들지 말 것.
* work는 사용자가 자유 입력한 작업 설명이다. selectedWorkItems와 자연스럽게 합치되 같은 내용을 반복하지 말 것.
* EM브레이크는 전자브레이크로 바꾸지 말고 입력 명칭을 우선 유지한다.
* ET126 쓰로틀 교체는 "ET126 쓰로틀" 또는 "ET126 가속 레버" 중 자연스러운 표현을 사용한다.
* 프레임 관련 작업은 구체 내용이 없으면 용접, 보강, 절단 등을 임의로 추가하지 말 것.
* 배선 교체, 카본브러시 교체 표기는 띄어쓰기를 유지한다.`;

const PRODUCTION_DEVELOPER_PROMPT = `contentType이 production인 제작사례를 작성한다.

작성 목적:
어떤 용도로 차량을 제작했고, 어떤 구조와 기능을 적용했으며, 어떤 현장에 적합한지를 보여주는 제작사례를 작성한다.

출력 항목: title, summary, customerRequest, productionDetails, features, result, seoTitle, seoDescription, keywords

title: 차량 유형 + 주요 용도 또는 특징, 22~45자, 의미 없는 userTitle 무시
summary: 제작 목적·핵심 사양, 60~130자
customerRequest: 입력된 용도·요구만
productionDetails: 제작·장착·구조 변경·사양 적용, 숫자는 입력된 경우만, 1~3문장
features: 입력된 기능·장점, 과장 표현 금지
result: 납품·시운전·현장 적용 결과가 입력된 경우만
seoTitle: 30~55자
seoDescription: 70~140자
keywords: 4~7개, 구체적 조합`;

function buildStringSchema(properties, required) {
  return {
    name: 'case_draft',
    strict: true,
    schema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
  };
}

const STRING = { type: 'string' };
const KEYWORDS = { type: 'array', items: { type: 'string' } };

export const REPAIR_JSON_SCHEMA = buildStringSchema(
  {
    title: STRING,
    summary: STRING,
    customerRequest: STRING,
    diagnosis: STRING,
    workDetails: STRING,
    result: STRING,
    seoTitle: STRING,
    seoDescription: STRING,
    keywords: KEYWORDS,
  },
  ['title', 'summary', 'customerRequest', 'diagnosis', 'workDetails', 'result', 'seoTitle', 'seoDescription', 'keywords'],
);

export const PRODUCTION_JSON_SCHEMA = buildStringSchema(
  {
    title: STRING,
    summary: STRING,
    customerRequest: STRING,
    productionDetails: STRING,
    features: STRING,
    result: STRING,
    seoTitle: STRING,
    seoDescription: STRING,
    keywords: KEYWORDS,
  },
  ['title', 'summary', 'customerRequest', 'productionDetails', 'features', 'result', 'seoTitle', 'seoDescription', 'keywords'],
);

function trimText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function emptyAsBlank(value) {
  const text = trimText(value, LIMITS.singleField);
  return EMPTY_MARKERS.has(text) ? '' : text;
}

function normalizeStringList(value, maxItems = LIMITS.listCount, maxItemLen = LIMITS.listItem) {
  if (!Array.isArray(value)) {
    if (typeof value === 'string') {
      const text = emptyAsBlank(value);
      return text ? [trimText(text, maxItemLen)] : [];
    }
    return [];
  }
  return value
    .map((item) => trimText(emptyAsBlank(item), maxItemLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

export const REPAIR_WORK_ITEM_CANONICAL = [
  '배터리 교체',
  '비상스위치 교체',
  '브레이크 스위치 교체',
  'EM브레이크 교체',
  '컨트롤러 교체',
  'ET126 쓰로틀 교체',
  '프레임 관련 작업',
  '타이어 교체',
  '가변저항 교체',
  '배선 교체',
  '모터 교체',
  '카본브러시 교체',
  '충전기 교체',
];

const REPAIR_WORK_ITEM_ALIASES = {
  '배선교체': '배선 교체',
  '배선 교체': '배선 교체',
  '카본브러쉬 교체': '카본브러시 교체',
  '카본브러시 교체': '카본브러시 교체',
  'ET126(쓰로틀) 교체': 'ET126 쓰로틀 교체',
};

export function normalizeRepairWorkItemLabel(item) {
  const text = trimText(item, LIMITS.listItem);
  if (!text || text === '기타 직접 입력') return '';
  return REPAIR_WORK_ITEM_ALIASES[text] || text;
}

export function normalizeRepairWorkItems(items) {
  return normalizeStringList(items)
    .map((item) => normalizeRepairWorkItemLabel(item))
    .filter(Boolean)
    .slice(0, LIMITS.listCount);
}

export function findUnselectedWorkMentions(workDetails, selectedWorkItems) {
  const selected = new Set(selectedWorkItems.map((item) => normalizeRepairWorkItemLabel(item)));
  const text = trimText(workDetails, LIMITS.singleField).replace(/\s+/g, ' ').trim();
  return REPAIR_WORK_ITEM_CANONICAL.filter((item) => !selected.has(item) && text.includes(item));
}

export function normalizeDraftInput(payload) {
  const contentType = trimText(payload?.contentType, 20).toLowerCase() === 'repair'
    ? 'repair'
    : 'production';

  const userTitle = trimText(payload?.userTitle ?? payload?.title, LIMITS.title);

  const normalized = {
    contentType,
    userTitle,
    title: userTitle,
    category: trimText(payload?.category, LIMITS.category),
    vehicle: trimText(payload?.vehicle, LIMITS.vehicle),
    location: trimText(payload?.location, LIMITS.location),
    workDate: trimText(payload?.workDate, 20),
    workTypes: normalizeStringList(payload?.workTypes),
    symptoms: normalizeStringList(payload?.symptoms),
    diagnosis: normalizeStringList(payload?.diagnosis ?? payload?.confirmedCauses),
    selectedWorkItems: normalizeRepairWorkItems(payload?.selectedWorkItems),
    work: normalizeStringList(payload?.work ?? payload?.actions),
    result: normalizeStringList(payload?.result ?? payload?.results),
    additionalNote: trimText(payload?.additionalNote, LIMITS.additionalNote),
  };

  ['symptoms', 'diagnosis', 'work', 'result'].forEach((field) => {
    if (typeof payload?.[field] === 'string') {
      normalized[field] = normalizeStringList([payload[field]]);
    }
  });

  return normalized;
}

export function validateDraftInput(input) {
  if (!input.userTitle && !input.symptoms.length && !input.work.length
    && !input.diagnosis.length && !input.result.length && !input.additionalNote
    && !input.workTypes.length && !input.selectedWorkItems.length) {
    return { ok: false, code: 'VALIDATION_ERROR', message: '초안 생성에 필요한 입력 정보가 없습니다.' };
  }

  if (JSON.stringify(buildOpenAiUserInput(input)).length > 8_000) {
    return { ok: false, code: 'VALIDATION_ERROR', message: '입력 내용이 너무 깁니다. 항목을 줄여 주세요.' };
  }

  return { ok: true };
}

function joinInputList(items) {
  return items.length ? items.join(', ') : '';
}

export function buildOpenAiUserInput(input) {
  return {
    contentType: input.contentType,
    category: emptyAsBlank(input.category),
    userTitle: emptyAsBlank(input.userTitle),
    vehicle: emptyAsBlank(input.vehicle),
    location: emptyAsBlank(input.location),
    workDate: emptyAsBlank(input.workDate),
    workTypes: joinInputList(input.workTypes),
    symptoms: joinInputList(input.symptoms),
    diagnosis: joinInputList(input.diagnosis),
    selectedWorkItems: input.selectedWorkItems,
    work: joinInputList(input.work),
    result: joinInputList(input.result),
    additionalNote: emptyAsBlank(input.additionalNote),
  };
}

export function buildDraftPrompt(input) {
  const developer = input.contentType === 'repair'
    ? REPAIR_DEVELOPER_PROMPT
    : PRODUCTION_DEVELOPER_PROMPT;

  return {
    system: `${COMMON_SYSTEM_PROMPT}\n\n${developer}`,
    user: `아래 JSON 입력만 사용해 사례 초안 JSON을 작성하세요. 빈 문자열은 정보 없음입니다.\n\n${JSON.stringify(buildOpenAiUserInput(input), null, 2)}`,
  };
}

export function isMeaninglessTitle(title) {
  const text = trimText(title, LIMITS.title);
  if (!text) return true;
  return MEANINGLESS_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanField(value) {
  return trimText(value, LIMITS.singleField).replace(/\s+/g, ' ').trim();
}

function normalizeKeywords(raw) {
  if (!Array.isArray(raw)) {
    const err = new Error('keywords must be array');
    err.code = 'OPENAI_SCHEMA_ERROR';
    throw err;
  }
  return raw.map((k) => cleanField(k)).filter(Boolean).slice(0, 8);
}

function containsForbiddenText(...texts) {
  return texts.some((text) => FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text)));
}

function containsMeaninglessBrand(title) {
  return /DREAMEV/i.test(title) || /^SSSS$/i.test(title) || /^test$/i.test(title);
}

export function validateDraftQuality(draft, input) {
  if (!draft || typeof draft !== 'object') {
    return { ok: false, reason: 'missing_draft' };
  }

  if (!Array.isArray(draft.keywords)) {
    return { ok: false, reason: 'keywords_not_array' };
  }

  const title = cleanField(draft.title);
  const summary = cleanField(draft.summary);

  if (!title || /^\d+$/.test(title)) {
    return { ok: false, reason: 'numeric_title' };
  }

  if (isMeaninglessTitle(input.userTitle) && title === cleanField(input.userTitle)) {
    return { ok: false, reason: 'title_not_rewritten' };
  }

  if (containsMeaninglessBrand(title)) {
    return { ok: false, reason: 'meaningless_title' };
  }

  if (!summary) {
    return { ok: false, reason: 'missing_summary' };
  }

  if (containsForbiddenText(
    title,
    summary,
    cleanField(draft.customerRequest),
    cleanField(draft.diagnosis ?? draft.inspectionResult),
    cleanField(draft.workDetails),
    cleanField(draft.productionDetails),
    cleanField(draft.features),
    cleanField(draft.result),
    cleanField(draft.seoTitle),
    cleanField(draft.seoDescription),
  )) {
    return { ok: false, reason: 'forbidden_particle' };
  }

  if (input.contentType === 'repair') {
    if (!cleanField(draft.workDetails) && (input.work.length || input.selectedWorkItems.length)) {
      return { ok: false, reason: 'missing_work_details' };
    }
    if (!cleanField(draft.customerRequest) && input.symptoms.length) {
      return { ok: false, reason: 'missing_customer_request' };
    }
    const unselectedMentions = findUnselectedWorkMentions(cleanField(draft.workDetails), input.selectedWorkItems);
    if (unselectedMentions.length > 0) {
      return { ok: false, reason: 'unselected_work_mention' };
    }
  } else {
    if (!cleanField(draft.productionDetails) && (input.work.length || input.workTypes.length)) {
      return { ok: false, reason: 'missing_production_details' };
    }
  }

  return { ok: true };
}

export function sanitizeRepairDraft(draft, input) {
  const title = cleanField(draft.title) || (isMeaninglessTitle(input.userTitle) ? '' : input.userTitle) || '수리 사례';
  const summary = cleanField(draft.summary);
  const customerRequest = cleanField(draft.customerRequest);
  const diagnosis = cleanField(draft.diagnosis ?? draft.inspectionResult);
  const workDetails = cleanField(draft.workDetails);
  const result = cleanField(draft.result);
  const keywords = normalizeKeywords(draft.keywords);

  if (!summary || !customerRequest || !workDetails || !result) {
    const err = new Error('Repair draft missing required fields');
    err.code = 'OPENAI_PARSE_ERROR';
    throw err;
  }

  return {
    title,
    summary,
    customerRequest,
    diagnosis,
    workDetails,
    result,
    seoTitle: cleanField(draft.seoTitle) || title,
    seoDescription: cleanField(draft.seoDescription) || summary.slice(0, 140),
    keywords,
  };
}

export function sanitizeProductionDraft(draft, input) {
  const title = cleanField(draft.title) || (isMeaninglessTitle(input.userTitle) ? '' : input.userTitle) || '제작 사례';
  const summary = cleanField(draft.summary);
  const customerRequest = cleanField(draft.customerRequest);
  const productionDetails = cleanField(draft.productionDetails ?? draft.workDetails);
  const features = cleanField(draft.features);
  const result = cleanField(draft.result);
  const keywords = normalizeKeywords(draft.keywords);

  if (!summary || !customerRequest) {
    const err = new Error('Production draft missing required fields');
    err.code = 'OPENAI_PARSE_ERROR';
    throw err;
  }

  return {
    title,
    summary,
    customerRequest,
    productionDetails,
    features,
    result,
    seoTitle: cleanField(draft.seoTitle) || title,
    seoDescription: cleanField(draft.seoDescription) || summary.slice(0, 140),
    keywords,
  };
}

export function sanitizeDraftFields(draft, input) {
  if (containsForbiddenText(
    cleanField(draft.title),
    cleanField(draft.summary),
    cleanField(draft.customerRequest),
  )) {
    const err = new Error('Forbidden template text');
    err.code = 'OPENAI_PARSE_ERROR';
    throw err;
  }

  return input.contentType === 'repair'
    ? sanitizeRepairDraft(draft, input)
    : sanitizeProductionDraft(draft, input);
}

function safeOpenAiErrorSummary(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    return {
      type: parsed?.error?.type || '',
      param: parsed?.error?.param || '',
      code: parsed?.error?.code || '',
      message: String(parsed?.error?.message || '').slice(0, 300),
    };
  } catch {
    return { message: String(bodyText || '').slice(0, 300) };
  }
}

function openAiDetailMessage(openAiError, fallback) {
  return openAiError?.message?.trim() || fallback;
}

function mapOpenAiHttpError(status, bodyText) {
  const openAiError = safeOpenAiErrorSummary(bodyText);

  if (status === 400) {
    const isSchema = openAiError.param === 'response_format' || /schema/i.test(openAiError.message);
    return {
      code: isSchema ? 'OPENAI_SCHEMA_ERROR' : 'OPENAI_BAD_REQUEST',
      message: openAiDetailMessage(
        openAiError,
        isSchema ? 'AI 응답 형식 설정 오류가 발생했습니다.' : 'AI 요청 형식에 오류가 있습니다.',
      ),
      status: 502,
      openAiError,
    };
  }
  if (status === 401) {
    return {
      code: 'OPENAI_AUTH_ERROR',
      message: openAiDetailMessage(openAiError, 'AI 기능 인증에 실패했습니다.'),
      status: 502,
      openAiError,
    };
  }
  if (status === 429) {
    return {
      code: 'OPENAI_RATE_LIMIT',
      message: openAiDetailMessage(openAiError, '요청이 많습니다. 잠시 후 다시 시도해 주세요.'),
      status: 429,
      openAiError,
    };
  }
  if (status >= 500) {
    return {
      code: 'OPENAI_SERVER_ERROR',
      message: openAiDetailMessage(openAiError, 'AI 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
      status: 502,
      openAiError,
    };
  }
  return {
    code: 'OPENAI_BAD_REQUEST',
    message: openAiDetailMessage(openAiError, `AI 요청에 실패했습니다. (${status})`),
    status: 502,
    openAiError,
  };
}

export function logOpenAiDraftFailure(details) {
  console.warn('openai-draft failure', {
    stage: details.stage || '',
    model: details.model || '',
    endpoint: OPENAI_ENDPOINT,
    openAiHttpStatus: details.openAiHttpStatus ?? null,
    openAiErrorType: details.openAiError?.type || '',
    openAiErrorCode: details.openAiError?.code || '',
    openAiErrorMessage: details.openAiError?.message || '',
    openAiRequestId: details.openAiRequestId || '',
    qualityReason: details.qualityReason || '',
    contentType: details.contentType || '',
    attempt: details.attempt ?? null,
  });
}

async function requestOpenAi(env, input, fetchImpl) {
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      code: 'OPENAI_CONFIG_MISSING',
      message: 'AI 기능 설정이 완료되지 않았습니다.',
      status: 503,
      stage: 'config_missing',
      model: trimText(env.OPENAI_MODEL, 80) || DEFAULT_MODEL,
    };
  }

  const model = trimText(env.OPENAI_MODEL, 80) || DEFAULT_MODEL;
  const prompt = buildDraftPrompt(input);
  const jsonSchema = input.contentType === 'repair'
    ? REPAIR_JSON_SCHEMA
    : PRODUCTION_JSON_SCHEMA;

  let response;
  try {
    response = await fetchImpl(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: jsonSchema,
        },
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return {
        ok: false,
        code: 'OPENAI_TIMEOUT',
        message: 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        status: 504,
        stage: 'openai_fetch_timeout',
        model,
      };
    }
    return {
      ok: false,
      code: 'OPENAI_NETWORK_ERROR',
      message: 'AI 서버에 연결하지 못했습니다.',
      status: 502,
      stage: 'openai_fetch_error',
      model,
    };
  }

  const openAiStatus = response.status;
  const openAiRequestId = response.headers?.get?.('x-request-id') || '';
  const bodyText = await response.text();
  if (!response.ok) {
    const mapped = mapOpenAiHttpError(openAiStatus, bodyText);
    return {
      ok: false,
      ...mapped,
      openAiStatus,
      openAiRequestId,
      model,
      stage: 'openai_http_error',
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
      code: 'OPENAI_PARSE_ERROR',
      message: 'OpenAI 응답 본문 JSON 파싱에 실패했습니다.',
      status: 502,
      openAiStatus,
      openAiRequestId,
      model,
      stage: 'openai_response_json_parse',
    };
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return {
      ok: false,
      code: 'OPENAI_EMPTY_OUTPUT',
      message: 'AI가 빈 초안을 반환했습니다.',
      status: 502,
      openAiStatus,
      openAiRequestId,
      model,
      stage: 'openai_empty_output',
    };
  }

  let draftJson;
  try {
    draftJson = JSON.parse(content);
  } catch {
    return {
      ok: false,
      code: 'OPENAI_PARSE_ERROR',
      message: 'AI 응답 content JSON 파싱에 실패했습니다.',
      status: 502,
      openAiStatus,
      openAiRequestId,
      model,
      stage: 'openai_content_json_parse',
    };
  }

  return { ok: true, draftJson, openAiStatus, openAiRequestId, model };
}

export async function callOpenAiDraft(env, input, fetchImpl = fetch) {
  let lastQualityReason = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await requestOpenAi(env, input, fetchImpl);
    if (!response.ok) {
      logOpenAiDraftFailure({
        stage: response.stage,
        model: response.model,
        openAiHttpStatus: response.openAiStatus,
        openAiError: response.openAiError,
        openAiRequestId: response.openAiRequestId,
        contentType: input.contentType,
        attempt,
      });
      return response;
    }

    const quality = validateDraftQuality(response.draftJson, input);
    if (!quality.ok) {
      lastQualityReason = quality.reason;
      if (attempt < MAX_RETRIES) {
        continue;
      }
      const failure = {
        ok: false,
        code: 'OPENAI_PARSE_ERROR',
        message: `AI 응답 품질 검증에 실패했습니다. (${lastQualityReason})`,
        status: 502,
        openAiStatus: response.openAiStatus,
        openAiRequestId: response.openAiRequestId,
        model: response.model,
        qualityReason: lastQualityReason,
        stage: 'quality_validation',
      };
      logOpenAiDraftFailure({
        stage: failure.stage,
        model: failure.model,
        openAiHttpStatus: failure.openAiStatus,
        openAiRequestId: failure.openAiRequestId,
        qualityReason: lastQualityReason,
        contentType: input.contentType,
        attempt,
      });
      return failure;
    }

    try {
      const draft = sanitizeDraftFields(response.draftJson, input);
      return {
        ok: true,
        draft,
        model: response.model,
        openAiStatus: response.openAiStatus,
        openAiRequestId: response.openAiRequestId,
        attempt,
      };
    } catch (err) {
      lastQualityReason = err.message;
      if (attempt < MAX_RETRIES) {
        continue;
      }
      const failure = {
        ok: false,
        code: err.code || 'OPENAI_PARSE_ERROR',
        message: err.message || 'AI 응답을 처리하지 못했습니다.',
        status: 502,
        openAiStatus: response.openAiStatus,
        openAiRequestId: response.openAiRequestId,
        model: response.model,
        qualityReason: lastQualityReason,
        stage: 'sanitize_draft',
      };
      logOpenAiDraftFailure({
        stage: failure.stage,
        model: failure.model,
        openAiHttpStatus: failure.openAiStatus,
        openAiRequestId: failure.openAiRequestId,
        qualityReason: lastQualityReason,
        contentType: input.contentType,
        attempt,
      });
      return failure;
    }
  }

  return {
    ok: false,
    code: 'OPENAI_PARSE_ERROR',
    message: 'AI 응답을 처리하지 못했습니다.',
    status: 502,
    stage: 'quality_validation_exhausted',
  };
}

export const openAiDraftInternals = {
  DEFAULT_MODEL,
  OPENAI_ENDPOINT,
  OPENAI_TIMEOUT_MS,
  REPAIR_JSON_SCHEMA,
  PRODUCTION_JSON_SCHEMA,
};
