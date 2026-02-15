/**
 * public/content/cases/*.md 의 frontmatter를 읽어 public/cases.json 생성.
 * /admin(Decap CMS)에서 올린 제작사례가 cases.html 갤러리/카드에 반영되도록 합니다.
 * 배포 전에 실행하거나, CI에서 실행 후 커밋하세요.
 *
 * 사용: node scripts/generate-cases-json.js
 * (프로젝트 루트에서 실행)
 */

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(__dirname, '..', 'public', 'content', 'cases');
const OUT_FILE = path.join(__dirname, '..', 'public', 'cases.json');

const CATEGORY_SLUG = {
  '산업용': 'industrial',
  '농업용': 'agricultural',
  '다목적': 'multipurpose',
  '맞춤제작': 'custom'
};

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const front = {};
  match[1].split(/\r?\n/).forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    front[key] = val;
  });
  return front;
}

let list = [];
try {
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const front = parseFrontmatter(raw);
    if (!front || !front.category) continue;
    const slug = CATEGORY_SLUG[front.category] || front.category;
    list.push({
      slug,
      category: front.category,
      title: front.title || '',
      image: front.image ? (front.image.startsWith('/') ? front.image.slice(1) : front.image) : '',
      date: front.date || ''
    });
  }
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
} catch (e) {
  console.warn('content/cases 읽기 실패:', e.message);
}

fs.writeFileSync(OUT_FILE, JSON.stringify(list, null, 2), 'utf8');
console.log('Wrote', OUT_FILE, '(', list.length, 'items)');
