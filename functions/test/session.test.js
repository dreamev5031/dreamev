import test from 'node:test';
import assert from 'node:assert/strict';
import { requireGithubConfig, requireUploadAuth } from '../lib/session.js';

function mockRequest(authHeader) {
  return {
    headers: {
      get(name) {
        if (name === 'Authorization') return authHeader;
        return null;
      },
    },
  };
}

test('requireUploadAuth rejects missing bearer', async () => {
  const env = { UPLOAD_ADMIN_SECRET: 'test-secret' };
  const result = requireUploadAuth(mockRequest(null), env);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
});

test('requireUploadAuth rejects wrong password', async () => {
  const env = { UPLOAD_ADMIN_SECRET: 'correct' };
  const result = requireUploadAuth(mockRequest('Bearer wrong'), env);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
});

test('requireUploadAuth accepts matching secret', async () => {
  const env = { UPLOAD_ADMIN_SECRET: 'correct' };
  const result = requireUploadAuth(mockRequest('Bearer correct'), env);
  assert.equal(result.ok, true);
});

test('requireGithubConfig returns korean config error when secret missing', async () => {
  const env = { GITHUB_TOKEN: 'ghp_test' };
  const result = requireGithubConfig(env);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
  const body = await result.response.json();
  assert.match(body.message, /설정/);
});

test('requireUploadAuth returns config error when secret not set', async () => {
  const result = requireUploadAuth(mockRequest('Bearer anything'), {});
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
});
