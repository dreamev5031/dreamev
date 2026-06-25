import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const casesHtml = readFileSync(join(root, 'cases.html'), 'utf8');
const repairHtml = readFileSync(join(root, 'repair-cases.html'), 'utf8');

function modalBlock(html) {
  const start = html.indexOf('// Modal functionality');
  const end = html.indexOf('// Global Footer initialization', start);
  return html.slice(start, end);
}

test('cases modal block defines SPEC_ORDER in same scope as renderModalSpecs', () => {
  const block = modalBlock(casesHtml);
  assert.match(block, /var SPEC_ORDER = \[/);
  assert.match(block, /function renderModalSpecs\(/);
  assert.match(block, /SPEC_ORDER\.forEach/);
});

test('cases gallery cards use delegated click with accessibility attrs', () => {
  assert.match(casesHtml, /function openGalleryItem\(/);
  assert.match(casesHtml, /data-case-id=/);
  assert.match(casesHtml, /role="button" tabindex="0"/);
  assert.match(casesHtml, /caseGallery\.dataset\.clickBound/);
  assert.match(casesHtml, /addEventListener\('keydown'/);
});

test('repair gallery cards use delegated click with accessibility attrs', () => {
  assert.match(repairHtml, /function openGalleryItem\(/);
  assert.match(repairHtml, /data-case-id=/);
  assert.match(repairHtml, /caseGallery\.dataset\.clickBound/);
});
