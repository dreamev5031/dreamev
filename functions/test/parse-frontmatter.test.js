import test from 'node:test';
import assert from 'node:assert/strict';

function parseFrontmatter(content) {
  const frontmatter = {};
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return frontmatter;
  const lines = match[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^gallery\s*:\s*$/)) {
      frontmatter.gallery = [];
      i += 1;
      while (i < lines.length) {
        if (!lines[i].trim()) { i += 1; continue; }
        const m = lines[i].match(/^\s*-\s*image\s*:\s*(.+)$/);
        if (m) {
          frontmatter.gallery.push({ image: m[1].trim().replace(/^["']|["']$/g, '') });
          i += 1;
        } else break;
      }
      i -= 1;
      continue;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && !line.match(/^\s/)) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
      if (key !== 'gallery') frontmatter[key] = value;
    }
  }
  return frontmatter;
}

const uploaded = `---
title: DREAMEV
category: 산업용
gallery:
  - image: /images/20260624-122830-01.webp
date: 2026-06-24T12:00:00.000+09:00
---

body`;

test('cases.html parser reads gallery when date follows immediately', () => {
  const fm = parseFrontmatter(uploaded);
  assert.equal(fm.gallery?.length, 1);
  assert.equal(fm.gallery[0].image, '/images/20260624-122830-01.webp');
  assert.equal(fm.date, '2026-06-24T12:00:00.000+09:00');
});

const withBlankLine = uploaded.replace(
  '  - image: /images/20260624-122830-01.webp\ndate:',
  '  - image: /images/20260624-122830-01.webp\n\ndate:',
);

test('cases.html parser reads gallery with blank line before date', () => {
  const fm = parseFrontmatter(withBlankLine);
  assert.equal(fm.gallery?.length, 1);
  assert.equal(fm.gallery[0].image, '/images/20260624-122830-01.webp');
});
