# Free Snow

스키·스노우보드 동호회 Free Snow 웹사이트. Astro 정적 사이트 → GitHub Pages.

- 공개 주소: https://freesnow-kr.github.io/
- 저장소: https://github.com/freesnow-kr/freesnow-kr.github.io

## 페이지

| 주소 | 파일 | 내용 |
|---|---|---|
| `/` | `src/pages/index.astro` | 메인 (영상 히어로, 시즌 일정, FAQ) |
| `/cute/` | `src/pages/cute.astro` | 픽셀 펭귄 버전 |
| `/gallery/` | `src/pages/gallery.astro` | 사진 갤러리 (구글 드라이브 폴더 연동) |
| `/webcam/` | `src/pages/webcam.astro` | 스키장 공식 웹캠 (아코디언) |
| `/login/` | `src/pages/login.astro` | 회원 로그인 (아이디 + 비밀번호) |
| `/signup/` | `src/pages/signup.astro` | 회원가입 신청 → 시트 '가입신청' 탭 |
| `/members/` | `src/pages/members.astro` | 회원 전용 (본인 정보만, 로그인 안 했으면 `/login`으로) |
| `/ride/` | – | `/`로 리디렉션 (예전 주소) |

## 실행

```sh
npm install
cp .env.example .env   # 링크·API 주소 채우기 (배포 값은 GitHub 저장소 Secrets)
npm run dev     # http://localhost:4321/
npm run build   # dist/ 생성
```

## 자주 고치는 곳

- **정모(THE SEASON)** → 소모임에 정모를 올리면 1시간 안에 메인에 자동으로 보여요. 참석은 소모임에서. 소모임 주소는 GitHub 저장소 Secrets `PUBLIC_SOMOIM_URL`과 Worker secret `SOMOIM_URL`
- **오픈채팅 링크, FAQ** → `src/data/club.ts` (모든 페이지 공통)
- **갤러리 사진** → 드라이브 폴더에 올리기만 하면 됨(최대 5분 뒤 반영). 폴더 바꾸려면 Worker secret `GALLERY_FOLDER_ID` (`cd backend && npx wrangler secret put GALLERY_FOLDER_ID`)
- **스키장 웹캠 목록** → `src/pages/webcam.astro` 맨 위 `regions`
- **가입 거주지 목록(시도·시군구)** → 법정동 CSV를 `data/`에 두고 `node scripts/make-regions.mjs data/파일.csv` (→ `src/data/regions.json`)
- **메인 영상** → `public/hero.mp4`, `public/hero.jpg` 교체 (`scripts/make-hero.swift`로 변환)

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 자동으로 빌드·배포해요.

## 회원·서버 (Cloudflare Worker)

API 서버는 `backend/`(Cloudflare Worker + D1, `https://api.freesnow.workers.dev`)예요. 회원명부·기록은 D1에 있고, 운영은 **`/admin/`(운영진 화면)**에서 해요.

- **로그인:** 아이디 = 010 뺀 번호. 처음 한 번은 생년월일 8자리로 로그인 → 새 비밀번호를 정해요. 로그인은 30일, 쓰는 동안 자동 연장.
- **가입:** `/signup` 신청 → `/admin` '가입 신청'에서 승인하면 회원이 돼요.
- **비밀번호 잊음:** 마스터가 `/admin` '회원'에서 초기화 → 72시간 동안 공용 초기화 비밀번호로 로그인해 새 비밀번호를 정해요.
- **채팅 랭킹:** `/admin` '채팅 랭킹'에서 카톡 대화 내보내기 CSV를 고르면 돼요(대화 내용은 서버로 안 가요).
- **시즌방 주주:** `/admin` '시즌방 주주'에서 시즌별로.
- 서버 배포: `cd backend && npx wrangler deploy`, 테스트: `cd backend && npm test`.
