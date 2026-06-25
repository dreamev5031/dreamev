import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const casesHtml = readFileSync(join(root, 'cases.html'), 'utf8');
const repairHtml = readFileSync(join(root, 'repair-cases.html'), 'utf8');
const styleCss = readFileSync(join(root, 'css', 'style.css'), 'utf8');

test('cases and repair intro headers avoid viewport hero classes', () => {
  assert.doesNotMatch(casesHtml, /class="[^"]*\bhero\b[^"]*case-page-hero/);
  assert.doesNotMatch(repairHtml, /class="[^"]*\bhero\b[^"]*case-page-hero/);
  assert.match(casesHtml, /class="page-header gallery-header case-page-hero"/);
});

test('case-page hero uses content flow layout without fixed vh hero stack', () => {
  assert.match(styleCss, /\.case-page-section \.case-page-hero\.gallery-header[\s\S]*height:\s*auto/);
  assert.match(styleCss, /\.case-page-section \.case-page-hero\.gallery-header[\s\S]*overflow:\s*visible/);
  assert.match(styleCss, /\.case-page-section \.case-page-hero\.gallery-header[\s\S]*isolation:\s*auto/);
  assert.doesNotMatch(styleCss, /\.case-page-section \.case-page-hero\.gallery-header[\s\S]*100vh/);
});
