import {
  callOpenAiDraft,
  normalizeDraftInput,
  openAiDraftInternals,
  validateDraftInput,
} from '../lib/openai-draft.js';
import { createRequestId, errorResponse, handleOptions, readJsonBody, successResponse } from '../lib/http.js';
import { requireUploadAuth } from '../lib/session.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const requestId = createRequestId();

  const auth = requireUploadAuth(request, env);
  if (!auth.ok) return auth.response;

  if (!env.OPENAI_API_KEY) {
    console.warn('generate-case-draft failed', {
      requestId,
      stage: 'openai_config_missing',
      model: (env.OPENAI_MODEL || openAiDraftInternals.DEFAULT_MODEL).trim(),
      endpoint: openAiDraftInternals.OPENAI_ENDPOINT,
    });
    return errorResponse(
      'OPENAI_CONFIG_MISSING',
      'AI 기능 설정이 완료되지 않았습니다.',
      503,
      { requestId },
    );
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return errorResponse('VALIDATION_ERROR', '요청 본문이 올바른 JSON이 아닙니다.', 400, { requestId });
  }

  const input = normalizeDraftInput(payload);
  const validation = validateDraftInput(input);
  if (!validation.ok) {
    return errorResponse(validation.code, validation.message, 400, { requestId });
  }

  const startedAt = Date.now();
  const result = await callOpenAiDraft(env, input);
  const elapsedMs = Date.now() - startedAt;

  if (!result.ok) {
    console.warn('generate-case-draft failed', {
      requestId,
      stage: result.stage || 'openai_draft_failed',
      code: result.code,
      status: result.status,
      model: result.model,
      endpoint: openAiDraftInternals.OPENAI_ENDPOINT,
      openAiHttpStatus: result.openAiStatus ?? null,
      openAiErrorType: result.openAiError?.type || '',
      openAiErrorCode: result.openAiError?.code || '',
      openAiErrorMessage: result.openAiError?.message || '',
      openAiRequestId: result.openAiRequestId || '',
      contentType: input.contentType,
      titleLength: input.userTitle.length,
      symptomCount: input.symptoms.length,
      diagnosisCount: input.diagnosis.length,
      selectedWorkItemCount: input.selectedWorkItems.length,
      qualityReason: result.qualityReason || '',
      elapsedMs,
    });
    return errorResponse(result.code, result.message, result.status || 502, { requestId });
  }

  console.info('generate-case-draft success', {
    requestId,
    contentType: input.contentType,
    model: result.model,
    openAiRequestId: result.openAiRequestId || '',
    attempt: result.attempt,
    elapsedMs,
  });

  return successResponse({
    requestId,
    draft: result.draft,
  });
}
