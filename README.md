# dreamev

## 제작사례(cases) 갤러리 갱신

`/admin`(Decap CMS)에서 올린 사진은 `public/content/cases/*.md`에 저장됩니다.  
cases.html이 이 목록을 쓰려면 **배포 전에** 다음을 실행해 `public/cases.json`을 생성하세요.

```bash
node scripts/generate-cases-json.js
```

Cloudflare Pages 등에서 빌드 명령에 포함하거나, 푸시 전 로컬에서 실행 후 `cases.json`을 함께 커밋하면 됩니다.