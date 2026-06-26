import {
  callOpenAiDraft,
  normalizeDraftInput,
  openAiDraftInternals,
  resolveOpenAiModel,
  tryInputFallbackDraft,
  validateDraftInput,
} from '../lib/openai-draft.js';
import { createRequestId, errorResponse, handleOptions, readJsonBody, successResponse } from '../lib/http.js';
import { requireUploadAuth } from '../lib/session.js';

export async function onRequestOptions() {
  return handleOptions();
}

function logStage(requestId, stage, extra = {}) {
  console.info('generate-case-draft stage', {
    requestId,
    stage,
    endpoint: openAiDraftInternals.OPENAI_ENDPOINT,
    ...extra,
  });
}

function mapHandlerErrorCode(code) {
  if (code === 'OPENAI_CONFIG_MISSING') return 'CONFIG_ERROR';
  if (code === 'OPENAI_SCHEMA_ERROR') return 'OPENAI_PARSE_ERROR';
  if (code === 'OPENAI_NETWORK_ERROR') return 'OPENAI_SERVER_ERROR';
  return code;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const requestId = createRequestId();
  const handlerStartedAt = Date.now();
  let lastStage = 'handler_start';

  try {
    lastStage = 'auth';
    const auth = requireUploadAuth(request, env);
    if (!auth.ok) return auth.response;

    lastStage = 'openai_config_check';
    if (!env.OPENAI_API_KEY) {
      console.warn('generate-case-draft failed', {
        requestId,
        stage: lastStage,
        model: resolveOpenAiModel(env),
        endpoint: openAiDraftInternals.OPENAI_ENDPOINT,
        elapsedMs: Date.now() - handlerStartedAt,
      });
      return errorResponse(
        'CONFIG_ERROR',
        'AI 기능 설정이 완료되지 않았습니다.',
        503,
        { requestId },
      );
    }

    lastStage = 'read_json_body';
    const payload = await readJsonBody(request);
    if (!payload) {
      return errorResponse('VALIDATION_ERROR', '요청 본문이 올바른 JSON이 아닙니다.', 400, { requestId });
    }

    lastStage = 'normalize_input';
    const input = normalizeDraftInput(payload);

    lastStage = 'validate_input';
    const validation = validateDraftInput(input);
    if (!validation.ok) {
      return errorResponse(validation.code, validation.message, 400, { requestId });
    }

    logStage(requestId, 'openai_call_start', {
      model: resolveOpenAiModel(env),
      contentType: input.contentType,
      symptomCount: input.symptoms.length,
      diagnosisCount: input.diagnosis.length,
      workContentLength: (input.workContent || '').length,
      resultCount: input.result.length,
      payloadFieldCount: Object.keys(payload).length,
    });

    lastStage = 'openai_call';
    const openAiStartedAt = Date.now();
    let result;
    try {
      result = await callOpenAiDraft(env, input);
    } catch (err) {
      console.error('generate-case-draft callOpenAiDraft uncaught', {
        requestId,
        stage: lastStage,
        errorName: err?.name || '',
        errorMessage: String(err?.message || err).slice(0, 300),
        errorStack: String(err?.stack || '').slice(0, 800),
      });
      const fallbackDraft = tryInputFallbackDraft(input);
      if (fallbackDraft) {
        return successResponse({
          requestId,
          model: resolveOpenAiModel(env),
          draft: fallbackDraft,
          usedFallback: true,
        });
      }
      throw err;
    }
    const openAiWallMs = Date.now() - openAiStartedAt;
    const elapsedMs = Date.now() - handlerStartedAt;

    if (!result.ok) {
      const fallbackDraft = tryInputFallbackDraft(input);
      if (fallbackDraft) {
        console.warn('generate-case-draft handler fallback', {
          requestId,
          stage: result.stage || lastStage,
          code: result.code || '',
        });
        return successResponse({
          requestId,
          model: result.model || resolveOpenAiModel(env),
          draft: fallbackDraft,
          usedFallback: true,
        });
      }

      lastStage = result.stage || 'openai_draft_failed';
      const errorCode = mapHandlerErrorCode(result.code || 'OPENAI_SERVER_ERROR');
      console.warn('generate-case-draft failed', {
        requestId,
        stage: lastStage,
        code: errorCode,
        httpStatus: result.status,
        model: result.model,
        endpoint: openAiDraftInternals.OPENAI_ENDPOINT,
        openAiHttpStatus: result.openAiStatus ?? null,
        openAiErrorType: result.openAiError?.type || '',
        openAiErrorCode: result.openAiError?.code || '',
        openAiErrorMessage: result.openAiError?.message || '',
        openAiRequestId: result.openAiRequestId || '',
        contentType: input.contentType,
        qualityReason: result.qualityReason || '',
        parseReason: result.parseReason || '',
        contentPreview: result.contentPreview ? String(result.contentPreview).slice(0, 120) : '',
        openAiElapsedMs: result.openAiElapsedMs ?? openAiWallMs,
        elapsedMs,
        aborted: result.aborted ?? false,
      });
      return errorResponse(
        errorCode,
        result.message || 'AI 초안 생성에 실패했습니다.',
        result.status || 502,
        { requestId },
      );
    }

    lastStage = 'success';
    console.info('generate-case-draft success', {
      requestId,
      stage: lastStage,
      contentType: input.contentType,
      model: result.model,
      openAiRequestId: result.openAiRequestId || '',
      openAiHttpStatus: result.openAiStatus ?? null,
      attempt: result.attempt,
      openAiElapsedMs: result.openAiElapsedMs ?? openAiWallMs,
      elapsedMs,
    });

    return successResponse({
      requestId,
      model: result.model,
      draft: result.draft,
      ...(result.usedFallback ? { usedFallback: true } : {}),
    });
  } catch (err) {
    const elapsedMs = Date.now() - handlerStartedAt;
    console.error('generate-case-draft unexpected error', {
      requestId,
      stage: lastStage,
      handlerStage: 'handler_uncaught',
      errorName: err?.name || '',
      errorMessage: String(err?.message || err).slice(0, 300),
      errorStack: String(err?.stack || '').slice(0, 800),
      elapsedMs,
    });
    return errorResponse(
      'INTERNAL_ERROR',
      'AI 처리 중 서버 오류가 발생했습니다.',
      500,
      { requestId },
    );
  }
}
