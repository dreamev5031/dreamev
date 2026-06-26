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
  const text = (category || '').trim();
  if (!text) return false;
  if (ALLOWED_CATEGORIES.includes(text)) return true;
  return text.length <= 80 && !PATH_TRAVERSAL.test(text);
}

export const SPECIFICATION_KEYS = [
  'voltage',
  'battery',
  'motor',
  'controller',
  'chargingMethod',
  'brake',
  'tire',
  'topSpeed',
  'payload',
  'curbWeight',
  'frameMaterial',
];

export function normalizeSpecifications(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const result = {};
  for (const key of SPECIFICATION_KEYS) {
    const value = (raw[key] || '').toString().trim();
    if (value && value !== '-' && value !== '없음' && value !== '미입력') {
      result[key] = value.slice(0, 80);
    }
  }
  return result;
}

export function parseSpecificationsBlock(fm) {
  const specs = {};
  const blockMatch = fm.match(/^specifications:\s*\n((?:  [a-zA-Z]+:.*\n)*)/m);
  if (!blockMatch) return specs;
  for (const line of blockMatch[1].split('\n')) {
    const m = line.match(/^\s{2}([a-zA-Z]+):\s*(.+)$/);
    if (m) {
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (value) specs[m[1]] = value;
    }
  }
  return specs;
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

function escapeYamlValue(value) {
  const text = (value || '').trim();
  if (!text) return '';
  if (/[:#\[\]{}\"'&*!?|>@]/.test(text)) {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return text;
}

export function buildMarkdown({
  title,
  category,
  purpose,
  usagePlace,
  location,
  date,
  imageFileNames,
  summary,
  customerRequest,
  productionDetails,
  features,
  workDetails,
  result,
  specifications = {},
}) {
  const galleryLines = imageFileNames.map((name) => `  - image: ${galleryPath(name)}`);
  const body = [];
  if (summary?.trim()) {
    body.push(summary.trim(), '');
  }
  if (customerRequest?.trim()) {
    body.push('## 고객 요청', '', customerRequest.trim(), '');
  }
  const details = (productionDetails || workDetails || '').trim();
  if (details) {
    body.push('## 제작 내용', '', details, '');
  }
  if (features?.trim()) {
    body.push('## 특징', '', features.trim(), '');
  }
  if (result?.trim()) {
    body.push('## 납품 및 활용 결과', '', result.trim(), '');
  }

  const specs = normalizeSpecifications(specifications);
  const fm = [
    '---',
    `title: ${escapeYamlValue(title)}`,
    'type: production',
    `category: ${escapeYamlValue(category)}`,
  ];
  if (purpose?.trim()) fm.push(`purpose: ${escapeYamlValue(purpose)}`);
  if (usagePlace?.trim()) fm.push(`usagePlace: ${escapeYamlValue(usagePlace)}`);
  if (location?.trim()) fm.push(`location: ${escapeYamlValue(location)}`);
  if (Object.keys(specs).length > 0) {
    fm.push('specifications:');
    for (const key of SPECIFICATION_KEYS) {
      if (specs[key]) fm.push(`  ${key}: ${escapeYamlValue(specs[key])}`);
    }
  }
  fm.push('gallery:', ...galleryLines, '', `date: ${formatKstDateTime(date)}`, '---', '', body.join('\n').trimEnd());
  return fm.join('\n');
}

export function dedupeRepairTextLines(...chunks) {
  const seen = new Set();
  const lines = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    for (const rawLine of String(chunk).split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const key = line.replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(line);
    }
  }
  return lines.join('\n');
}

/** 배열·문자열·null/undefined를 안전하게 단일 텍스트로 정규화 */
export function normalizeText(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

function collectRepairWorkItems(...sources) {
  const items = [];
  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const item of source) {
        const text = normalizeText(item);
        if (text) items.push(text);
      }
      continue;
    }
    const text = normalizeText(source);
    if (!text) continue;
    if (text.includes('\n')) {
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) items.push(trimmed);
      }
    } else {
      items.push(text);
    }
  }
  return items;
}

export function mergeLegacyRepairWorkContent({
  workContent,
  repairContent,
  repairDetails,
  workDetails,
  workItems,
  selectedWorkItems,
  work,
  actions,
  additionalNote,
} = {}) {
  const direct = normalizeText(workContent)
    || normalizeText(repairContent)
    || normalizeText(repairDetails);
  if (direct) return direct;

  const itemList = collectRepairWorkItems(
    workItems,
    selectedWorkItems,
    work,
    actions,
  );

  return dedupeRepairTextLines(
    itemList.join('\n'),
    workDetails,
    repairDetails,
    additionalNote,
  );
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
  workContent,
  result,
}) {
  const galleryLines = imageFileNames.map((name) => `  - image: ${galleryPath(name)}`);
  const resolvedWorkContent = mergeLegacyRepairWorkContent({
    workContent,
    workDetails,
  });
  const body = [];
  if (summary?.trim()) {
    body.push(summary.trim(), '');
  }
  if (customerRequest?.trim()) {
    body.push('## 접수 증상', '', customerRequest.trim(), '');
  }
  if (inspectionResult?.trim()) {
    body.push('## 점검 결과', '', inspectionResult.trim(), '');
  }
  if (resolvedWorkContent) {
    body.push('## 작업 내용', '', resolvedWorkContent, '');
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
    purpose: read('purpose'),
    usagePlace: read('usagePlace'),
    vehicle: read('vehicle'),
    location: read('location'),
    specifications: parseSpecificationsBlock(fm),
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
