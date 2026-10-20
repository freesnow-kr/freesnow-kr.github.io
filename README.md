# Free Snow

스키·스노우보드 동호회 Free Snow 웹사이트. Astro 정적 사이트 → GitHub Pages.

- 공개 주소: https://yunj8649.github.io/free-snow/
- 저장소: https://github.com/yunj8649/free-snow

## 페이지

| 주소 | 파일 | 내용 |
|---|---|---|
| `/` | `src/pages/index.astro` | 메인 (영상 히어로, 시즌 일정, FAQ) |
| `/cute/` | `src/pages/cute.astro` | 픽셀 펭귄 버전 |
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

- **오픈채팅 링크, 시즌 일정, FAQ** → `src/data/club.ts` (모든 페이지 공통)
- **스키장 웹캠 목록** → `src/pages/webcam.astro` 맨 위 `regions`
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
- **회원가입:** `/signup` 신청서는 같은 시트의 **'가입신청'** 탭에 쌓여요(없으면 자동 생성, 상태 '대기'). 운영진이 확인 후 회원명부 탭으로 옮기면 그때부터 로그인돼요.
- 로직 테스트: `node apps-script/Code.test.mjs`
