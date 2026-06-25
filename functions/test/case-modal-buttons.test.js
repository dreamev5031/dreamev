import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const casesHtml = readFileSync(join(root, 'cases.html'), 'utf8');
const repairHtml = readFileSync(join(root, 'repair-cases.html'), 'utf8');

function assertModalActions(html, opts) {
  assert.match(html, /class="case-modal-actions"/);
  assert.match(html, /id="modalPrev"/);
  assert.match(html, /id="modalNext"/);
  assert.match(html, /id="modalBackList"/);
  assert.ok(html.includes(`href="${opts.listHref}"`), `expected list href ${opts.listHref}`);
  assert.ok(html.includes(`href="${opts.contactHref}"`), `expected contact href ${opts.contactHref}`);
  assert.ok(html.includes(`>${opts.ctaLabel}<`), `expected CTA label ${opts.ctaLabel}`);
  const modalSection = html.match(/<div class="case-modal-actions">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/)?.[0] || '';
  assert.doesNotMatch(modalSection, />상담·견적 문의</);
}

test('cases.html modal has production bottom actions', () => {
  assertModalActions(casesHtml, {
    listHref: '/cases',
    contactHref: 'contact.html?type=custom',
    ctaLabel: '상담 신청',
  });
  assert.match(casesHtml, /function updateModalNav\(/);
  assert.match(casesHtml, /window\.openModalAt/);
});

test('repair-cases.html modal has repair bottom actions', () => {
  assertModalActions(repairHtml, {
    listHref: '/repair-cases',
    contactHref: 'contact.html?type=repair',
    ctaLabel: '수리 신청',
  });
});
