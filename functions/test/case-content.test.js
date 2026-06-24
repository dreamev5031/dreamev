import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_CATEGORIES,
  buildMarkdown,
  buildMdBaseName,
  isValidImageFileName,
  isValidMdFileName,
  resolveMdFileName,
  validateCategory,
  validateGalleryMatches,
  validateImages,
} from '../lib/case-content.js';

test('validateCategory allows only known categories', () => {
  assert.equal(validateCategory('산업용'), true);
  assert.equal(validateCategory('특수제작'), false);
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
  assert.match(lines[2], /^category:/);
  assert.match(lines[3], /^gallery:/);
  assert.match(lines[4], /^\s+- image: \/images\//);
  assert.match(lines[5], /^date:/);
  assert.equal(lines[6], '---');
  assert.equal(lines[7], '');
  assert.match(md, /## 고객 요청/);
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
