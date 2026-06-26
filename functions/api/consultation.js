import { processConsultationRequest } from '../lib/consultation.js';
import { errorResponse, handleOptions, successResponse } from '../lib/http.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  try {
    const result = await processConsultationRequest(context);

    if (result.error === 'CONFIG_ERROR') {
      return errorResponse('CONFIG_ERROR', result.message, 503);
    }
    if (result.error === 'VALIDATION_ERROR') {
      return errorResponse('VALIDATION_ERROR', result.message, 400);
    }
    if (result.error === 'INVALID_IMAGE') {
      return errorResponse('INVALID_IMAGE', result.message, 400);
    }
    if (result.error === 'SPAM_BLOCKED') {
      return errorResponse('SPAM_BLOCKED', result.message, 429);
    }
    if (result.error === 'SEND_FAILED') {
      return errorResponse('SEND_FAILED', result.message, 502);
    }

    return successResponse({
      message: result.message,
      photoCount: result.photoCount,
    });
  } catch (err) {
    console.error('consultation handler failed', err.message);
    return errorResponse(
      'SERVER_ERROR',
      '상담 신청 처리 중 오류가 발생했습니다.',
      500,
    );
  }
}

export async function onRequest() {
  return errorResponse('METHOD_NOT_ALLOWED', 'POST만 지원합니다.', 405);
}
