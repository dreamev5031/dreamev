import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const casesHtml = readFileSync(join(root, 'cases.html'), 'utf8');
const repairHtml = readFileSync(join(root, 'repair-cases.html'), 'utf8');
const lightboxJs = readFileSync(join(root, 'js', 'case-image-lightbox.js'), 'utf8');
const styleCss = readFileSync(join(root, 'css', 'style.css'), 'utf8');

function assertLightboxWiring(html) {
  assert.match(html, /js\/case-image-lightbox\.js/);
  assert.match(html, /CaseImageLightbox\.bindDetailImages/);
  assert.match(html, /CaseImageLightbox\.isOpen\(\)/);
  assert.match(html, /function renderModalImages\(/);
}

test('cases.html wires modal images to shared lightbox', () => {
  assertLightboxWiring(casesHtml);
});

test('repair-cases.html wires modal images to shared lightbox', () => {
  assertLightboxWiring(repairHtml);
});

test('case-image-lightbox.js supports gallery navigation and touch', () => {
  assert.match(lightboxJs, /bindDetailImages/);
  assert.match(lightboxJs, /touchstart/);
  assert.match(lightboxJs, /touchend/);
  assert.match(lightboxJs, /showAt/);
  assert.match(lightboxJs, /isOpen/);
});

test('style.css defines lightbox overlay above case modal', () => {
  assert.match(styleCss, /\.case-image-lightbox/);
  assert.match(styleCss, /z-index:\s*11050/);
  assert.match(styleCss, /object-fit:\s*contain/);
});
