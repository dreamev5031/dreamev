import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUploadSuccessMessage, triggerPagesDeploy } from '../lib/deploy.js';

test('triggerPagesDeploy skips when hook URL missing', async () => {
  const result = await triggerPagesDeploy({});
  assert.equal(result.triggered, false);
  assert.equal(result.skipped, true);
});

test('triggerPagesDeploy posts once to hook URL', async () => {
  let calls = 0;
  const mockFetch = async (url, init) => {
    calls += 1;
    assert.equal(url, 'https://api.cloudflare.com/hook/test');
    assert.equal(init.method, 'POST');
    return { ok: true, text: async () => '' };
  };
  const result = await triggerPagesDeploy(
    { CLOUDFLARE_DEPLOY_HOOK_URL: 'https://api.cloudflare.com/hook/test' },
    mockFetch,
  );
  assert.equal(calls, 1);
  assert.equal(result.triggered, true);
});

test('triggerPagesDeploy reports HTTP failure without throwing', async () => {
  const mockFetch = async () => ({ ok: false, status: 503, text: async () => 'unavailable' });
  const result = await triggerPagesDeploy(
    { CLOUDFLARE_DEPLOY_HOOK_URL: 'https://example.com/hook' },
    mockFetch,
  );
  assert.equal(result.triggered, false);
  assert.match(result.error, /503/);
});

test('buildUploadSuccessMessage distinguishes deploy outcomes', () => {
  assert.match(
    buildUploadSuccessMessage('등록됨.', { triggered: true, skipped: false, message: 'ok' }),
    /재배포/,
  );
  assert.match(
    buildUploadSuccessMessage('등록됨.', { triggered: false, skipped: true }),
    /Hook 미설정/,
  );
  assert.match(
    buildUploadSuccessMessage('등록됨.', { triggered: false, skipped: false, error: 'timeout' }),
    /재배포 요청에 실패/,
  );
});
