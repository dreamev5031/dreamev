import {
  deleteCase,
  getCaseDetail,
  normalizeCaseId,
} from '../lib/case-manage.js';
import { buildUploadSuccessMessage, triggerPagesDeploy } from '../lib/deploy.js';
import { errorResponse, handleOptions, successResponse } from '../lib/http.js';
import { commitUrl } from '../lib/github.js';
import { requireGithubConfig, requireUploadAuth } from '../lib/session.js';

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
    const result = await deleteCase(env, contentType, mdFileName);
    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return errorResponse(result.code, result.message, status);
    }

    const deploy = await triggerPagesDeploy(env);
    return successResponse({
      commitSha: result.commitSha,
      commitUrl: commitUrl(env, result.commitSha),
      mdPath: result.mdPath,
      imagesDeleted: result.imagesDeleted,
      imagesKept: result.imagesKept,
      message: result.message,
      deploymentTriggered: deploy.triggered,
      deploymentSkipped: deploy.skipped,
      deploymentMessage: buildUploadSuccessMessage(deploy),
      userMessage: '삭제가 완료되었습니다. 홈페이지 반영까지 1~3분 정도 걸릴 수 있습니다.',
    });
  } catch (err) {
    if (err.code === 'CONFLICT') {
      return errorResponse('CONFLICT', '다른 작업과 충돌했습니다. 잠시 후 다시 시도해 주세요.', 409);
    }
    console.error('delete case failed', err.message);
    return errorResponse('SERVER_ERROR', '게시물 삭제에 실패했습니다.', 500);
  }
}
