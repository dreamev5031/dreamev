import { errorResponse } from './http.js';

export function extractBearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Authorization: Bearer {업로드 비밀번호}
 * Cloudflare Secret UPLOAD_ADMIN_SECRET 과 직접 비교한다.
 */
export function requireUploadAuth(request, env) {
  const secret = env.UPLOAD_ADMIN_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: errorResponse('CONFIG_ERROR', '서버 업로드 인증 설정이 완료되지 않았습니다.', 503),
    };
  }

  const bearer = extractBearerToken(request);
  if (!bearer) {
    return {
      ok: false,
      response: errorResponse('UNAUTHORIZED', '업로드 비밀번호가 필요합니다.', 401),
    };
  }

  if (!safeEqual(bearer, secret)) {
    return {
      ok: false,
      response: errorResponse('UNAUTHORIZED', '업로드 비밀번호가 올바르지 않습니다.', 401),
    };
  }

  return { ok: true };
}

export function requireGithubConfig(env) {
  const missing = [];
  if (!env.GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
  if (!env.UPLOAD_ADMIN_SECRET) missing.push('UPLOAD_ADMIN_SECRET');
  if (missing.length > 0) {
    return {
      ok: false,
      response: errorResponse('CONFIG_ERROR', '서버 업로드 설정이 완료되지 않았습니다.', 503),
    };
  }
  return { ok: true };
}
