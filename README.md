# Free Snow

스키·스노우보드 동호회 Free Snow 웹사이트. Astro 정적 사이트 → GitHub Pages.

- 공개 주소: https://yunj8649.github.io/free-snow/
- 저장소: https://github.com/yunj8649/free-snow

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
npm run dev     # http://localhost:4321/free-snow/
npm run build   # dist/ 생성
```

## 자주 고치는 곳

- **정모(THE SEASON)** → 소모임에 정모를 올리면 1시간 안에 메인에 자동으로 보여요. 참석은 소모임에서. 소모임 주소는 `src/data/club.ts`의 `somoimUrl`과 `apps-script/Code.gs`의 `SOMOIM_URL`
- **오픈채팅 링크, FAQ** → `src/data/club.ts` (모든 페이지 공통)
- **갤러리 사진** → 드라이브 폴더에 올리기만 하면 됨(최대 5분 뒤 반영). 폴더 바꾸려면 `apps-script/Code.gs`의 `GALLERY_FOLDER_ID`
- **스키장 웹캠 목록** → `src/pages/webcam.astro` 맨 위 `regions`
- **가입 거주지 목록(시도·시군구)** → 법정동 CSV를 `data/`에 두고 `node scripts/make-regions.mjs data/파일.csv` (→ `src/data/regions.json`)
- **메인 영상** → `public/hero.mp4`, `public/hero.jpg` 교체 (`scripts/make-hero.swift`로 변환)

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 자동으로 빌드·배포해요.

## 회원 로그인 설정 (구글 시트)

회원은 구글 로그인 없이 **아이디(비상연락망에서 010 뺀 8자리) + 비밀번호(생년월일 8자리)**로 로그인해요. 로그인 후엔 본인 정보만 보이고 명단은 안 보여요. 회원명부 시트 → Apps Script → 사이트 구조예요.

1. 회원명부 구글 시트 → **확장 프로그램 → Apps Script**
2. `apps-script/Code.gs` 내용을 붙여넣고 저장
3. **프로젝트 설정 → 스크립트 속성**: `TOKEN_SECRET` = 긴 랜덤 문자열
4. **배포 → 새 배포 → 웹 앱** (실행: 나 / 액세스: 모든 사용자)
5. 나온 웹 앱 URL을 `src/data/club.ts`의 `membersApi`에 넣고 push

시트 머리글: `No | 구분 | 거주지 | 이름 | 성별 | 나이(출생연도) | (생일)월 | (생일)일 | 비상연락망 | 비공개연락처`

- 시트 공유는 **"제한됨"**(운영진만). 링크 공개·웹에 게시 금지.
- `Code.gs`를 고치면 Apps Script에 다시 붙여넣고 **배포 → 배포 관리 → 새 버전**.
- **회원가입:** `/signup` 신청서는 같은 시트의 **'가입신청'** 탭에 쌓여요(없으면 자동 생성, 시도·거주지 따로, 상태는 대기/승인 드롭다운). 상태를 **'승인'**으로 바꾸면 **회원현황** 탭에 **구분 = 시도**로, 같은 시도·같은 거주지 아래에 자동 추가돼요. **운영진·마스터 행은 건드리지 않아요.** 그때부터 로그인돼요.
- 로직 테스트: `node apps-script/Code.test.mjs`
