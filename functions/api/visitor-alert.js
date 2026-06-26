import { processVisitorAlertRequest } from '../lib/visitor-alert.js';
import { errorResponse, handleOptions, readJsonBody, successResponse } from '../lib/http.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== 'object') {
    return errorResponse('VALIDATION_ERROR', 'JSON body가 필요합니다.', 400);
  }

  if (JSON.stringify(body).length > 2048) {
    return errorResponse('VALIDATION_ERROR', '요청 본문이 너무 깁니다.', 400);
  }

  try {
    const result = await processVisitorAlertRequest(context, body);

    if (result.error === 'CONFIG_ERROR') {
      return errorResponse('CONFIG_ERROR', result.message, 503);
    }
    if (result.error === 'VALIDATION_ERROR') {
      return errorResponse('VALIDATION_ERROR', result.message, 400);
    }

    return successResponse(result);
  } catch (err) {
    console.error('visitor-alert handler failed', err.message);
    return errorResponse('SERVER_ERROR', '방문 처리 중 오류가 발생했습니다.', 500);
  }
}

export async function onRequest() {
  return errorResponse('METHOD_NOT_ALLOWED', 'POST만 지원합니다.', 405);
}
