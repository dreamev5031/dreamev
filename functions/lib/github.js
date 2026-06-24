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
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    headers: githubHeaders(token),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`GitHub contents check failed: ${res.status}`);
  return true;
}

export async function listExistingMdNames(env) {
  const { owner, repo } = repoBase(env);
  const token = env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/public/content/cases`, {
    headers: githubHeaders(token),
  });
  if (res.status === 404) return new Set();
  if (!res.ok) throw new Error(`GitHub list cases failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return new Set();
  return new Set(data.filter((f) => f.type === 'file' && f.name.endsWith('.md')).map((f) => f.name));
}

async function getBranchState(env) {
  const { owner, repo, branch } = repoBase(env);
  const token = env.GITHUB_TOKEN;
  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
    headers: githubHeaders(token),
  });
  if (!refRes.ok) throw new Error(`GitHub ref fetch failed: ${refRes.status}`);
  const refData = await refRes.json();
  const commitSha = refData.object.sha;

  const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`, {
    headers: githubHeaders(token),
  });
  if (!commitRes.ok) throw new Error(`GitHub commit fetch failed: ${commitRes.status}`);
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
  if (!res.ok) throw new Error(`GitHub blob create failed: ${res.status}`);
  const data = await res.json();
  return data.sha;
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

export async function commitFiles(env, files, message) {
  const { owner, repo, branch } = repoBase(env);
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN missing');

  const attempt = async () => {
    const { commitSha, treeSha } = await getBranchState(env);
    const treeItems = [];
    for (const file of files) {
      let blobSha;
      if (file.binary) {
        const base64 = bytesToBase64(file.binary);
        blobSha = await createBlob(env, base64, 'base64');
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

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: treeSha, tree: treeItems }),
    });
    if (!treeRes.ok) throw new Error(`GitHub tree create failed: ${treeRes.status}`);
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
    if (!commitRes.ok) throw new Error(`GitHub commit create failed: ${commitRes.status}`);
    const newCommit = await commitRes.json();

    const updateRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommit.sha }),
    });

    if (updateRes.status === 409) {
      return { conflict: true };
    }
    if (!updateRes.ok) throw new Error(`GitHub ref update failed: ${updateRes.status}`);
    return { conflict: false, commitSha: newCommit.sha };
  };

  const first = await attempt();
  if (first.conflict) {
    const second = await attempt();
    if (second.conflict) throw new Error('GitHub ref conflict after retry');
    return second.commitSha;
  }
  return first.commitSha;
}

export function commitUrl(env, sha) {
  const { owner, repo } = repoBase(env);
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}
