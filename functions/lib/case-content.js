export const ALLOWED_CATEGORIES = ['산업용', '농업용', '다목적', '맞춤제작'];

const UNSAFE_MD = /[\\/:*?"<>|]/g;
const PATH_TRAVERSAL = /\.\.|\/|\\/;
const IMAGE_NAME_RE = /^\d{8}-\d{6}(?:-[a-zA-Z0-9]+)?-\d{2}\.webp$/;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_IMAGES = 10;

const ALLOWED_MIME = new Set(['image/webp', 'image/jpeg', 'image/png']);

export function sanitizePart(part) {
  return (part || '')
    .trim()
    .replace(UNSAFE_MD, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeContentType(value) {
  const v = (value || '').toString().trim().toLowerCase();
  if (v === 'repair') return 'repair';
  return 'production';
}

export function buildRepairMdBaseName(title) {
  const tit = sanitizePart(title);
  return tit ? tit.slice(0, 100) : '수리사례';
}

export function buildMdBaseName(category, title) {
  const cat = sanitizePart(category);
  const tit = sanitizePart(title);
  if (cat && tit) return `${cat}-${tit}`.slice(0, 100);
  if (tit) return tit.slice(0, 100);
  if (cat) return cat.slice(0, 100);
  return '제작사례';
}

export function resolveMdFileName(baseName, workDate, existingNames) {
  const primary = `${baseName}.md`;
  if (!existingNames.has(primary)) return primary;

  const date = (workDate || '').slice(0, 10);
  if (date) {
    const dated = `${baseName}-${date}.md`;
    if (!existingNames.has(dated)) return dated;
  }

  let seq = 2;
  while (existingNames.has(`${baseName}-${seq}.md`)) seq++;
  return `${baseName}-${seq}.md`;
}

export function isValidMdFileName(name) {
  if (!name || typeof name !== 'string') return false;
  if (!name.endsWith('.md')) return false;
  if (PATH_TRAVERSAL.test(name)) return false;
  if (name.includes('/')) return false;
  return sanitizePart(name.replace(/\.md$/, '')).length > 0;
}

export function isValidImageFileName(name) {
  return typeof name === 'string' && IMAGE_NAME_RE.test(name);
}

export function makeImageFileName(stamp, index, suffix = '') {
  const num = String(index).padStart(2, '0');
  if (suffix) return `${stamp}-${suffix}-${num}.webp`;
  return `${stamp}-${num}.webp`;
}

export function galleryPath(imageFileName) {
  return `/images/${imageFileName}`;
}

export function validateCategory(category) {
  return ALLOWED_CATEGORIES.includes(category);
}

export function validateImages(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return { ok: false, message: '이미지를 최소 1장 업로드해 주세요.' };
  }
  if (images.length > MAX_IMAGES) {
    return { ok: false, message: `이미지는 최대 ${MAX_IMAGES}장까지 업로드할 수 있습니다.` };
  }

  let total = 0;
  for (const img of images) {
    if (!ALLOWED_MIME.has(img.type)) {
      return { ok: false, message: '허용되지 않은 이미지 형식입니다. WebP, JPEG, PNG만 가능합니다.' };
    }
    if (img.size > MAX_IMAGE_BYTES) {
      return { ok: false, message: '이미지 용량이 너무 큽니다. 한 장당 5MB 이하로 업로드해 주세요.' };
    }
    total += img.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    return { ok: false, message: '전체 업로드 용량이 너무 큽니다.' };
  }
  return { ok: true };
}

export function formatKstDateTime(dateInput) {
  const raw = (dateInput || '').trim();
  const dateOnly = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return `${dateOnly}T12:00:00.000+09:00`;
  }
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.000+09:00`;
}

export function buildMarkdown({
  title,
  category,
  date,
  imageFileNames,
  summary,
  customerRequest,
  workDetails,
  result,
}) {
  const galleryLines = imageFileNames.map((name) => `  - image: ${galleryPath(name)}`);
  const body = [];
  if (summary?.trim()) {
    body.push(summary.trim(), '');
  }
  if (customerRequest?.trim()) {
    body.push('## 고객 요청', '', customerRequest.trim(), '');
  }
  if (workDetails?.trim()) {
    body.push('## 제작 및 작업 내용', '', workDetails.trim(), '');
  }
  if (result?.trim()) {
    body.push('## 작업 결과', '', result.trim(), '');
  }

  return [
    '---',
    `title: ${title.trim()}`,
    'type: production',
    `category: ${category}`,
    'gallery:',
    ...galleryLines,
    '',
    `date: ${formatKstDateTime(date)}`,
    '---',
    '',
    body.join('\n').trimEnd(),
  ].join('\n');
}

export function buildRepairMarkdown({
  title,
  vehicle,
  location,
  date,
  imageFileNames,
  summary,
  customerRequest,
  inspectionResult,
  workDetails,
  result,
}) {
  const galleryLines = imageFileNames.map((name) => `  - image: ${galleryPath(name)}`);
  const body = [];
  if (summary?.trim()) {
    body.push(summary.trim(), '');
  }
  if (customerRequest?.trim()) {
    body.push('## 고객 요청', '', customerRequest.trim(), '');
  }
  if (inspectionResult?.trim()) {
    body.push('## 점검 결과', '', inspectionResult.trim(), '');
  }
  if (workDetails?.trim()) {
    body.push('## 수리 및 작업 내용', '', workDetails.trim(), '');
  }
  if (result?.trim()) {
    body.push('## 작업 결과', '', result.trim(), '');
  }

  const fm = [
    '---',
    `title: ${title.trim()}`,
    'type: repair',
  ];
  if (vehicle?.trim()) fm.push(`vehicle: ${vehicle.trim()}`);
  if (location?.trim()) fm.push(`location: ${location.trim()}`);
  fm.push('gallery:', ...galleryLines, '', `date: ${formatKstDateTime(date)}`, '---', '', body.join('\n').trimEnd());
  return fm.join('\n');
}

export function parseFrontmatterFields(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { ok: false };
  const fm = match[1];
  const body = match[2] || '';
  const read = (key) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  const gallery = [...fm.matchAll(/^\s*-\s*image:\s*(.+)$/gm)].map((m) => m[1].trim().replace(/^["']|["']$/g, ''));
  const typeRaw = read('type');
  const type = typeRaw === 'repair' ? 'repair' : 'production';
  return {
    ok: true,
    type,
    title: read('title'),
    category: read('category'),
    vehicle: read('vehicle'),
    location: read('location'),
    date: read('date'),
    gallery,
    body,
  };
}

export function parseFrontmatter(markdown) {
  const parsed = parseFrontmatterFields(markdown);
  if (!parsed.ok) return { ok: false };
  return {
    ok: true,
    title: parsed.title,
    category: parsed.category,
    gallery: parsed.gallery,
    type: parsed.type,
  };
}

export function parseRepairFrontmatter(markdown) {
  const parsed = parseFrontmatterFields(markdown);
  if (!parsed.ok) return { ok: false };
  return {
    ok: true,
    title: parsed.title,
    vehicle: parsed.vehicle,
    location: parsed.location,
    date: parsed.date,
    gallery: parsed.gallery,
    body: parsed.body,
  };
}

export function validateGalleryMatches(imageFileNames, markdown) {
  const parsed = parseFrontmatterFields(markdown);
  if (!parsed.ok) return { ok: false, message: 'Markdown frontmatter 형식이 올바르지 않습니다.' };
  const expected = imageFileNames.map((n) => galleryPath(n));
  if (parsed.gallery.length !== expected.length) {
    return { ok: false, message: 'gallery 이미지 수가 업로드 이미지 수와 일치하지 않습니다.' };
  }
  for (let i = 0; i < expected.length; i++) {
    const actual = parsed.gallery[i].replace(/^["']|["']$/g, '');
    if (actual !== expected[i]) {
      return { ok: false, message: 'gallery 경로와 이미지 파일명이 일치하지 않습니다.' };
    }
  }
  if (expected.length > 0 && parsed.gallery[0].replace(/^["']|["']$/g, '') !== expected[0]) {
    return { ok: false, message: 'gallery 첫 번째 이미지가 대표 이미지와 일치하지 않습니다.' };
  }
  return { ok: true };
}
