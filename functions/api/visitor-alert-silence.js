import { sanitizeVisitorText } from '../lib/visitor-alert.js';
import { errorResponse, handleOptions, readJsonBody, withCors } from '../lib/http.js';

const SILENCE_COOKIE = 'dreamev_va_silence=1; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { env } = context;
  const adminSecret = env.VISITOR_ALERT_ADMIN_SECRET;
  if (!adminSecret) {
    return errorResponse('CONFIG_ERROR', '관리자 무음 기능이 설정되지 않았습니다.', 503);
  }

  const body = await readJsonBody(context.request);
  const token = sanitizeVisitorText(body?.token || '', 200);
  if (!token || token !== adminSecret) {
    return errorResponse('UNAUTHORIZED', '인증에 실패했습니다.', 401);
  }

  return withCors(
    new Response(JSON.stringify({ success: true, silenced: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': SILENCE_COOKIE,
      },
    }),
  );
}

export async function onRequest() {
  return errorResponse('METHOD_NOT_ALLOWED', 'POST만 지원합니다.', 405);
}
