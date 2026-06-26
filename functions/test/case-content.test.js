import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_CATEGORIES,
  buildMarkdown,
  buildMdBaseName,
  buildRepairMarkdown,
  buildRepairMdBaseName,
  dedupeRepairTextLines,
  isValidImageFileName,
  isValidMdFileName,
  mergeLegacyRepairWorkContent,
  normalizeContentType,
  normalizeText,
  parseRepairFrontmatter,
  resolveMdFileName,
  validateCategory,
  validateGalleryMatches,
  validateImages,
} from '../lib/case-content.js';

test('validateCategory allows known and custom categories', () => {
  assert.equal(validateCategory('산업용'), true);
  assert.equal(validateCategory('전동대차'), true);
  assert.equal(validateCategory(''), false);
  assert.deepEqual(ALLOWED_CATEGORIES, ['산업용', '농업용', '다목적', '맞춤제작']);
});

test('md filename uses korean category-title rule', () => {
  const base = buildMdBaseName('농업용', '동물사료 급여기');
  assert.equal(base, '농업용-동물사료-급여기');
  const fileName = resolveMdFileName(base, '2026-06-24', new Set(['농업용-동물사료-급여기.md']));
  assert.equal(fileName, '농업용-동물사료-급여기-2026-06-24.md');
});

test('image filename format', () => {
  assert.equal(isValidImageFileName('20260624-120501-01.webp'), true);
  assert.equal(isValidImageFileName('농업용-01.webp'), false);
});

test('reject zero images', () => {
  const result = validateImages([]);
  assert.equal(result.ok, false);
});

test('reject invalid md filename', () => {
  assert.equal(isValidMdFileName('../evil.md'), false);
  assert.equal(isValidMdFileName('농업용-동물사료-급여기.md'), true);
});

test('markdown gallery matches uploaded images', () => {
  const names = ['20260624-120501-01.webp', '20260624-120501-02.webp'];
  const md = buildMarkdown({
    title: '동물사료 급여기',
    category: '농업용',
    date: '2026-06-24',
    imageFileNames: names,
    summary: '요약',
    customerRequest: '요청',
    workDetails: '작업',
    result: '결과',
  });
  const check = validateGalleryMatches(names, md);
  assert.equal(check.ok, true);
  assert.match(md, /- image: \/images\/20260624-120501-01\.webp/);
});

test('markdown frontmatter field order', () => {
  const md = buildMarkdown({
    title: '동물사료 급여기',
    category: '농업용',
    date: '2026-02-20',
    imageFileNames: ['20260624-120501-01.webp'],
    summary: '요약',
    customerRequest: '요청',
    workDetails: '작업',
    result: '결과',
  });
  const lines = md.split('\n');
  assert.equal(lines[0], '---');
  assert.match(lines[1], /^title:/);
  assert.match(lines[2], /^type: production/);
  assert.match(lines[3], /^category:/);
  assert.match(lines[4], /^gallery:/);
  assert.match(lines[5], /^\s+- image: \/images\//);
  assert.equal(lines[6], '');
  assert.match(lines[7], /^date:/);
  assert.equal(lines[8], '---');
  assert.equal(lines[9], '');
  assert.match(md, /## 제작 내용/);
});

test('production markdown includes specifications frontmatter', () => {
  const md = buildMarkdown({
    title: '공장 자재 운반용 전동대차',
    category: '전동대차',
    purpose: '공장 내 자재 운반',
    usagePlace: '금속 가공 공장',
    location: '포천',
    date: '2026-06-25',
    imageFileNames: ['20260624-120501-01.webp'],
    summary: '요약',
    customerRequest: '요청',
    productionDetails: '제작 내용',
    features: '특징',
    result: '납품 완료',
    specifications: { voltage: '48V', battery: '리튬인산철 배터리' },
  });
  assert.match(md, /specifications:/);
  assert.match(md, /voltage: 48V/);
  assert.match(md, /purpose: 공장 내 자재 운반/);
  assert.doesNotMatch(md, /motor:/);
});

test('duplicate md filename gets sequence suffix', () => {
  const base = buildMdBaseName('산업용', '앱 업로드 테스트');
  assert.equal(base, '산업용-앱-업로드-테스트');
  const existing = new Set(['산업용-앱-업로드-테스트.md', '산업용-앱-업로드-테스트-2026-06-24.md']);
  const fileName = resolveMdFileName(base, '2026-06-24', existing);
  assert.equal(fileName, '산업용-앱-업로드-테스트-2.md');
});

test('gallery mismatch is rejected', () => {
  const names = ['20260624-120501-01.webp'];
  const md = buildMarkdown({
    title: '테스트',
    category: '산업용',
    date: '2026-06-24',
    imageFileNames: ['20260624-999999-01.webp'],
    summary: '',
    customerRequest: '',
    workDetails: '',
    result: '',
  });
  const check = validateGalleryMatches(names, md);
  assert.equal(check.ok, false);
});

test('normalizeContentType defaults to production', () => {
  assert.equal(normalizeContentType(''), 'production');
  assert.equal(normalizeContentType(undefined), 'production');
  assert.equal(normalizeContentType('repair'), 'repair');
});

test('repair markdown has no category', () => {
  const md = buildRepairMarkdown({
    title: '산업용 전동차 전진 불량 수리',
    vehicle: '산업용 전동차',
    location: '양주',
    date: '2026-06-24',
    imageFileNames: ['20260624-122830-01.webp'],
    summary: '전진 불량 증상 수리',
    customerRequest: '전진 불량으로 점검 요청',
    inspectionResult: '배선 단선 확인',
    workDetails: '배선 보수 및 시운전',
    result: '수리 후 정상 주행 확인',
  });
  assert.match(md, /type: repair/);
  assert.match(md, /vehicle: 산업용 전동차/);
  assert.match(md, /location: 양주/);
  assert.doesNotMatch(md, /^category:/m);
  assert.match(md, /## 점검 결과/);
  assert.match(md, /## 접수 증상/);
  assert.match(md, /## 작업 내용/);
  assert.doesNotMatch(md, /## 수리 및 작업 내용/);
  const parsed = parseRepairFrontmatter(md);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.title, '산업용 전동차 전진 불량 수리');
  assert.equal(parsed.gallery.length, 1);
});

test('repair md filename uses title only', () => {
  const base = buildRepairMdBaseName('전진 불량 수리');
  assert.equal(base, '전진-불량-수리');
});

test('mergeLegacyRepairWorkContent merges legacy fields', () => {
  const merged = mergeLegacyRepairWorkContent({
    selectedWorkItems: ['컨트롤러 교체', '배선 교체'],
    workDetails: '컨트롤러 교체 후 배선을 정비했습니다.',
    additionalNote: '시운전을 진행했습니다.',
  });
  assert.match(merged, /컨트롤러 교체/);
  assert.match(merged, /배선/);
  assert.match(merged, /시운전/);
});

test('normalizeText handles array and string values', () => {
  assert.equal(normalizeText(['컨택터 교체', '시운전']), '컨택터 교체, 시운전');
  assert.equal(normalizeText('  작업 내용 '), '작업 내용');
  assert.equal(normalizeText(null), '');
});

test('mergeLegacyRepairWorkContent prefers workContent and repair aliases', () => {
  assert.equal(
    mergeLegacyRepairWorkContent({ workContent: '신규 작업 내용' }),
    '신규 작업 내용',
  );
  assert.equal(
    mergeLegacyRepairWorkContent({ repairContent: '레거시 repairContent' }),
    '레거시 repairContent',
  );
  assert.equal(
    mergeLegacyRepairWorkContent({ workItems: '컨택터 교체, 배선 정비' }),
    '컨택터 교체, 배선 정비',
  );
  assert.match(
    mergeLegacyRepairWorkContent({
      repairDetails: '컨택터 이상 확인',
      selectedWorkItems: ['컨택터 교체'],
    }),
    /컨택터/,
  );
});

test('dedupeRepairTextLines removes repeated lines', () => {
  const text = dedupeRepairTextLines('배선 보수', '배선 보수', '시운전 완료');
  assert.equal(text, '배선 보수\n시운전 완료');
});
