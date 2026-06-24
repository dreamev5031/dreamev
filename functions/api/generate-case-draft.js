/**
 * POST /api/generate-case-draft
 * OpenAI Structured Outputs로 제작사례 초안 JSON 생성.
 * Secret 미설정 시 mock 응답 반환.
 */
const MOCK_DRAFT = {
  title: '제작사례 작업 사례',
  summary: '입력 메모를 바탕으로 작성된 mock 초안입니다. 실제 OpenAI 호출 전 테스트용입니다.',
  customerRequest: '',
  workDetails: '',
  result: '',
  seoTitle: '제작사례 | 드림전동차',
  seoDescription: '드림전동차 제작사례 mock 초안',
  keywords: ['산업용 전동차 수리', '전동대차 수리'],
  warnings: ['Mock 모드입니다. OPENAI_API_KEY가 설정되지 않았습니다.'],
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, 401);
}

function validateSession(request, env) {
  const secret = env.UPLOAD_ADMIN_SECRET;
  if (!secret) return true; // mock mode: auth skipped until secret configured
  const cookie = request.headers.get('Cookie') || '';
  return cookie.includes('dreamev_admin_session=');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!validateSession(request, env)) return unauthorized();

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!env.OPENAI_API_KEY) {
    const mock = {
      ...MOCK_DRAFT,
      customerRequest: payload.customerRequestMemo || MOCK_DRAFT.customerRequest,
      workDetails: payload.workContentMemo || MOCK_DRAFT.workDetails,
      result: payload.resultMemo || MOCK_DRAFT.result,
      warnings: [
        'Mock 모드입니다. OPENAI_API_KEY가 설정되지 않았습니다.',
        ...(Array.isArray(payload.warnings) ? payload.warnings : []),
      ],
    };
    return json(mock);
  }

  return json({
    error: 'OpenAI integration pending configuration',
    warnings: ['서버 OpenAI 연동은 Secret 설정 후 활성화됩니다.'],
  }, 501);
}
