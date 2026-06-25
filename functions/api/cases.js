import { listCases } from '../lib/case-manage.js';
import { errorResponse, handleOptions, successResponse } from '../lib/http.js';
import { triggerPagesDeploy } from '../lib/deploy.js';
import { commitUrl } from '../lib/github.js';
import { requireGithubConfig, requireUploadAuth } from '../lib/session.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = requireUploadAuth(request, env);
  if (!auth.ok) return auth.response;
  const cfg = requireGithubConfig(env);
  if (!cfg.ok) return cfg.response;

  const url = new URL(request.url);
  const contentType = url.searchParams.get('contentType') || 'all';
  if (!['all', 'production', 'repair'].includes(contentType)) {
    return errorResponse('VALIDATION_ERROR', 'contentType은 all, production, repair 중 하나여야 합니다.', 400);
  }

  try {
    const cases = await listCases(env, contentType);
    return successResponse({ cases });
  } catch (err) {
    console.error('list cases failed', err.message);
    return errorResponse('SERVER_ERROR', '게시물 목록을 불러오지 못했습니다.', 500);
  }
}
