import test from 'node:test';
import assert from 'node:assert/strict';
import { commitChanges } from '../lib/github.js';

function mockFetch(handlers) {
  return async (url, init = {}) => {
    const method = init.method || 'GET';
    const key = `${method} ${url}`;
    for (const [pattern, handler] of handlers) {
      if (pattern.test(key)) return handler(url, init);
    }
    throw new Error(`Unhandled fetch: ${key}`);
  };
}

const env = {
  GITHUB_TOKEN: 'test-token',
  GITHUB_OWNER: 'owner',
  GITHUB_REPO: 'repo',
  GITHUB_BRANCH: 'main',
};

test('commitChanges returns CONFLICT after repeated 409', async () => {
  const originalFetch = globalThis.fetch;
  let refPatchCount = 0;
  globalThis.fetch = mockFetch([
    [/GET .*\/git\/ref\/heads\/main/, () => Response.json({ object: { sha: 'base-commit' } })],
    [/GET .*\/git\/commits\/base-commit/, () => Response.json({ tree: { sha: 'base-tree' } })],
    [/POST .*\/git\/blobs/, () => Response.json({ sha: 'blob-sha' })],
    [/POST .*\/git\/trees/, () => Response.json({ sha: 'new-tree' })],
    [/POST .*\/git\/commits/, () => Response.json({ sha: 'new-commit' })],
    [/PATCH .*\/git\/refs\/heads\/main/, () => {
      refPatchCount += 1;
      return new Response('', { status: 409 });
    }],
  ]);

  try {
    await assert.rejects(
      () => commitChanges(env, {
        upserts: [{ path: 'public/content/cases/test.md', content: '# test' }],
        deletes: [],
      }, 'test commit'),
      (err) => err.code === 'CONFLICT',
    );
    assert.equal(refPatchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('commitChanges includes delete entries with sha null in tree', async () => {
  const originalFetch = globalThis.fetch;
  let treeBody = null;
  globalThis.fetch = mockFetch([
    [/GET .*\/git\/ref\/heads\/main/, () => Response.json({ object: { sha: 'base-commit' } })],
    [/GET .*\/git\/commits\/base-commit/, () => Response.json({ tree: { sha: 'base-tree' } })],
    [/POST .*\/git\/blobs/, () => Response.json({ sha: 'blob-sha' })],
    [/POST .*\/git\/trees/, (_url, init) => {
      treeBody = JSON.parse(init.body);
      return Response.json({ sha: 'new-tree' });
    }],
    [/POST .*\/git\/commits/, () => Response.json({ sha: 'new-commit' })],
    [/PATCH .*\/git\/refs\/heads\/main/, () => Response.json({})],
  ]);

  try {
    const sha = await commitChanges(env, {
      upserts: [{ path: 'public/content/cases/test.md', content: '# updated' }],
      deletes: [{ path: 'public/images/20260624-120501-01.webp' }],
    }, 'delete image');
    assert.equal(sha, 'new-commit');
    const deleteItem = treeBody.tree.find((t) => t.path === 'public/images/20260624-120501-01.webp');
    assert.ok(deleteItem);
    assert.equal(deleteItem.sha, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
