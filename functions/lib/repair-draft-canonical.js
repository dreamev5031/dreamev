import { mergeLegacyRepairWorkContent, normalizeText } from './case-content.js';

const LIMITS = {
  title: 120,
  vehicle: 80,
  location: 80,
  listItem: 80,
  listCount: 10,
  additionalNote: 500,
  workContent: 2000,
};

const EMPTY_MARKERS = new Set(['', '-', '없음', '미입력', 'n/a', 'N/A']);

function trimText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function emptyAsBlank(value) {
  const text = trimText(value, LIMITS.listItem);
  return EMPTY_MARKERS.has(text) ? '' : text;
}

/** @typedef {object} CanonicalRepairDraftInput
 * @property {'repair'} contentType
 * @property {string} userTitle
 * @property {string} vehicle
 * @property {string} location
 * @property {string} workDate
 * @property {string[]} symptoms
 * @property {string[]} diagnosis
 * @property {string} workContent
 * @property {string[]} result
 * @property {string} additionalNote
 */

export function normalizeStringList(value, maxItems = LIMITS.listCount, maxItemLen = LIMITS.listItem) {
  if (Array.isArray(value)) {
    return value
      .map((item) => trimText(emptyAsBlank(item), maxItemLen))
      .filter(Boolean)
      .slice(0, maxItems);
  }
  if (typeof value === 'string') {
    const text = emptyAsBlank(value);
    if (!text) return [];
    return text.split(/[,，\n]/)
      .map((item) => trimText(emptyAsBlank(item), maxItemLen))
      .filter(Boolean)
      .slice(0, maxItems);
  }
  return [];
}

function readListField(payload, field, aliases = []) {
  for (const key of [field, ...aliases]) {
    const raw = payload?.[key];
    if (raw !== undefined && raw !== null && raw !== '') {
      return normalizeStringList(raw);
    }
  }
  return [];
}

/** 레거시 필드는 이 함수에서만 병합 → canonical workContent */
export function ingestLegacyWorkContent(payload) {
  return mergeLegacyRepairWorkContent({
    workContent: payload?.workContent,
    repairContent: payload?.repairContent,
    repairDetails: payload?.repairDetails,
    workDetails: payload?.workDetails,
    workItems: payload?.workItems,
    selectedWorkItems: payload?.selectedWorkItems,
    work: payload?.work,
    actions: payload?.actions,
    additionalNote: payload?.additionalNote,
  });
}

/**
 * Android 공식 스키마와 동일한 canonical repair input.
 * @param {object} payload
 * @returns {CanonicalRepairDraftInput}
 */
export function normalizeRepairDraftInput(payload) {
  return {
    contentType: 'repair',
    userTitle: trimText(payload?.userTitle ?? payload?.title, LIMITS.title),
    vehicle: trimText(payload?.vehicle, LIMITS.vehicle),
    location: trimText(payload?.location, LIMITS.location),
    workDate: trimText(payload?.workDate, 20),
    symptoms: readListField(payload, 'symptoms'),
    diagnosis: readListField(payload, 'diagnosis', ['confirmedCauses']),
    workContent: trimText(ingestLegacyWorkContent(payload), LIMITS.workContent),
    result: readListField(payload, 'result', ['results']),
    additionalNote: trimText(payload?.additionalNote, LIMITS.additionalNote),
  };
}

export function isWeakRepairWorkContent(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return true;
  if (trimmed.length < 4) return true;
  if (/^\d{1,8}$/.test(trimmed)) return true;
  if (/^[a-zA-Z0-9]{1,2}$/.test(trimmed)) return true;
  return false;
}

/**
 * @param {CanonicalRepairDraftInput} input
 */
export function validateRepairDraftInput(input) {
  if (!input.vehicle) {
    return { ok: false, code: 'VALIDATION_ERROR', message: '차량 종류를 입력해 주세요.' };
  }
  if (!input.symptoms.length) {
    return { ok: false, code: 'VALIDATION_ERROR', message: '접수 증상을 입력해 주세요.' };
  }
  if (!input.workContent) {
    return { ok: false, code: 'VALIDATION_ERROR', message: '작업 내용을 입력해 주세요.' };
  }
  if (isWeakRepairWorkContent(input.workContent)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: '작업 내용을 조금 더 자세히 입력해 주세요.' };
  }
  if (input.workContent.length > LIMITS.workContent) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: `작업 내용은 ${LIMITS.workContent}자 이하로 입력해 주세요.`,
    };
  }
  return { ok: true };
}

/**
 * @param {CanonicalRepairDraftInput} input
 */
export function buildRepairOpenAiUserInput(input) {
  const join = (items) => (items.length ? items.join(', ') : '');
  return {
    contentType: 'repair',
    userTitle: input.userTitle || '',
    vehicle: input.vehicle || '',
    location: input.location || '',
    workDate: input.workDate || '',
    symptoms: join(input.symptoms),
    diagnosis: join(input.diagnosis),
    workContent: input.workContent || '',
    result: join(input.result),
    additionalNote: input.additionalNote || '',
  };
}

/**
 * @param {CanonicalRepairDraftInput} input
 */
export function buildRepairLogMeta(input) {
  return {
    contentType: 'repair',
    symptomCount: input.symptoms.length,
    diagnosisCount: input.diagnosis.length,
    workContentLength: input.workContent.length,
    resultCount: input.result.length,
    hasVehicle: Boolean(input.vehicle),
  };
}

export function formatRepairResultFallback(results) {
  if (results.length) {
    return `작업 후 ${results.join(', ')} 상태를 확인했습니다.`;
  }
  return '작업 후 상태 확인이 필요합니다. 편집 단계에서 작업 결과를 보완해 주세요.';
}
