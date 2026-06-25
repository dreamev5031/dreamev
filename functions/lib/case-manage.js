import {
  galleryPath,
  isValidImageFileName,
  isValidMdFileName,
  normalizeContentType,
  parseFrontmatterFields,
} from './case-content.js';
import { commitChanges, getFile, listMdFilesInDir } from './github.js';

export const CONTENT_DIRS = {
  production: 'public/content/cases',
  repair: 'public/content/repair-cases',
};

const PATH_TRAVERSAL = /\.\.|\/|\\/;

export function contentDirForType(contentType) {
  const type = normalizeContentType(contentType);
  return CONTENT_DIRS[type];
}

export function normalizeCaseId(id) {
  const raw = decodeURIComponent((id || '').trim());
  if (!raw || PATH_TRAVERSAL.test(raw)) return null;
  if (raw.endsWith('.md')) return isValidMdFileName(raw) ? raw : null;
  const withExt = `${raw}.md`;
  return isValidMdFileName(withExt) ? withExt : null;
}

export function normalizeImageFileName(fileName) {
  const raw = decodeURIComponent((fileName || '').trim());
  if (!raw || PATH_TRAVERSAL.test(raw)) return null;
  return isValidImageFileName(raw) ? raw : null;
}

export function galleryPathForFileName(fileName) {
  return galleryPath(fileName);
}

export function fileNameFromGalleryPath(path) {
  const raw = (path || '').trim().replace(/^["']|["']$/g, '');
  const match = raw.match(/\/images\/([^/]+\.webp)$/i) || raw.match(/^([^/]+\.webp)$/i);
  return match ? match[1] : null;
}

export function removeGalleryLine(markdown, targetGalleryPath) {
  const normalized = targetGalleryPath.startsWith('/')
    ? targetGalleryPath
    : `/${targetGalleryPath.replace(/^\//, '')}`;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*-\\s*image:\\s*${escaped}\\s*\\n?`, 'm');
  const updated = markdown.replace(pattern, '');
  if (updated === markdown) return null;
  const parsed = parseFrontmatterFields(updated);
  if (!parsed.ok) return null;
  return updated;
}

export function rebuildMarkdownFrontmatter(parsed) {
  const lines = ['---'];
  if (parsed.title) lines.push(`title: ${parsed.title}`);
  if (parsed.type === 'repair') {
    lines.push('type: repair');
    if (parsed.vehicle) lines.push(`vehicle: ${parsed.vehicle}`);
    if (parsed.location) lines.push(`location: ${parsed.location}`);
  } else {
    if (parsed.type === 'production') lines.push('type: production');
    if (parsed.category) lines.push(`category: ${parsed.category}`);
  }
  lines.push('gallery:');
  parsed.gallery.forEach((g) => lines.push(`  - image: ${g}`));
  if (parsed.gallery.length > 0) lines.push('');
  if (parsed.date) lines.push(`date: ${parsed.date}`);
  lines.push('---', '');
  if (parsed.body?.trim()) lines.push(parsed.body.trimEnd());
  return lines.join('\n');
}

export function caseSummaryFromParsed(mdFileName, contentType, parsed) {
  return {
    id: mdFileName.replace(/\.md$/, ''),
    mdFileName,
    contentType,
    title: parsed.title || mdFileName.replace(/\.md$/, ''),
    date: parsed.date || '',
    category: parsed.category || '',
    vehicle: parsed.vehicle || '',
    location: parsed.location || '',
    thumbnail: parsed.gallery[0] || null,
    gallery: parsed.gallery,
    galleryCount: parsed.gallery.length,
  };
}

export async function loadAllCaseFiles(env) {
  const results = [];
  for (const [contentType, dir] of Object.entries(CONTENT_DIRS)) {
    const names = await listMdFilesInDir(env, dir);
    for (const name of names) {
      const path = `${dir}/${name}`;
      const file = await getFile(env, path);
      if (!file) continue;
      const parsed = parseFrontmatterFields(file.content);
      if (!parsed.ok) continue;
      results.push({
        contentType,
        path,
        mdFileName: name,
        sha: file.sha,
        content: file.content,
        parsed,
      });
    }
  }
  return results;
}

export async function buildGalleryUsageMap(env, excludePath = null) {
  const all = await loadAllCaseFiles(env);
  const usage = new Map();
  for (const item of all) {
    if (excludePath && item.path === excludePath) continue;
    for (const g of item.parsed.gallery) {
      const key = g.replace(/^["']|["']$/g, '');
      if (!usage.has(key)) usage.set(key, []);
      usage.get(key).push(item.path);
    }
  }
  return usage;
}

export async function listCases(env, contentType = 'all') {
  const types = contentType === 'all'
    ? Object.keys(CONTENT_DIRS)
    : [normalizeContentType(contentType)];

  const cases = [];
  for (const type of types) {
    const dir = CONTENT_DIRS[type];
    const names = await listMdFilesInDir(env, dir);
    for (const name of names) {
      const file = await getFile(env, `${dir}/${name}`);
      if (!file) continue;
      const parsed = parseFrontmatterFields(file.content);
      if (!parsed.ok) continue;
      cases.push(caseSummaryFromParsed(name, type, parsed));
    }
  }

  cases.sort((a, b) => {
    const aT = a.date ? new Date(a.date).getTime() : 0;
    const bT = b.date ? new Date(b.date).getTime() : 0;
    if (bT !== aT) return bT - aT;
    return b.mdFileName.localeCompare(a.mdFileName, undefined, { numeric: true });
  });
  return cases;
}

export async function getCaseDetail(env, contentType, mdFileName) {
  const dir = contentDirForType(contentType);
  const path = `${dir}/${mdFileName}`;
  const file = await getFile(env, path);
  if (!file) return null;
  const parsed = parseFrontmatterFields(file.content);
  if (!parsed.ok) return null;
  return {
    ...caseSummaryFromParsed(mdFileName, normalizeContentType(contentType), parsed),
    mdPath: path,
    body: parsed.body || '',
  };
}

export async function deleteCaseImage(env, contentType, mdFileName, imageFileName) {
  const type = normalizeContentType(contentType);
  const dir = CONTENT_DIRS[type];
  const mdPath = `${dir}/${mdFileName}`;
  const targetGallery = galleryPathForFileName(imageFileName);

  const file = await getFile(env, mdPath);
  if (!file) {
    return { ok: false, code: 'NOT_FOUND', message: '게시물을 찾을 수 없습니다.' };
  }

  const parsed = parseFrontmatterFields(file.content);
  if (!parsed.ok) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Markdown 형식이 올바르지 않습니다.' };
  }

  const galleryNorm = parsed.gallery.map((g) => g.replace(/^["']|["']$/g, ''));
  if (!galleryNorm.includes(targetGallery)) {
    return { ok: false, code: 'NOT_FOUND', message: '해당 이미지가 gallery에 없습니다.' };
  }

  parsed.gallery = galleryNorm.filter((g) => g !== targetGallery);
  const newMarkdown = rebuildMarkdownFrontmatter(parsed);
  const usageMap = await buildGalleryUsageMap(env, mdPath);
  const otherRefs = usageMap.get(targetGallery) || [];
  const deleteImageFile = otherRefs.length === 0;
  const imageRepoPath = `public/images/${imageFileName}`;

  const upserts = [{ path: mdPath, content: newMarkdown }];
  const deletes = deleteImageFile ? [{ path: imageRepoPath }] : [];

  const commitSha = await commitChanges(env, { upserts, deletes }, `이미지 삭제: ${mdFileName} / ${imageFileName}`);

  return {
    ok: true,
    commitSha,
    mdPath,
    imageDeleted: deleteImageFile,
    imageKeptForOtherCases: !deleteImageFile,
    remainingGallery: parsed.gallery,
    message: deleteImageFile
      ? '이미지가 삭제되었습니다.'
      : '다른 게시물에서 사용 중인 이미지 파일은 보존하고 gallery에서만 제거했습니다.',
  };
}

export async function deleteCase(env, contentType, mdFileName) {
  const type = normalizeContentType(contentType);
  const dir = CONTENT_DIRS[type];
  const mdPath = `${dir}/${mdFileName}`;

  const file = await getFile(env, mdPath);
  if (!file) {
    return { ok: false, code: 'NOT_FOUND', message: '게시물을 찾을 수 없습니다.' };
  }

  const parsed = parseFrontmatterFields(file.content);
  if (!parsed.ok) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Markdown 형식이 올바르지 않습니다.' };
  }

  const usageMap = await buildGalleryUsageMap(env, mdPath);
  const deletes = [{ path: mdPath }];
  const imagesDeleted = [];
  const imagesKept = [];

  for (const g of parsed.gallery) {
    const norm = g.replace(/^["']|["']$/g, '');
    const fileName = fileNameFromGalleryPath(norm);
    if (!fileName || !isValidImageFileName(fileName)) continue;
    const otherRefs = usageMap.get(norm) || [];
    if (otherRefs.length === 0) {
      deletes.push({ path: `public/images/${fileName}` });
      imagesDeleted.push(fileName);
    } else {
      imagesKept.push({ fileName, usedBy: otherRefs });
    }
  }

  const commitSha = await commitChanges(env, { upserts: [], deletes }, `게시물 삭제: ${mdFileName}`);

  return {
    ok: true,
    commitSha,
    mdPath,
    imagesDeleted,
    imagesKept,
    message: '게시물이 삭제되었습니다.',
  };
}
