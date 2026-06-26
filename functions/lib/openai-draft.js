import { mergeLegacyRepairWorkContent } from './case-content.js';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
/** OpenAI 단일 요청 상한 (Cloudflare Pages ~30s 벽시계 한도 내) */
const OPENAI_TIMEOUT_MS = 20_000;
/** Function 전체 실행 예산 — 초과 시 JSON 504 반환 (HTML 502 방지) */
const FUNCTION_BUDGET_MS = 28_000;
const MIN_OPENAI_TIMEOUT_MS = 5_000;
const OPENAI_SERVER_RETRY_DELAY_MS = 400;
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
  workContent: 2000,
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

const POLITE_STYLE_RULE = `문체 규칙 (고객용 홈페이지 콘텐츠):
* 회사 홈페이지에 게시되는 고객용 콘텐츠이므로 모든 문장을 정중한 한국어 존댓말로 작성합니다.
* 서술형 문장의 종결은 반드시 "~했습니다", "~되었습니다", "~확인되었습니다", "~요청받았습니다" 중 자연스러운 형태를 사용합니다.
* "~했다", "~됐다", "~한다", "~이다" 형태의 해라체는 절대 사용하지 않습니다.
* 고객을 직접 지칭할 때도 정중한 표현을 사용합니다.
* 과도한 높임말은 피하고 전문적인 회사 보고 문체를 유지합니다.
* summary, customerRequest, diagnosis, workDetails, productionDetails, features, result, seoDescription 본문 문체를 모두 존댓말로 통일합니다.
* title과 seoTitle은 문장형 존댓말이 아닌 명사형 제목으로 작성할 수 있습니다.`;

const COMMON_SYSTEM_PROMPT = `너는 산업용 전동차, 전동대차, 전동카트, 골프카의 제작 및 수리 사례를 작성하는 기술 콘텐츠 편집자입니다.

사용자가 입력한 실제 작업 정보를 바탕으로 회사 홈페이지에 게시할 자연스럽고 신뢰감 있는 한국어 사례 글을 작성합니다.

${POLITE_STYLE_RULE}

가장 중요한 규칙:
* 사용자가 입력한 사실만 사용합니다.
* 입력하지 않은 부품 교체, 고장 원인, 지역, 성능, 수치, 작업 결과를 새로 만들지 않습니다.
* 사실을 추가하지 않는 범위에서 문장 구조와 표현은 자연스럽게 확장합니다.
* 입력 문장을 단순 복사하지 말고 의미를 유지한 채 전문적인 사례 문장으로 다시 작성합니다.
* 현장 기술자가 실제로 작성한 것처럼 구체적이고 차분한 문체를 사용합니다.
* 과장 광고, 감탄 표현, 막연한 홍보 문구는 사용하지 않습니다.
* 일반 고객도 이해할 수 있는 표현을 사용합니다.
* 각 항목은 역할이 분명해야 합니다. summary, diagnosis, workDetails, result에 같은 사실을 반복하지 않습니다.
* "(이)가", "을(를)", "은(는)" 같은 선택형 조사 표현을 절대 출력하지 않습니다.
* 입력에 없는 정상 작동이나 수리 성공을 임의로 단정하지 않습니다.
* 작업 결과에 정상 주행 확인이 입력된 경우에만 result에서 정상 작동을 확인했습니다고 작성합니다.
* 실제 교체가 입력된 경우에만 "교체"라고 작성합니다.
* 점검만 입력된 경우 교체나 수리를 했다고 확대 해석하지 않습니다.
* 제목이 숫자, 임의 문자열, DREAMEV, test, SSSS처럼 의미 없는 값이면 해당 제목을 사용하지 말고 작업 내용을 바탕으로 새 제목을 만듭니다.
* 차량 명칭이 애매하면 사용자가 입력한 표현을 그대로 유지합니다.
* 입력이 짧은 키워드여도 존댓말 문장으로 작성합니다.
* Markdown 기호는 출력하지 않습니다.
* JSON 외의 설명은 출력하지 않습니다.`;

const REPAIR_DEVELOPER_PROMPT = `contentType이 repair인 수리사례를 작성합니다.

출력 항목: title, summary, customerRequest, diagnosis, workDetails, result, seoTitle, seoDescription, keywords

문체: summary, customerRequest, diagnosis, workDetails, result, seoDescription은 존댓말(~했습니다, ~되었습니다). 해라체(~했다) 금지.

필드별 역할 (접수 증상·작업 내용·작업 결과가 서로 반복되지 않게 작성):
* customerRequest (접수 증상): 고객이 차량을 맡길 당시의 문제와 증상만 설명합니다.
* workDetails (작업 내용): workContent 입력을 바탕으로 실제 점검·수리·교체·보수 작업을 2~4문장으로 설명합니다.
* result (작업 결과): 작업 후 확인된 상태와 시운전 결과만 설명합니다.
* diagnosis: diagnosis 입력이 있을 때만 확인된 원인을 설명합니다. 없으면 빈 문자열을 반환합니다.
* summary: 증상과 핵심 작업만 간단히 요약합니다. 작업 결과 문장은 반복하지 않습니다.

workContent 확장 규칙:
* 사용자가 짧게 입력해도 홈페이지 게시용 문장으로 자연스럽게 확장할 수 있습니다.
* 예: "컨트롤러 교체, 배선 정리" → 점검 결과 컨트롤러 이상 확인 후 신품 교체, 배선 정리 작업 진행
* 입력에 없는 부품, 고장 원인, 작업 결과를 임의로 만들지 말 것
* 입력된 핵심 작업을 모두 포함할 것
* 정중하고 전문적인 문체, 과장 광고 금지, 같은 내용 반복 금지
* 너무 긴 문장보다 2~4문장 우선

title: 차량 + 핵심 증상 + 주요 작업, 22~45자, 명사형. 의미 없는 userTitle 무시.
summary: 2문장 이내, 존댓말.
customerRequest: 1~2문장, 존댓말.
diagnosis: 입력이 있을 때만 1~2문장, 존댓말.
workDetails: 2~4문장, 존댓말.
result: 1~2문장, 존댓말.
seoTitle: 30~55자, 명사형.
seoDescription: 70~140자, 존댓말.
keywords: 4~7개, 입력 사실만.`;

const PRODUCTION_DEVELOPER_PROMPT = `contentType이 production인 제작사례를 작성합니다.

작성 목적:
어떤 용도로 차량을 제작했고, 어떤 구조와 기능을 적용했으며, 어떤 현장에 적합한지를 보여주는 제작사례를 작성합니다.

출력 항목: title, summary, customerRequest, productionDetails, specifications, features, result, seoTitle, seoDescription, keywords

문체: summary, customerRequest, productionDetails, specifications, features, result, seoDescription은 모두 존댓말(~했습니다, ~되었습니다)로 작성합니다. 해라체(~했다, ~한다) 금지.

필드별 역할:
* title: 차량 종류와 핵심 용도 또는 특징 중심. 의미 없는 userTitle 무시, 명사형 제목
* summary: 제작 목적과 핵심 제작 내용 2문장 이내 요약, 존댓말
* customerRequest: 고객이 요청한 용도와 사용 환경만, 존댓말
* productionDetails: 실제 제작 및 맞춤 작업 내용 정리, 존댓말
* specifications: 입력된 사양만 자연스러운 문장 또는 항목으로 정리. 미입력 사양 생성 금지
* features: 입력된 구조와 기능상 특징만. 과장 광고 금지, 존댓말
* result: 제작 완료, 시운전, 납품 등 사용자가 입력한 결과만, 존댓말
* seoTitle: 30~55자, 명사형 제목
* seoDescription: 70~140자, 존댓말
* keywords: 4~7개, 구체적 조합`;

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
    specifications: STRING,
    features: STRING,
    result: STRING,
    seoTitle: STRING,
    seoDescription: STRING,
    keywords: KEYWORDS,
  },
  ['title', 'summary', 'customerRequest', 'productionDetails', 'specifications', 'features', 'result', 'seoTitle', 'seoDescription', 'keywords'],
);

function trimText(value, max) {
  return String(value || '').trim().slice(0, max);
}

/** Cloudflare OPENAI_MODEL 환경변수 → OpenAI API model 파라미터 */
export function resolveOpenAiModel(env) {
  return trimText(env?.OPENAI_MODEL, 80) || DEFAULT_MODEL;
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

function normalizeSpecificationsInput(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const result = {};
  const keys = ['voltage', 'battery', 'motor', 'controller', 'chargingMethod', 'brake', 'tire', 'topSpeed', 'payload', 'curbWeight', 'frameMaterial'];
  for (const key of keys) {
    const value = emptyAsBlank(raw[key]);
    if (value) result[key] = trimText(value, 80);
  }
  return result;
}

export function normalizeDraftInput(payload) {
  const contentType = trimText(payload?.contentType, 20).toLowerCase() === 'repair'
    ? 'repair'
    : 'production';

  const userTitle = trimText(payload?.userTitle ?? payload?.title, LIMITS.title);

  if (contentType === 'repair') {
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
      workContent: trimText(
        mergeLegacyRepairWorkContent({
          workContent: payload?.workContent,
          workDetails: payload?.workDetails,
          selectedWorkItems: payload?.selectedWorkItems,
          work: payload?.work ?? payload?.actions,
          actions: payload?.actions,
          additionalNote: payload?.additionalNote,
        }),
        LIMITS.workContent,
      ),
      result: normalizeStringList(payload?.result ?? payload?.results),
      additionalNote: trimText(payload?.additionalNote, LIMITS.additionalNote),
    };

    ['symptoms', 'diagnosis', 'result'].forEach((field) => {
      if (typeof payload?.[field] === 'string') {
        normalized[field] = normalizeStringList([payload[field]]);
      }
    });

    return normalized;
  }

  return {
    contentType,
    userTitle,
    title: userTitle,
    vehicleCategory: trimText(payload?.vehicleCategory ?? payload?.category, LIMITS.category),
    purpose: trimText(payload?.purpose, LIMITS.singleField),
    usagePlace: trimText(payload?.usagePlace, LIMITS.singleField),
    location: trimText(payload?.location, LIMITS.location),
    customerRequest: trimText(payload?.customerRequest, LIMITS.singleField),
    customWork: trimText(payload?.customWork, LIMITS.singleField),
    result: trimText(payload?.result, LIMITS.singleField),
    workDate: trimText(payload?.workDate, 20),
    specifications: normalizeSpecificationsInput(payload?.specifications),
    additionalNote: trimText(payload?.additionalNote, LIMITS.additionalNote),
  };
}

export function validateDraftInput(input) {
  if (input.contentType === 'repair') {
    const workContent = (input.workContent || '').trim();
    if (!input.userTitle && !input.symptoms.length && !workContent
      && !input.diagnosis.length && !input.result.length) {
      return { ok: false, code: 'VALIDATION_ERROR', message: '초안 생성에 필요한 입력 정보가 없습니다.' };
    }
    if (input.symptoms.length && !workContent) {
      return { ok: false, code: 'VALIDATION_ERROR', message: '작업 내용을 입력해 주세요.' };
    }
    if (workContent && workContent.length < 4) {
      return { ok: false, code: 'VALIDATION_ERROR', message: '작업 내용을 조금 더 자세히 입력해 주세요.' };
    }
    if (workContent.length > LIMITS.workContent) {
      return { ok: false, code: 'VALIDATION_ERROR', message: `작업 내용은 ${LIMITS.workContent}자 이하로 입력해 주세요.` };
    }
  } else if (!input.userTitle && !input.customerRequest && !input.customWork
    && !input.purpose && !input.result && !input.additionalNote
    && Object.keys(input.specifications || {}).length === 0) {
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
  if (input.contentType === 'repair') {
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
      workContent: emptyAsBlank(input.workContent),
      result: joinInputList(input.result),
      additionalNote: emptyAsBlank(input.additionalNote),
    };
  }

  const specs = input.specifications || {};
  const specPayload = {};
  for (const [key, value] of Object.entries(specs)) {
    if (value) specPayload[key] = value;
  }

  return {
    contentType: input.contentType,
    title: emptyAsBlank(input.userTitle),
    vehicleCategory: emptyAsBlank(input.vehicleCategory),
    purpose: emptyAsBlank(input.purpose),
    usagePlace: emptyAsBlank(input.usagePlace),
    location: emptyAsBlank(input.location),
    customerRequest: emptyAsBlank(input.customerRequest),
    customWork: emptyAsBlank(input.customWork),
    specifications: specPayload,
    result: emptyAsBlank(input.result),
    workDate: emptyAsBlank(input.workDate),
    additionalNote: emptyAsBlank(input.additionalNote),
  };
}

export function buildDraftPrompt(input, options = {}) {
  const developer = input.contentType === 'repair'
    ? REPAIR_DEVELOPER_PROMPT
    : PRODUCTION_DEVELOPER_PROMPT;

  const retryHint = options.qualityRetryReason === 'informal_speech'
    ? '중요: 이전 응답에 해라체가 포함되었습니다. 모든 서술문을 ~했습니다, ~되었습니다 존댓말로 작성하세요.\n\n'
    : '';

  return {
    system: `${COMMON_SYSTEM_PROMPT}\n\n${developer}`,
    user: `${retryHint}아래 JSON 입력만 사용해 사례 초안 JSON을 작성하세요. 빈 문자열은 정보 없음입니다.

${JSON.stringify(buildOpenAiUserInput(input))}`,
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

/** 문장 종결 해라체 (~했다., ~됐다., ~한다., ~이다.) 탐지 — 제목·키워드 제외 필드용 */
const HAERA_CHE_SENTENCE_ENDING = /(?:했다|됐다|한다|이다)(?:[.!?]|$)/g;

export function findInformalSpeechInText(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  const normalized = text.replace(/\s+/g, ' ').trim();
  for (const match of normalized.matchAll(HAERA_CHE_SENTENCE_ENDING)) {
    matches.push(match[0]);
  }
  return matches;
}

export function getHonorificBodyFields(contentType) {
  if (contentType === 'repair') {
    return ['summary', 'customerRequest', 'diagnosis', 'workDetails', 'result', 'seoDescription'];
  }
  return ['summary', 'customerRequest', 'productionDetails', 'specifications', 'features', 'result', 'seoDescription'];
}

export function findDraftInformalSpeechViolations(draft, input) {
  if (!draft || typeof draft !== 'object') return [];

  const fields = getHonorificBodyFields(input.contentType);
  const violations = [];

  for (const field of fields) {
    let raw = draft[field];
    if (field === 'diagnosis' && !raw) {
      raw = draft.inspectionResult;
    }
    const text = cleanField(raw);
    if (!text) continue;

    const matches = findInformalSpeechInText(text);
    if (matches.length > 0) {
      violations.push({ field, endings: matches, excerpt: text.slice(0, 80) });
    }
  }

  return violations;
}

/** 빈 필드·스키마·해라체일 때만 재생성 */
const QUALITY_RETRY_REASONS = new Set([
  'informal_speech',
  'missing_draft',
  'missing_summary',
  'missing_work_details',
  'missing_customer_request',
  'missing_production_details',
  'keywords_not_array',
]);

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
    cleanField(draft.specifications),
    cleanField(draft.features),
    cleanField(draft.result),
    cleanField(draft.seoTitle),
    cleanField(draft.seoDescription),
  )) {
    return { ok: false, reason: 'forbidden_particle' };
  }

  const informalViolations = findDraftInformalSpeechViolations(draft, input);
  if (informalViolations.length > 0) {
    return {
      ok: false,
      reason: 'informal_speech',
      informalViolations,
    };
  }

  if (input.contentType === 'repair') {
    if (!cleanField(draft.workDetails) && input.workContent) {
      return { ok: false, reason: 'missing_work_details' };
    }
    if (!cleanField(draft.customerRequest) && input.symptoms.length) {
      return { ok: false, reason: 'missing_customer_request' };
    }
  } else {
    if (!cleanField(draft.productionDetails) && (input.customWork || input.additionalNote)) {
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
  const specifications = cleanField(draft.specifications);
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
    specifications,
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
    openAiElapsedMs: details.openAiElapsedMs ?? null,
    elapsedMs: details.elapsedMs ?? null,
    aborted: details.aborted ?? null,
    errorName: details.errorName || '',
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createOpenAiFetchSignal(timeoutMs) {
  if (typeof AbortSignal?.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => {
    const err = new Error('OpenAI request timed out');
    err.name = 'TimeoutError';
    controller.abort(err);
  }, timeoutMs);
  return controller.signal;
}

async function executeOpenAiFetch(env, input, fetchImpl, options, timeoutMs) {
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  const model = resolveOpenAiModel(env);
  const prompt = buildDraftPrompt(input, options);
  const jsonSchema = input.contentType === 'repair'
    ? REPAIR_JSON_SCHEMA
    : PRODUCTION_JSON_SCHEMA;

  let response;
  const fetchStartedAt = Date.now();
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
      signal: createOpenAiFetchSignal(timeoutMs),
    });
  } catch (err) {
    const fetchElapsedMs = Date.now() - fetchStartedAt;
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return {
        ok: false,
        code: 'OPENAI_TIMEOUT',
        message: 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        status: 504,
        stage: 'openai_fetch_timeout',
        model,
        fetchElapsedMs,
        aborted: true,
      };
    }
    return {
      ok: false,
      code: 'OPENAI_SERVER_ERROR',
      message: 'AI 서버에 연결하지 못했습니다.',
      status: 502,
      stage: 'openai_fetch_error',
      model,
      fetchElapsedMs,
      errorName: err?.name || '',
    };
  }

  const fetchElapsedMs = Date.now() - fetchStartedAt;
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
      fetchElapsedMs,
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
      fetchElapsedMs,
    };
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return {
      ok: false,
      code: 'OPENAI_PARSE_ERROR',
      message: 'AI가 빈 초안을 반환했습니다.',
      status: 502,
      openAiStatus,
      openAiRequestId,
      model,
      stage: 'openai_empty_output',
      fetchElapsedMs,
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
      fetchElapsedMs,
    };
  }

  return {
    ok: true,
    draftJson,
    openAiStatus,
    openAiRequestId,
    model,
    stage: 'openai_fetch_success',
    fetchElapsedMs,
  };
}

async function requestOpenAi(env, input, fetchImpl, options = {}) {
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      code: 'CONFIG_ERROR',
      message: 'AI 기능 설정이 완료되지 않았습니다.',
      status: 503,
      stage: 'config_missing',
      model: resolveOpenAiModel(env),
    };
  }

  const budgetRemainingMs = options.budgetRemainingMs ?? FUNCTION_BUDGET_MS;
  const openAiStartedAt = Date.now();
  let serverRetried = false;

  for (let fetchAttempt = 0; fetchAttempt < 2; fetchAttempt += 1) {
    const elapsed = Date.now() - openAiStartedAt;
    const remaining = budgetRemainingMs - elapsed;
    if (remaining < MIN_OPENAI_TIMEOUT_MS) {
      return {
        ok: false,
        code: 'OPENAI_TIMEOUT',
        message: 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        status: 504,
        stage: 'openai_budget_exhausted',
        model: resolveOpenAiModel(env),
        openAiElapsedMs: elapsed,
      };
    }

    const timeoutMs = Math.min(OPENAI_TIMEOUT_MS, remaining);
    const result = await executeOpenAiFetch(env, input, fetchImpl, options, timeoutMs);
    result.openAiElapsedMs = Date.now() - openAiStartedAt;

    if (result.ok) {
      return result;
    }

    const canServerRetry = !serverRetried
      && (result.openAiStatus === 500 || result.openAiStatus === 503)
      && (budgetRemainingMs - (Date.now() - openAiStartedAt)) > (MIN_OPENAI_TIMEOUT_MS + OPENAI_SERVER_RETRY_DELAY_MS);

    if (canServerRetry) {
      serverRetried = true;
      logOpenAiDraftFailure({
        stage: 'openai_server_retry',
        model: result.model,
        openAiHttpStatus: result.openAiStatus,
        openAiRequestId: result.openAiRequestId || '',
        contentType: input.contentType,
        attempt: fetchAttempt,
      });
      await sleep(OPENAI_SERVER_RETRY_DELAY_MS);
      continue;
    }

    return result;
  }

  return {
    ok: false,
    code: 'OPENAI_SERVER_ERROR',
    message: 'AI 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    status: 502,
    stage: 'openai_fetch_exhausted',
    model: resolveOpenAiModel(env),
    openAiElapsedMs: Date.now() - openAiStartedAt,
  };
}

export async function callOpenAiDraft(env, input, fetchImpl = fetch) {
  const functionStartedAt = Date.now();
  const getBudgetRemaining = () => FUNCTION_BUDGET_MS - (Date.now() - functionStartedAt);
  let lastQualityReason = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const budgetRemainingMs = getBudgetRemaining();
    if (budgetRemainingMs < MIN_OPENAI_TIMEOUT_MS) {
      return {
        ok: false,
        code: 'OPENAI_TIMEOUT',
        message: 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        status: 504,
        stage: 'function_budget_exhausted',
        model: resolveOpenAiModel(env),
        elapsedMs: Date.now() - functionStartedAt,
      };
    }

    const response = await requestOpenAi(env, input, fetchImpl, {
      qualityRetryReason: attempt > 0 ? lastQualityReason : '',
      budgetRemainingMs,
    });
    if (!response.ok) {
      logOpenAiDraftFailure({
        stage: response.stage,
        model: response.model,
        openAiHttpStatus: response.openAiStatus,
        openAiError: response.openAiError,
        openAiRequestId: response.openAiRequestId,
        contentType: input.contentType,
        attempt,
        openAiElapsedMs: response.openAiElapsedMs,
        elapsedMs: Date.now() - functionStartedAt,
      });
      return {
        ...response,
        elapsedMs: Date.now() - functionStartedAt,
      };
    }

    const quality = validateDraftQuality(response.draftJson, input);
    if (!quality.ok) {
      lastQualityReason = quality.reason;
      const canQualityRetry = attempt < MAX_RETRIES
        && QUALITY_RETRY_REASONS.has(quality.reason)
        && getBudgetRemaining() > (MIN_OPENAI_TIMEOUT_MS + OPENAI_SERVER_RETRY_DELAY_MS);
      if (canQualityRetry) {
        continue;
      }
      const failure = {
        ok: false,
        code: 'OPENAI_PARSE_ERROR',
        message: lastQualityReason === 'informal_speech'
          ? 'AI 초안 문체가 존댓말 규칙에 맞지 않습니다. 다시 시도해 주세요.'
          : `AI 응답 품질 검증에 실패했습니다. (${lastQualityReason})`,
        status: 502,
        openAiStatus: response.openAiStatus,
        openAiRequestId: response.openAiRequestId,
        model: response.model,
        qualityReason: lastQualityReason,
        informalViolations: quality.informalViolations,
        stage: 'quality_validation',
        openAiElapsedMs: response.openAiElapsedMs,
        elapsedMs: Date.now() - functionStartedAt,
      };
      logOpenAiDraftFailure({
        stage: failure.stage,
        model: failure.model,
        openAiHttpStatus: failure.openAiStatus,
        openAiRequestId: failure.openAiRequestId,
        qualityReason: lastQualityReason,
        contentType: input.contentType,
        attempt,
        openAiElapsedMs: failure.openAiElapsedMs,
        elapsedMs: failure.elapsedMs,
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
        openAiElapsedMs: response.openAiElapsedMs,
        elapsedMs: Date.now() - functionStartedAt,
      };
    } catch (err) {
      lastQualityReason = err.code || err.message;
      const canSanitizeRetry = attempt < MAX_RETRIES
        && (err.code === 'OPENAI_SCHEMA_ERROR' || err.code === 'OPENAI_PARSE_ERROR')
        && getBudgetRemaining() > (MIN_OPENAI_TIMEOUT_MS + OPENAI_SERVER_RETRY_DELAY_MS);
      if (canSanitizeRetry) {
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
        openAiElapsedMs: response.openAiElapsedMs,
        elapsedMs: Date.now() - functionStartedAt,
      };
      logOpenAiDraftFailure({
        stage: failure.stage,
        model: failure.model,
        openAiHttpStatus: failure.openAiStatus,
        openAiRequestId: failure.openAiRequestId,
        qualityReason: lastQualityReason,
        contentType: input.contentType,
        attempt,
        openAiElapsedMs: failure.openAiElapsedMs,
        elapsedMs: failure.elapsedMs,
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
    elapsedMs: Date.now() - functionStartedAt,
  };
}

export const openAiDraftInternals = {
  DEFAULT_MODEL,
  resolveOpenAiModel,
  OPENAI_ENDPOINT,
  OPENAI_TIMEOUT_MS,
  FUNCTION_BUDGET_MS,
  REPAIR_JSON_SCHEMA,
  PRODUCTION_JSON_SCHEMA,
};
