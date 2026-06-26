const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function createRequestId() {
  return crypto.randomUUID();
}

export function withCors(response) {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function deployHeaders(env = {}) {
  const commit = env.CF_PAGES_COMMIT_SHA || env.DREAMEV_DEPLOY_COMMIT || '';
  const branch = env.CF_PAGES_BRANCH || '';
  const headers = {};
  if (commit) headers['X-Dreamev-Deploy-Commit'] = commit.slice(0, 12);
  if (branch) headers['X-Dreamev-Deploy-Branch'] = branch;
  return headers;
}

export function json(data, status = 200, extraHeaders = {}) {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...extraHeaders,
      },
    }),
  );
}

export function errorResponse(code, message, status = 400, extra = {}, extraHeaders = {}) {
  return json({ success: false, code, message, ...extra }, status, extraHeaders);
}

export function successResponse(data, extraHeaders = {}) {
  return json({ success: true, ...data }, 200, extraHeaders);
}

export function handleOptions() {
  return withCors(new Response(null, { status: 204 }));
}

export async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
