import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkdown } from '../lib/case-content.js';
import {
  fileNameFromGalleryPath,
  galleryPathForFileName,
  normalizeCaseId,
  normalizeImageFileName,
  rebuildMarkdownFrontmatter,
  removeGalleryLine,
} from '../lib/case-manage.js';

const SAMPLE_MD = buildMarkdown({
  title: '동물사료 급여기',
  category: '농업용',
  date: '2026-06-24',
  imageFileNames: ['20260624-120501-01.webp', '20260624-120501-02.webp'],
  summary: '요약',
  customerRequest: '요청',
  workDetails: '작업',
  result: '결과',
});

test('normalizeCaseId accepts slug with and without .md', () => {
  assert.equal(normalizeCaseId('농업용-동물사료-급여기'), '농업용-동물사료-급여기.md');
  assert.equal(normalizeCaseId('농업용-동물사료-급여기.md'), '농업용-동물사료-급여기.md');
  assert.equal(normalizeCaseId('../evil'), null);
  assert.equal(normalizeCaseId('foo/bar'), null);
});

test('normalizeImageFileName blocks path traversal', () => {
  assert.equal(normalizeImageFileName('20260624-120501-01.webp'), '20260624-120501-01.webp');
  assert.equal(normalizeImageFileName('../secret.webp'), null);
  assert.equal(normalizeImageFileName('foo/bar.webp'), null);
});

test('removeGalleryLine removes first gallery image', () => {
  const updated = removeGalleryLine(SAMPLE_MD, '/images/20260624-120501-01.webp');
  assert.ok(updated);
  assert.doesNotMatch(updated, /20260624-120501-01\.webp/);
  assert.match(updated, /20260624-120501-02\.webp/);
});

test('removeGalleryLine removes last gallery image', () => {
  const updated = removeGalleryLine(SAMPLE_MD, '/images/20260624-120501-02.webp');
  assert.ok(updated);
  assert.match(updated, /20260624-120501-01\.webp/);
  assert.doesNotMatch(updated, /20260624-120501-02\.webp/);
});

test('removeGalleryLine returns null for missing image', () => {
  assert.equal(removeGalleryLine(SAMPLE_MD, '/images/missing.webp'), null);
});

test('rebuildMarkdownFrontmatter keeps valid frontmatter after gallery removal', () => {
  const updated = removeGalleryLine(SAMPLE_MD, '/images/20260624-120501-01.webp');
  const parsed = rebuildMarkdownFrontmatter({
    title: '동물사료 급여기',
    type: 'production',
    category: '농업용',
    date: '2026-06-24',
    gallery: ['/images/20260624-120501-02.webp'],
    body: '본문',
  });
  assert.match(parsed, /^---\n/);
  assert.match(parsed, /gallery:/);
  assert.match(parsed, /20260624-120501-02\.webp/);
  assert.doesNotMatch(parsed, /20260624-120501-01\.webp/);
  assert.equal(updated.includes('---'), true);
});

test('galleryPathForFileName and fileNameFromGalleryPath roundtrip', () => {
  const path = galleryPathForFileName('20260624-120501-01.webp');
  assert.equal(path, '/images/20260624-120501-01.webp');
  assert.equal(fileNameFromGalleryPath(path), '20260624-120501-01.webp');
});

test('fileNameFromGalleryPath handles bare filename', () => {
  assert.equal(fileNameFromGalleryPath('20260624-120501-01.webp'), '20260624-120501-01.webp');
});
