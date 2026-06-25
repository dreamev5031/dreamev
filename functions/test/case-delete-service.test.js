import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkdown } from '../lib/case-content.js';
import { deleteCase, deleteCaseImage } from '../lib/case-manage.js';

function mockEnv() {
  return {
    GITHUB_TOKEN: 'token',
    GITHUB_OWNER: 'owner',
    GITHUB_REPO: 'repo',
    GITHUB_BRANCH: 'main',
  };
}

function mdWithGallery(title, names, dir = 'public/content/cases') {
  const md = buildMarkdown({
    title,
    category: '농업용',
    date: '2026-06-24',
    imageFileNames: names,
    summary: '요약',
    customerRequest: '요청',
    workDetails: '작업',
    result: '결과',
  });
  return { path: `${dir}/${title}.md`, content: md };
}

test('deleteCaseImage removes shared image from gallery only', async () => {
  const env = mockEnv();
  const shared = '20260624-120501-01.webp';
  const a = mdWithGallery('case-a', [shared, '20260624-120501-02.webp']);
  const b = mdWithGallery('case-b', [shared], 'public/content/repair-cases');

  const files = new Map([
    [a.path, { sha: 'sha-a', content: a.content }],
    [b.path, { sha: 'sha-b', content: b.content }],
    [`public/images/${shared}`, { sha: 'img-sha', content: 'binary' }],
    ['public/images/20260624-120501-02.webp', { sha: 'img2', content: 'binary' }],
  ]);

  let committed = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET' && /\/contents\/public\/content\/(?:cases|repair-cases)$/.test(url)) {
      const dir = url.includes('repair-cases') ? 'public/content/repair-cases' : 'public/content/cases';
      const names = [...files.keys()].filter((p) => p.startsWith(`${dir}/`) && p.endsWith('.md')).map((p) => p.split('/').pop());
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
      committed = JSON.parse(init.body);
      return Response.json({ sha: 'new-tree' });
    }
    if (method === 'POST' && url.includes('/git/commits')) {
      return Response.json({ sha: 'commit-sha' });
    }
    if (method === 'PATCH' && url.includes('/git/refs/')) {
      return Response.json({});
    }
    throw new Error(`unhandled ${method} ${url}`);
  };

  try {
    const result = await deleteCaseImage(env, 'production', 'case-a.md', shared);
    assert.equal(result.ok, true);
    assert.equal(result.imageDeleted, false);
    assert.equal(result.imageKeptForOtherCases, true);
    const deletePaths = committed.tree.filter((t) => t.sha === null).map((t) => t.path);
    assert.deepEqual(deletePaths, []);
    const upsert = committed.tree.find((t) => t.path === a.path);
    assert.ok(upsert);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deleteCase deletes md and unshared images only', async () => {
  const env = mockEnv();
  const shared = '20260624-120501-01.webp';
  const unique = '20260624-120501-02.webp';
  const a = mdWithGallery('case-a', [shared, unique]);
  const b = mdWithGallery('case-b', [shared], 'public/content/repair-cases');

  const files = new Map([
    [a.path, { sha: 'sha-a', content: a.content }],
    [b.path, { sha: 'sha-b', content: b.content }],
    [`public/images/${shared}`, { sha: 'img-sha', content: 'binary' }],
    [`public/images/${unique}`, { sha: 'img2', content: 'binary' }],
  ]);

  let committed = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET' && /\/contents\/public\/content\/(?:cases|repair-cases)$/.test(url)) {
      const dir = url.includes('repair-cases') ? 'public/content/repair-cases' : 'public/content/cases';
      const names = [...files.keys()].filter((p) => p.startsWith(`${dir}/`) && p.endsWith('.md')).map((p) => p.split('/').pop());
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
    if (method === 'POST' && url.includes('/git/trees')) {
      committed = JSON.parse(init.body);
      return Response.json({ sha: 'new-tree' });
    }
    if (method === 'POST' && url.includes('/git/commits')) {
      return Response.json({ sha: 'commit-sha' });
    }
    if (method === 'PATCH' && url.includes('/git/refs/')) {
      return Response.json({});
    }
    throw new Error(`unhandled ${method} ${url}`);
  };

  try {
    const result = await deleteCase(env, 'production', 'case-a.md');
    assert.equal(result.ok, true);
    assert.deepEqual(result.imagesDeleted, [unique]);
    assert.equal(result.imagesKept.length, 1);
    assert.equal(result.imagesKept[0].fileName, shared);
    const deletePaths = committed.tree.filter((t) => t.sha === null).map((t) => t.path).sort();
    assert.deepEqual(deletePaths.sort(), [`public/images/${unique}`, a.path].sort());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function decodePath(url) {
  const marker = '/contents/';
  const raw = url.slice(url.indexOf(marker) + marker.length);
  return decodeURIComponent(raw);
}
