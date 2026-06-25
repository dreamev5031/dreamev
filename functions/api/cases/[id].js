import {
  contentDirForType,
  deleteCase,
  getCaseDetail,
  normalizeCaseId,
} from '../../lib/case-manage.js';
import {
  buildDeleteSuccessPayload,
  createStepTimer,
  queuePagesDeploy,
} from '../../lib/delete-response.js';
import { createRequestId, errorResponse, handleOptions, successResponse } from '../../lib/http.js';
import { requireGithubConfig, requireUploadAuth } from '../../lib/session.js';

function readContentType(url) {
  const contentType = url.searchParams.get('contentType');
  if (!contentType || !['production', 'repair'].includes(contentType)) {
    return null;
  }
  return contentType;
}

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const auth = requireUploadAuth(request, env);
  if (!auth.ok) return auth.response;
  const cfg = requireGithubConfig(env);
  if (!cfg.ok) return cfg.response;

  const contentType = readContentType(new URL(request.url));
  if (!contentType) {
    return errorResponse('VALIDATION_ERROR', 'contentType 쿼리 파라미터(production|repair)가 필요합니다.', 400);
  }

  const mdFileName = normalizeCaseId(params.id);
  if (!mdFileName) {
    return errorResponse('VALIDATION_ERROR', '유효하지 않은 게시물 ID입니다.', 400);
  }

  try {
    const detail = await getCaseDetail(env, contentType, mdFileName);
    if (!detail) {
      return errorResponse('NOT_FOUND', '게시물을 찾을 수 없습니다.', 404);
    }
    return successResponse({ case: detail });
  } catch (err) {
    console.error('get case failed', err.message);
    return errorResponse('SERVER_ERROR', '게시물을 불러오지 못했습니다.', 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const requestId = createRequestId();
  const timer = createStepTimer(requestId);

  const auth = requireUploadAuth(request, env);
  if (!auth.ok) return auth.response;
  timer.mark('auth');

  const cfg = requireGithubConfig(env);
  if (!cfg.ok) return cfg.response;

  const contentType = readContentType(new URL(request.url));
  if (!contentType) {
    return errorResponse('VALIDATION_ERROR', 'contentType 쿼리 파라미터(production|repair)가 필요합니다.', 400, { requestId });
  }

  const mdFileName = normalizeCaseId(params.id);
  if (!mdFileName) {
    return errorResponse('VALIDATION_ERROR', '유효하지 않은 게시물 ID입니다.', 400, { requestId });
  }

  console.info('delete case request', {
    requestId,
    contentType,
    mdFileName,
    mdPath: `${contentDirForType(contentType)}/${mdFileName}`,
  });

  try {
    const result = await deleteCase(env, contentType, mdFileName, { timer });
    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      timer.log('delete case timing');
      return errorResponse(result.code, result.message, status, { requestId, timings: timer.summary() });
    }

    const deployState = queuePagesDeploy(context, env, requestId);
    timer.mark('triggerDeploy');

    return successResponse(buildDeleteSuccessPayload(env, result, { requestId, timer, deployState }));
  } catch (err) {
    timer.log('delete case timing');
    if (err.code === 'CONFLICT') {
      return errorResponse('CONFLICT', '다른 작업과 충돌했습니다. 잠시 후 다시 시도해 주세요.', 409, { requestId, timings: timer.summary() });
    }
    if (err.code === 'GITHUB_ERROR') {
      console.error('delete case github failed', { requestId, mdFileName, status: err.status, message: err.message });
      return errorResponse('GITHUB_DELETE_FAILED', 'GitHub 파일 삭제에 실패했습니다.', 502, { requestId, timings: timer.summary() });
    }
    console.error('delete case failed', { requestId, mdFileName, message: err.message });
    return errorResponse('SERVER_ERROR', '서버 오류가 발생했습니다.', 500, { requestId, timings: timer.summary() });
  }
}
