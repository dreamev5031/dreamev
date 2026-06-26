import { getKstVisitDate, isValidStatsDate } from '../lib/visitor-alert.js';
import { getDailyVisitorStats, ensureVisitorSchema } from '../lib/visitor-db.js';
import { errorResponse, handleOptions, successResponse } from '../lib/http.js';
import { requireUploadAuth } from '../lib/session.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const auth = requireUploadAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  const db = context.env.VISITOR_DB;
  if (!db) {
    return errorResponse('CONFIG_ERROR', 'VISITOR_DB 바인딩이 설정되지 않았습니다.', 503);
  }

  const url = new URL(context.request.url);
  const dateParam = url.searchParams.get('date');
  const visitDate = dateParam || getKstVisitDate();

  if (!isValidStatsDate(visitDate)) {
    return errorResponse('VALIDATION_ERROR', 'date는 YYYY-MM-DD 형식이어야 합니다.', 400);
  }

  try {
    await ensureVisitorSchema(db);
    const stats = await getDailyVisitorStats(db, visitDate);
    return successResponse({
      date: visitDate,
      uniqueVisitors: stats.uniqueVisitors,
      sources: stats.sources,
    });
  } catch (err) {
    console.error('visitor-stats handler failed', err.message);
    return errorResponse('SERVER_ERROR', '통계 조회 중 오류가 발생했습니다.', 500);
  }
}

export async function onRequest() {
  return errorResponse('METHOD_NOT_ALLOWED', 'GET만 지원합니다.', 405);
}
