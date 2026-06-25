function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dreamev-uploader',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function repoBase(env) {
  const owner = env.GITHUB_OWNER || 'dreamev5031';
  const repo = env.GITHUB_REPO || 'dreamev';
  return { owner, repo, branch: env.GITHUB_BRANCH || 'main' };
}

export async function pathExists(env, path) {
  const { owner, repo } = repoBase(env);
  const token = env.GITHUB_TOKEN;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`, {
    headers: githubHeaders(token),
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    const err = await githubResponseError('GitHub contents check failed', res);
    throw err;
  }
  return true;
}

async function readGithubErrorBody(res) {
  try {
    const text = await res.text();
    if (!text) return '';
    try {
      const data = JSON.parse(text);
      return data.message || text;
    } catch {
      return text;
    }
  } catch {
    return '';
  }
}

export async function githubResponseError(prefix, res) {
  const detail = await readGithubErrorBody(res);
  const err = new Error(detail ? `${prefix}: ${res.status} ${detail}` : `${prefix}: ${res.status}`);
  err.code = 'GITHUB_ERROR';
  err.status = res.status;
  return err;
}

export async function listExistingMdNames(env, contentDir = 'public/content/cases') {
  const names = await listMdFilesInDir(env, contentDir);
  return new Set(names);
}

export async function listMdFilesInDir(env, contentDir) {
  const { owner, repo } = repoBase(env);
  const token = env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${contentDir}`, {
    headers: githubHeaders(token),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw await githubResponseError(`GitHub list ${contentDir} failed`, res);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter((f) => f.type === 'file' && f.name.endsWith('.md')).map((f) => f.name);
}

export async function getFile(env, path) {
  const { owner, repo } = repoBase(env);
  const token = env.GITHUB_TOKEN;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`, {
    headers: githubHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await githubResponseError('GitHub get file failed', res);
  const data = await res.json();
  if (!data.content || !data.sha) return null;
  const binary = atob(data.content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const content = new TextDecoder().decode(bytes);
  return { path, sha: data.sha, content };
}

async function getBranchState(env) {
  const { owner, repo, branch } = repoBase(env);
  const token = env.GITHUB_TOKEN;
  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
    headers: githubHeaders(token),
  });
  if (!refRes.ok) throw await githubResponseError('GitHub ref fetch failed', refRes);
  const refData = await refRes.json();
  const commitSha = refData.object.sha;

  const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`, {
    headers: githubHeaders(token),
  });
  if (!commitRes.ok) throw await githubResponseError('GitHub commit fetch failed', commitRes);
  const commitData = await commitRes.json();
  return { commitSha, treeSha: commitData.tree.sha };
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64(bytes);
}

async function createBlob(env, content, encoding = 'base64') {
  const { owner, repo } = repoBase(env);
  const token = env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, encoding }),
  });
  if (!res.ok) throw await githubResponseError('GitHub blob create failed', res);
  const data = await res.json();
  return data.sha;
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

export async function commitFiles(env, files, message) {
  const upserts = files.map((file) => {
    if (file.binary) return { path: file.path, binary: file.binary };
    return { path: file.path, content: file.content };
  });
  return commitChanges(env, { upserts, deletes: [] }, message);
}

export async function commitChanges(env, { upserts = [], deletes = [] }, message) {
  const { owner, repo, branch } = repoBase(env);
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN missing');

  const attempt = async () => {
    const { commitSha, treeSha } = await getBranchState(env);
    const treeItems = [];

    for (const file of upserts) {
      let blobSha;
      if (file.binary) {
        blobSha = await createBlob(env, bytesToBase64(file.binary), 'base64');
      } else {
        blobSha = await createBlob(env, textToBase64(file.content), 'base64');
      }
      treeItems.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobSha,
      });
    }

    for (const del of deletes) {
      treeItems.push({
        path: del.path,
        mode: '100644',
        type: 'blob',
        sha: null,
      });
    }

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: treeSha, tree: treeItems }),
    });
    if (!treeRes.ok) throw await githubResponseError('GitHub tree create failed', treeRes);
    const treeData = await treeRes.json();

    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        tree: treeData.sha,
        parents: [commitSha],
      }),
    });
    if (!commitRes.ok) throw await githubResponseError('GitHub commit create failed', commitRes);
    const newCommit = await commitRes.json();

    const updateRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommit.sha }),
    });

    if (updateRes.status === 409) {
      return { conflict: true };
    }
    if (!updateRes.ok) throw await githubResponseError('GitHub ref update failed', updateRes);
    return { conflict: false, commitSha: newCommit.sha };
  };

  const first = await attempt();
  if (first.conflict) {
    const second = await attempt();
    if (second.conflict) {
      const err = new Error('GitHub ref conflict after retry');
      err.code = 'CONFLICT';
      throw err;
    }
    return second.commitSha;
  }
  return first.commitSha;
}

export function commitUrl(env, sha) {
  const { owner, repo } = repoBase(env);
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}
