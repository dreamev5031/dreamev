const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 1_200;

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

const FORBIDDEN_PATTERNS = [
  /\(이\)가/,
  /\(을\)를/,
  /\(은\)는/,
  /\(와\)과/,
  /DREAMEV/i,
  /드림이브/i,
];

const DRAFT_JSON_SCHEMA = {
  name: 'case_draft',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      customerRequest: { type: 'string' },
      diagnosis: { type: 'string' },
      workDetails: { type: 'string' },
      result: { type: 'string' },
      seoTitle: { type: 'string' },
      seoDescription: { type: 'string' },
      keywords: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: [
      'title',
      'summary',
      'customerRequest',
      'diagnosis',
      'workDetails',
      'result',
      'seoTitle',
      'seoDescription',
      'keywords',
    ],
    additionalProperties: false,
  },
};

function trimText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function normalizeStringList(value, maxItems = LIMITS.listCount, maxItemLen = LIMITS.listItem) {
  if (!Array.isArray(value)) {
    if (typeof value === 'string' && value.trim()) return [trimText(value, maxItemLen)];
    return [];
  }
  return value
    .map((item) => trimText(item, maxItemLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeDraftInput(payload) {
  const contentType = trimText(payload?.contentType, 20).toLowerCase() === 'repair'
    ? 'repair'
    : 'production';

  const normalized = {
    contentType,
    title: trimText(payload?.title, LIMITS.title),
    category: trimText(payload?.category, LIMITS.category),
    vehicle: trimText(payload?.vehicle, LIMITS.vehicle),
    location: trimText(payload?.location, LIMITS.location),
    workTypes: normalizeStringList(payload?.workTypes),
    symptoms: normalizeStringList(payload?.symptoms),
    diagnosis: normalizeStringList(payload?.diagnosis ?? payload?.confirmedCauses),
    work: normalizeStringList(payload?.work ?? payload?.actions),
    result: normalizeStringList(payload?.result ?? payload?.results),
    additionalNote: trimText(payload?.additionalNote, LIMITS.additionalNote),
  };

  if (typeof payload?.symptoms === 'string') {
    normalized.symptoms = normalizeStringList([payload.symptoms]);
  }
  if (typeof payload?.diagnosis === 'string') {
    normalized.diagnosis = normalizeStringList([payload.diagnosis]);
  }
  if (typeof payload?.work === 'string') {
    normalized.work = normalizeStringList([payload.work]);
  }
  if (typeof payload?.result === 'string') {
    normalized.result = normalizeStringList([payload.result]);
  }

  return normalized;
}

export function validateDraftInput(input) {
  if (!input.title && !input.symptoms.length && !input.work.length
    && !input.diagnosis.length && !input.result.length && !input.additionalNote
    && !input.workTypes.length) {
    return { ok: false, code: 'VALIDATION_ERROR', message: '초안 생성에 필요한 입력 정보가 없습니다.' };
  }

  const totalChars = JSON.stringify(input).length;
  if (totalChars > 8_000) {
    return { ok: false, code: 'VALIDATION_ERROR', message: '입력 내용이 너무 깁니다. 항목을 줄여 주세요.' };
  }

  return { ok: true };
}

function formatList(label, items) {
  if (!items.length) return '';
  return `${label}: ${items.join(', ')}`;
}

export function buildDraftPrompt(input) {
  const lines = [
    `contentType: ${input.contentType}`,
    input.title ? `title: ${input.title}` : '',
    input.contentType === 'production' && input.category ? `category: ${input.category}` : '',
    input.contentType === 'repair' && input.vehicle ? `vehicle: ${input.vehicle}` : '',
    input.contentType === 'repair' && input.location ? `location: ${input.location}` : '',
    formatList('symptoms', input.symptoms),
    formatList('diagnosis', input.diagnosis),
    formatList('workTypes', input.workTypes),
    formatList('work', input.work),
    formatList('result', input.result),
    input.additionalNote ? `additionalNote: ${input.additionalNote}` : '',
  ].filter(Boolean);

  const structure = input.contentType === 'repair'
    ? '수리사례: customerRequest(고객 요청), diagnosis(점검 결과), workDetails(수리 및 작업 내용), result(작업 결과)'
    : '제작사례: customerRequest(고객 요청/목적), workDetails(제작 내용), result(납품·활용 결과). diagnosis는 제작사례에서 빈 문자열로 둘 수 있음';

  return {
    system: [
      '당신은 드림전동차 작업사례 초안 작성 도우미입니다.',
      '입력에 없는 사실, 부품, 지역, 원인, 성능, 보증, 안전 단정을 절대 추가하지 마세요.',
      '한국어로 자연스럽고 간결하게 작성하세요.',
      '조사 템플릿 "(이)가", "(을)를", "(은)는" 형태를 출력하지 마세요.',
      '홍보성 과장, 불필요한 브랜드명, DREAMEV 같은 임의 값을 제목에 넣지 마세요.',
      structure,
      '입력이 비어 있는 항목은 추측하지 말고 짧게 생략하거나 일반적 표현만 사용하세요.',
      'JSON 스키마 필드만 채우세요.',
    ].join('\n'),
    user: `다음 입력만 사용해 작업사례 초안 JSON을 작성하세요.\n\n${lines.join('\n')}`,
  };
}

export function sanitizeDraftFields(draft, input) {
  const clean = (value) => trimText(value, LIMITS.singleField)
    .replace(/\s+/g, ' ')
    .trim();

  const title = clean(draft.title) || input.title || '작업 사례';
  const summary = clean(draft.summary);
  const customerRequest = clean(draft.customerRequest);
  const diagnosis = clean(draft.diagnosis ?? draft.inspectionResult);
  const workDetails = clean(draft.workDetails);
  const result = clean(draft.result);

  for (const text of [title, summary, customerRequest, diagnosis, workDetails, result]) {
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text))) {
      const err = new Error('Draft contains forbidden template text');
      err.code = 'OPENAI_RESPONSE_PARSE_FAILED';
      throw err;
    }
  }

  const keywords = Array.isArray(draft.keywords)
    ? draft.keywords.map((k) => clean(k)).filter(Boolean).slice(0, 8)
    : [];

  const seoTitle = clean(draft.seoTitle) || `${title} | 드림전동차`;
  const seoDescription = clean(draft.seoDescription) || summary.slice(0, 150);

  if (!summary || !customerRequest || !workDetails || !result) {
    const err = new Error('Draft missing required fields');
    err.code = 'OPENAI_RESPONSE_PARSE_FAILED';
    throw err;
  }

  return {
    title,
    summary,
    customerRequest,
    diagnosis: input.contentType === 'repair' ? diagnosis : '',
    workDetails,
    result,
    seoTitle,
    seoDescription,
    keywords,
  };
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

function mapOpenAiHttpError(status, bodyText) {
  const openAiError = safeOpenAiErrorSummary(bodyText);

  if (status === 400) {
    return {
      code: 'OPENAI_BAD_REQUEST',
      message: 'AI 응답 형식 요청이 올바르지 않습니다. 관리자에게 문의해 주세요.',
      status: 502,
      openAiError,
    };
  }
  if (status === 401) {
    return { code: 'OPENAI_UNAUTHORIZED', message: 'AI 기능 설정을 확인해 주세요.', status: 502, openAiError };
  }
  if (status === 429) {
    return { code: 'OPENAI_RATE_LIMIT', message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.', status: 429, openAiError };
  }
  if (status >= 500) {
    return { code: 'OPENAI_SERVER_ERROR', message: 'AI 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', status: 502, openAiError };
  }
  return {
    code: 'OPENAI_ERROR',
    message: `AI 요청에 실패했습니다. (${status})`,
    status: 502,
    openAiError,
  };
}

export async function callOpenAiDraft(env, input, fetchImpl = fetch) {
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, code: 'CONFIG_ERROR', message: 'AI 기능 설정을 확인해 주세요.', status: 503 };
  }

  const model = trimText(env.OPENAI_MODEL, 80) || DEFAULT_MODEL;
  const prompt = buildDraftPrompt(input);

  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: DRAFT_JSON_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { ok: false, code: 'OPENAI_TIMEOUT', message: 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.', status: 504 };
    }
    return { ok: false, code: 'OPENAI_NETWORK_ERROR', message: 'AI 서버에 연결하지 못했습니다.', status: 502 };
  }

  const openAiStatus = response.status;
  const bodyText = await response.text();
  if (!response.ok) {
    const mapped = mapOpenAiHttpError(openAiStatus, bodyText);
    return { ok: false, ...mapped, openAiStatus };
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
      code: 'OPENAI_RESPONSE_PARSE_FAILED',
      message: 'AI 응답을 처리하지 못했습니다.',
      status: 502,
      openAiStatus,
    };
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return {
      ok: false,
      code: 'OPENAI_RESPONSE_PARSE_FAILED',
      message: 'AI가 빈 초안을 반환했습니다.',
      status: 502,
      openAiStatus,
    };
  }

  let draftJson;
  try {
    draftJson = JSON.parse(content);
  } catch {
    return {
      ok: false,
      code: 'OPENAI_RESPONSE_PARSE_FAILED',
      message: 'AI 응답 JSON이 올바르지 않습니다.',
      status: 502,
      openAiStatus,
    };
  }

  try {
    const draft = sanitizeDraftFields(draftJson, input);
    return { ok: true, draft, model, openAiStatus };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'OPENAI_RESPONSE_PARSE_FAILED',
      message: 'AI 응답을 처리하지 못했습니다.',
      status: 502,
      openAiStatus,
    };
  }
}

export const openAiDraftInternals = {
  DEFAULT_MODEL,
  OPENAI_TIMEOUT_MS,
  DRAFT_JSON_SCHEMA,
};
