import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkdown, buildRepairMarkdown } from '../lib/case-content.js';
import { deleteCase, deleteCaseImage, normalizeCaseId } from '../lib/case-manage.js';
import { commitChanges } from '../lib/github.js';

function mockEnv() {
  return {
    GITHUB_TOKEN: 'token',
    GITHUB_OWNER: 'owner',
    GITHUB_REPO: 'repo',
    GITHUB_BRANCH: 'main',
  };
}

function productionMd(title, imageNames, baseName = title) {
  const md = buildMarkdown({
    title,
    category: '산업용',
    date: '2026-06-25',
    imageFileNames: imageNames,
    summary: '요약',
    customerRequest: '요청',
    workDetails: '작업',
    result: '결과',
  });
  return { path: `public/content/cases/${baseName}.md`, content: md };
}

function repairMd(title, imageNames) {
  const md = buildRepairMarkdown({
    title,
    date: '2026-06-25',
    imageFileNames: imageNames,
    summary: '요약',
    customerRequest: '요청',
    workDetails: '작업',
    result: '결과',
    vehicle: '차량',
    location: '장소',
  });
  return { path: `public/content/repair-cases/${title}.md`, content: md };
}

function createGithubMock(files) {
  return async (url, init = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET' && /\/contents\/public\/content\/(?:cases|repair-cases)$/.test(url)) {
      const dir = url.includes('repair-cases') ? 'public/content/repair-cases' : 'public/content/cases';
      const names = [...files.keys()]
        .filter((p) => p.startsWith(`${dir}/`) && p.endsWith('.md'))
        .map((p) => p.split('/').pop());
      return Response.json(names.map((name) => ({ type: 'file', name })));
    }
    if (method === 'GET' && url.includes('/contents/')) {
      const path = decodePath(url);
      const file = files.get(path);
      if (!file) return new Response('', { status: 404 });
      return Response.json({
        sha: file.sha,
        content: btoa(unescape(encodeURIComponent(file.content))),
      });
    }
    if (method === 'GET' && url.includes('/git/ref/')) {
      return Response.json({ object: { sha: 'base' } });
    }
    if (method === 'GET' && url.includes('/git/commits/')) {
      return Response.json({ tree: { sha: 'tree' } });
    }
    if (method === 'POST' && url.includes('/git/blobs')) {
      return Response.json({ sha: 'new-blob' });
    }
    if (method === 'POST' && url.includes('/git/trees')) {
      const body = JSON.parse(init.body);
      const missingDelete = body.tree.find((item) => item.sha === null && !files.has(item.path));
      if (missingDelete) {
        return new Response(JSON.stringify({ message: `path not in tree: ${missingDelete.path}` }), { status: 422 });
      }
      return Response.json({ sha: 'new-tree', _body: body });
    }
    if (method === 'POST' && url.includes('/git/commits')) {
      return Response.json({ sha: 'commit-sha' });
    }
    if (method === 'PATCH' && url.includes('/git/refs/')) {
      return Response.json({});
    }
    throw new Error(`unhandled ${method} ${url}`);
  };
}

function decodePath(url) {
  const marker = '/contents/';
  const raw = url.slice(url.indexOf(marker) + marker.length);
  return raw.split('/').map(decodeURIComponent).join('/');
}

test('deleteCase succeeds when gallery image is missing from repository', async () => {
  const env = mockEnv();
  const image = '20260625-053835-01.webp';
  const md = productionMd('SSSS', [image], '산업용-ssss');
  const files = new Map([[md.path, { sha: 'sha-md', content: md.content }]]);

  let committed = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const res = await createGithubMock(files)(url, init);
    if (init.method === 'POST' && url.includes('/git/trees')) {
      committed = JSON.parse(init.body);
    }
    return res;
  };

  try {
    const result = await deleteCase(env, 'production', '산업용-ssss');
    assert.equal(result.ok, true);
    assert.deepEqual(result.imagesMissing, [image]);
    assert.deepEqual(result.imagesDeleted, []);
    const deletePaths = committed.tree.filter((t) => t.sha === null).map((t) => t.path);
    assert.deepEqual(deletePaths, [md.path]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deleteCase deletes production post with single unshared image', async () => {
  const env = mockEnv();
  const image = '20260625-120501-01.webp';
  const md = productionMd('단일사진', [image], '산업용-단일사진');
  const files = new Map([
    [md.path, { sha: 'sha-md', content: md.content }],
    [`public/images/${image}`, { sha: 'img-sha', content: 'binary' }],
  ]);

  let committed = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const res = await createGithubMock(files)(url, init);
    if (init.method === 'POST' && url.includes('/git/trees')) committed = JSON.parse(init.body);
    return res;
  };

  try {
    const result = await deleteCase(env, 'production', '산업용-단일사진');
    assert.equal(result.ok, true);
    assert.deepEqual(result.imagesDeleted, [image]);
    const deletePaths = committed.tree.filter((t) => t.sha === null).map((t) => t.path).sort();
    assert.deepEqual(deletePaths.sort(), [md.path, `public/images/${image}`].sort());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deleteCase deletes repair post with multiple images', async () => {
  const env = mockEnv();
  const images = ['20260625-120501-01.webp', '20260625-120501-02.webp'];
  const md = repairMd('수리-다중', images);
  const files = new Map([
    [md.path, { sha: 'sha-md', content: md.content }],
    ...images.map((name) => [`public/images/${name}`, { sha: `sha-${name}`, content: 'binary' }]),
  ]);

  let committed = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const res = await createGithubMock(files)(url, init);
    if (init.method === 'POST' && url.includes('/git/trees')) committed = JSON.parse(init.body);
    return res;
  };

  try {
    const result = await deleteCase(env, 'repair', '수리-다중.md');
    assert.equal(result.ok, true);
    assert.deepEqual(result.imagesDeleted, images);
    assert.equal(committed.tree.filter((t) => t.sha === null).length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deleteCase returns NOT_FOUND for missing post', async () => {
  const env = mockEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createGithubMock(new Map());
  try {
    const result = await deleteCase(env, 'production', '없는-게시물.md');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NOT_FOUND');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('normalizeCaseId accepts Korean slug used by list API', () => {
  assert.equal(normalizeCaseId('산업용-ssss'), '산업용-ssss.md');
  assert.equal(normalizeCaseId(encodeURIComponent('산업용-ssss')), '산업용-ssss.md');
});

test('deleteCaseImage skips missing image file but updates markdown', async () => {
  const env = mockEnv();
  const image = '20260625-053835-01.webp';
  const md = productionMd('SSSS', [image, '20260625-053835-02.webp'], '산업용-ssss');
  const files = new Map([
    [md.path, { sha: 'sha-md', content: md.content }],
    ['public/images/20260625-053835-02.webp', { sha: 'img2', content: 'binary' }],
  ]);

  let committed = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const res = await createGithubMock(files)(url, init);
    if (init.method === 'POST' && url.includes('/git/trees')) committed = JSON.parse(init.body);
    return res;
  };

  try {
    const result = await deleteCaseImage(env, 'production', '산업용-ssss.md', image);
    assert.equal(result.ok, true);
    assert.equal(result.imageDeleted, false);
    assert.equal(result.imageMissingInRepo, true);
    assert.equal(committed.tree.filter((t) => t.sha === null).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('commitChanges surfaces GITHUB_ERROR on tree failure', async () => {
  const env = mockEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch([
    [/GET .*\/git\/ref\/heads\/main/, () => Response.json({ object: { sha: 'base-commit' } })],
    [/GET .*\/git\/commits\/base-commit/, () => Response.json({ tree: { sha: 'base-tree' } })],
    [/POST .*\/git\/trees/, () => new Response(JSON.stringify({ message: 'path not in tree' }), { status: 422 })],
  ]);

  try {
    await assert.rejects(
      () => commitChanges(env, { upserts: [], deletes: [{ path: 'public/images/missing.webp' }] }, 'fail'),
      (err) => err.code === 'GITHUB_ERROR' && err.status === 422,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
