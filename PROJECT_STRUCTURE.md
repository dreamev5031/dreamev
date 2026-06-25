# dreamev 프로젝트 구조

**드림전동차(Dream EV)** 산업용 전동차 회사의 정적 웹사이트 프로젝트입니다.

- **기술 스택**: HTML + CSS + 바닐라 JavaScript (프레임워크 없음)
- **저장소**: [dreamev5031/dreamev](https://github.com/dreamev5031/dreamev)
- **도메인**: https://dreamev.kr
- **배포**: Cloudflare Pages (`dreamev-site`, Production branch `main`)

---

## 디렉터리 트리

```
dreamev/
├── public/              # 배포 루트 (웹사이트 본체)
├── images/              # 원본/작업용 이미지 (public/images와 중복 존재)
├── scripts/             # 빌드·변환 유틸
├── functions/           # Cloudflare Pages OAuth 함수
├── .github/workflows/   # Cloudflare 비상 Deploy Hook 등
├── .cursor/rules/       # Cursor 자동 배포 규칙
├── README.md
└── PROJECT_STRUCTURE.md # 이 문서
```

---

## `public/` — 사이트 핵심

배포 시 이 폴더가 웹 루트로 서빙됩니다.

### 페이지

| 파일 | 설명 |
|------|------|
| `index.html` | 메인 페이지 (히어로 슬라이더, 대표 모델 TOP 3) |
| `about.html` | 회사소개 |
| `cases.html` | 제작사례 갤러리 (카테고리 필터) |
| `support.html` | 고객센터 |
| `contact.html` | 견적문의 |
| `products.html` | 제품 목록 |
| `product-a1.html` | 전동 지게차 A-1 상세 |
| `product-b3.html` | 제품 B-3 상세 |
| `product-cmax.html` | 제품 C-MAX 상세 |
| `archive.html` | 아카이브 |
| `404.html` | 에러 페이지 |

### 정적 자산

| 경로 | 설명 |
|------|------|
| `css/style.css` | 전역 스타일시트 |
| `js/script.js` | 갤러리 필터 등 클라이언트 로직 |
| `images/` | 로고, 메인 배너, 제작사례 사진 (webp 위주) |

### 콘텐츠·데이터

| 경로 | 설명 |
|------|------|
| `content/cases/*.md` | Decap CMS가 관리하는 제작사례 마크다운 |
| `cases.json` | CMS 마크다운에서 생성된 갤러리 데이터 |
| `data/cases.json` | 추가 제작사례 정적 데이터 |
| `data/news.json` | 뉴스 정적 데이터 |

### 관리자·설정

| 경로 | 설명 |
|------|------|
| `admin/index.html` | Decap CMS 관리자 UI |
| `admin/config.yml` | CMS 컬렉션·필드 설정 |
| `admin/images.html` | 이미지 관리 페이지 |
| `_headers` | Cloudflare용 HTTP 헤더 (CSP 등) |

---

## 콘텐츠 관리 흐름

Decap CMS(`/admin`)에서 올린 사진·글은 GitHub 저장소의 `public/content/cases/*.md`에 저장됩니다.

```
/admin (Decap CMS)
    ↓
public/content/cases/*.md
    ↓
scripts/generate-cases-json.js
    ↓
public/cases.json
    ↓
cases.html 갤러리 렌더링
```

### 제작사례 카테고리

| 한글 | slug |
|------|------|
| 산업용 | `industrial` |
| 농업용 | `agricultural` |
| 다목적 | `multipurpose` |
| 맞춤제작 | `custom` |

### cases.json 생성

배포 전에 다음 명령을 실행합니다.

```bash
node scripts/generate-cases-json.js
```

Cloudflare Pages 빌드 명령에 포함하거나, 푸시 전 로컬에서 실행 후 `cases.json`을 함께 커밋하면 됩니다.

---

## `scripts/` — 유틸리티

| 파일 | 설명 |
|------|------|
| `generate-cases-json.js` | `content/cases/*.md` frontmatter → `public/cases.json` 변환 |
| `convert_to_webp.py` | 이미지 webp 변환 |

---

## `functions/` — 서버리스 함수

Cloudflare Pages Function으로 Decap CMS GitHub OAuth를 처리합니다.

| 파일 | 설명 |
|------|------|
| `auth.js` | GitHub OAuth 인증 리다이렉트 |
| `callback.js` | OAuth 콜백 처리 |

---

## 배포·CI/CD

### Cloudflare Pages

- **프로젝트**: `dreamev-site`
- **도메인**: https://dreamev.kr
- **Production branch**: `main`
- **트리거**: `main` 브랜치 push 시 Git 연동 자동 배포 (GitHub `Cloudflare Pages` check run으로 확인)
- **Functions**: `functions/` — Pages Functions (업로드 API, cases API 등)
- **비상 워크플로**: `.github/workflows/cloudflare-pages-deploy.yml` — `workflow_dispatch` 전용 Deploy Hook

### Cursor 자동 배포 규칙

`.cursor/rules/auto-deploy.mdc`에 정의됨:

1. `public/` 또는 배포 관련 파일 수정 후 GitHub push
2. 순서: `git add` → `git commit` → `git push origin main`

---

## Decap CMS 설정 요약

`public/admin/config.yml` 주요 설정:

- **백엔드**: GitHub (`dreamev5031/dreamev`, `main` 브랜치)
- **미디어 폴더**: `/public/images`
- **공개 경로**: `/images`
- **컬렉션**: `cases` (제작사례)
  - 필드: 제목, 카테고리, 이미지 갤러리, 작업 날짜, 상세 내용(markdown)

---

## 주요 특징

1. **프레임워크 없는 정적 사이트** — `package.json` 없음, 빌드 도구 없이 HTML 직접 서빙
2. **Git 기반 CMS** — Decap CMS + GitHub 백엔드로 비개발자도 콘텐츠 수정 가능
3. **이미지 중심** — `public/images/`에 대량의 webp 사진 보유
4. **이미지 이중 관리** — 루트 `images/`와 `public/images/`가 함께 존재

---

## 로컬 미리보기

정적 파일이므로 `public/` 폴더를 기준으로 간단한 HTTP 서버를 띄우면 됩니다.

```bash
# Python
cd public
python -m http.server 8080

# Node.js (npx)
npx serve public
```

브라우저에서 http://localhost:8080 접속
