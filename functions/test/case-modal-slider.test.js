import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const casesHtml = readFileSync(join(root, 'cases.html'), 'utf8');
const repairHtml = readFileSync(join(root, 'repair-cases.html'), 'utf8');
const sliderJs = readFileSync(join(root, 'js', 'case-modal-slider.js'), 'utf8');
const lightboxJs = readFileSync(join(root, 'js', 'case-image-lightbox.js'), 'utf8');
const styleCss = readFileSync(join(root, 'css', 'style.css'), 'utf8');

function assertSliderWiring(html) {
  assert.match(html, /js\/case-modal-slider\.js/);
  assert.match(html, /CaseModalSlider\.render/);
  assert.match(html, /function renderModalImages\(/);
}

test('cases.html uses shared modal image slider', () => {
  assertSliderWiring(casesHtml);
});

test('repair-cases.html uses shared modal image slider', () => {
  assertSliderWiring(repairHtml);
});

test('case-modal-slider.js supports swipe and end-stop navigation', () => {
  assert.match(sliderJs, /CaseModalSlider/);
  assert.match(sliderJs, /touchstart/);
  assert.match(sliderJs, /touchend/);
  assert.match(sliderJs, /SWIPE_THRESHOLD/);
  assert.match(sliderJs, /CaseImageLightbox\.open/);
  assert.match(sliderJs, /clampIndex/);
});

test('lightbox stops at first and last image', () => {
  assert.match(lightboxJs, /prevBtn\.disabled = currentIndex <= 0/);
  assert.match(lightboxJs, /nextBtn\.disabled = currentIndex >= imagePaths\.length - 1/);
});

test('style.css defines modal slider layout', () => {
  assert.match(styleCss, /\.case-modal-slider/);
  assert.match(styleCss, /object-fit:\s*contain/);
  assert.match(styleCss, /max-height:\s*min\(60vh/);
});
