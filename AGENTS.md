# Free Snow — AI 작업 가이드

스키·스노우보드 동호회 사이트. 이 문서는 AI가 프로젝트 흐름과 결정 이유를 빠르게 파악하기 위한 것. 사람용 요약은 `README.md`.

## 한눈에

- **스택**: Astro 7 정적 사이트 (프레임워크·CSS 라이브러리 없음, 의존성 `astro` 하나). Node ≥ 22.22 (로컬 24).
- **호스팅**: GitHub Pages, 저장소 `freesnow-kr/freesnow-kr.github.io` (조직 `freesnow-kr`, public), `main` push → `.github/workflows/deploy.yml` (withastro/action, `node-version: 24`).
- **주소**: `https://freesnow-kr.github.io/` — 하위 경로 없음(`astro.config.mjs`에 `base` 없음).
- **서버 = Cloudflare Worker `backend/` + D1**(2026-10-23 이전, 사용자 요구: Apps Script 쓰는 코드 제거). 주소 `https://api.freesnow.workers.dev`, 계정 `yunj213@gmail.com`, D1 `freesnow`. 사이트는 `club.api`(`PUBLIC_API_URL`)만 부름. 자세한 건 아래 '서버 (Cloudflare Worker)'.
- 예전 **Apps Script**(`apps-script/`)는 저장소에서 뺌(`.gitignore`) — 이 컴퓨터에만 되돌리기용으로 보관, 사이트는 안 씀. 아래 기능별 절에 나오는 '탭'·스크립트 속성·`Code.gs` 설명은 **옮기기 전 기준**: 규칙·응답 모양은 Worker가 그대로 따르고, 저장 위치는 D1 테이블(`backend/migrations/`, `docs/migration/02-design.md` §8).
- **사용자**: 한국어 사용. 화면 문구는 한국어 존댓말(해요체), 디자인 문구는 영문 대문자.

## 서버 (Cloudflare Worker, `backend/`)

- 배포: `cd backend && npx wrangler deploy` (사이트 배포와 따로, 사용자 확인 후). DB 바꾸기: `migrations/000N_*.sql` 추가 → `npx wrangler d1 migrations apply DB --remote`.
- Secrets(`npx wrangler secret put 이름`, 코드·저장소에 없음): `LOGIN_KEY_SECRET`(로그인 이력 HMAC), `RESET_PASSWORD`(공용 초기화 비밀번호 — **사용자가 직접 넣음**), `SNOWLIVE_API`, `SOMOIM_URL`, `GALLERY_FOLDER_ID`, 선택 `GOOGLE_API_KEY`(있으면 갤러리를 Drive API로 만든 날짜 최신순, 없으면 공개 폴더 보기 페이지 `embeddedfolderview`에서 이름순 — 비공식). 로컬은 `backend/.dev.vars`.
- **갤러리 사진**(사용자 요구 2026-10-23): **회원 누구나** `/gallery`에서 올림 → 원본 그대로 R2 `freesnow-photos`(`orig/`·`large/` 1800px·`thumb/` 720px, 큰 사진·작은 사진은 브라우저가 만듦), `photos` 테이블(`0004`). 시즌 = 파일 날짜(휴대폰은 찍은 시각) 기준 7/1~6/30. 보기 `GET /photo/{id}/{thumb|large|orig}`(1년 캐시, 드라이브로 옮긴 건 lh3 주소로 302). 지우기는 올린 사람·운영진. **R2엔 이번·지난 시즌만**, 더 오래된 시즌은 드라이브 '프리스노우 {시즌}' 폴더(앱이 만들고 링크 공유)로 원본 이동 후 R2에서 삭제 — 매일 Cron이 8장씩 + `/admin` '사진 보관' 버튼. 드라이브 권한은 OAuth `drive.file`(앱이 만든 것만): `backend/scripts/google-auth.mjs`로 한 번 연결 → secrets `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`. 구글 클라우드 OAuth 동의 화면은 '프로덕션'으로 둘 것(테스트 상태면 리프레시 토큰이 7일 뒤 만료). 드라이브 쓰기를 먼저 기록하고 R2를 지워서 중간에 끊겨도 사진은 안 잃음.
- 예전 드라이브 갤러리 폴더: 그대로 읽어서 회원 사진 뒤에 붙임. **프로필 사진은 D1에 data URL**(256px JPG, 예전 드라이브 사진 ID도 `photoSrc`로 그대로 보임). **채팅 랭킹은 운영진이 `/admin`에서 CSV를 고르면 브라우저가 세서(`src/scripts/chat.ts`) 결과만 올림** — 드라이브 폴더·Worker CPU 안 씀, 대화 내용은 서버로 안 감.
- **운영진 화면 `/admin/`**(`src/pages/admin.astro`, `backend/src/admin.ts`): 가입 승인·거절(시트 드롭다운 대신), 회원 수정, 마스터는 권한·상태·비밀번호 초기화, 시즌방 주주(시즌별), 채팅 랭킹 올리기, 로그인 이력, 운영 기록(마스터). `/members`에 운영진에게만 링크. 권한은 서버가 매번 DB로 확인.
- 데이터 이전: 구글 시트 → 파일 → 다운로드 → `.xlsx` → `python3 -I backend/scripts/import.py 파일.xlsx migration-*.sql` → `npx wrangler d1 execute DB --remote --file …`. 회원 ID = `'m' + sha256(전화)[:12]`. 출력 SQL은 옮기는 테이블을 비우고 다시 채움(비밀번호·세션도) → **운영 시작 전에만**. xlsx·SQL은 개인정보라 저장소 밖에(`.gitignore`).
- 비밀번호 해시 PBKDF2-SHA256 10만 회: 실제 Cloudflare에서 CPU 19~55ms(무료 한도 10ms 넘지만 40/40 성공, 2026-10-23). Workers는 10만 회 넘으면 오류. 로그인이 `exceeded CPU`로 실패하면 반복 횟수를 줄이거나 유료($5/월) 검토.
- 되돌리기: GitHub Secret `PUBLIC_API_URL`을 예전 Apps Script 웹앱 주소로 바꿔도 **안 됨**(사이트 코드가 Worker 전용) → 이전 전 커밋으로 되돌려 배포 + Apps Script 다시 배포. 전환 뒤 D1에 쌓인 기록은 시트로 옮겨야 함.

## 라우트와 파일

| 라우트 | 파일 | 스타일 |
|---|---|---|
| `/` | `src/pages/index.astro` | 에디토리얼(Burton 느낌): 영상 히어로, 티커, THE SEASON, SKI/SNOWBOARD, FAQ |
| `/gallery/` | `src/pages/gallery.astro` | 사진 갤러리 — **구글 드라이브 폴더**에서 실시간으로 불러옴, 클릭하면 `<dialog>`로 크게 보기(←/→, Esc) |
| `/webcam/` | `src/pages/webcam.astro` | 같은 에디토리얼 스타일 |
| `/login/` | `src/pages/login.astro` | 로그인 폼 + 회원가입 버튼. 로그인 후(또는 이미 로그인 상태면) **메인으로**, `?next=` 있으면 거기로 |
| `/signup/` | `src/pages/signup.astro` | 회원가입 신청 폼 (개인정보 동의 필수) |
| `/members/` | `src/pages/members.astro` | 회원 전용, **본인 정보만**. 토큰 없거나 만료면 `/login`(`?expired`)으로 |
| `/rank/` | `src/pages/rank.astro` | 회원 전용 오픈채팅 메시지 수 랭킹, 끝난 달만 달별로 고름(기본: 항상 지난달 1일~말일, 이번 달은 숨김, '전체' 없음 — 사용자 요구). 헤더 메뉴 **CHAT RANK** |
| `/shredlog/` | `src/pages/shredlog.astro` | SHRED LOG: 개인 시즌 출격·지출 기록(24-25/25-26/26-27), 시즌권 본전 계산, 시즌 비교, 지출 CSV. 비회원도 사용(브라우저 저장) + 로그인 유도, 회원은 시트 저장. 시즌 = 7/1~6/30 |
| `/seasonroom/` | `src/pages/seasonroom.astro` | 회원 전용 **RIDE & STAY**(예전 SEASON ROOM, 주소는 그대로): 출격·시즌방 숙박 체크 달력, 달별 시즌방 사용 이력 |
| `/password/` | `src/pages/password.astro` | 비밀번호 변경·첫 로그인 후 새 비밀번호 (`?first`) |
| `/admin/` | `src/pages/admin.astro` | 운영진 화면 (위 '서버' 참고) |
| `/cute/` | `src/pages/cute.astro` | 픽셀아트(Kizupi 느낌), 자체 `<style is:global>` |
| `/ride/` | `astro.config.mjs` `redirects` | 예전 공개 주소 → `/` |

- `src/styles/ride.css`: `/`, `/webcam`, `/members` 공통 전역 CSS (토큰, 고정 헤더, 버튼, 푸터). **셀렉트박스 모양(직접 그린 화살표, 오른쪽 14px 안쪽)도 여기 `select` 공통** — 페이지 스타일에선 select에 `background` 단축 속성 쓰지 말고(화살표 지워짐) `background-color`, 오른쪽 여백 34px 이상. 각 페이지는 `import '../styles/ride.css'` + 페이지 전용 `<style>`.
- `src/data/regions.json`: 가입 거주지 선택 목록(시도 → 시군구). `node scripts/make-regions.mjs data/list_20260630.csv`로 법정동 CSV에서 생성(원본 CSV는 `data/`, gitignore). 시도는 서울·경기 먼저 그다음 가나다, 시군구는 가나다, 시 아래 일반구(수원시장안구 등) 제외.
- `src/data/club.ts`: **공통 데이터** — `club.joinUrl`(카카오 오픈채팅), `club.somoimUrl`, `club.membersApi`(Apps Script URL), `trips`(시즌 일정), `faqs`. 여러 페이지가 import하므로 문구는 여기서 수정.
- **링크·ID는 코드에 넣지 않음**(사용자 요구, 2026-10-22):
  - 사이트: `club`의 링크 3개는 빌드 환경변수 `PUBLIC_JOIN_URL`, `PUBLIC_SOMOIM_URL`, `PUBLIC_MEMBERS_API` — 로컬은 `.env`(gitignore, 양식 `.env.example`), 배포는 GitHub 저장소 Actions **Secrets**(또는 Variables, 같은 이름) → `deploy.yml`이 넘겨 줌. 하나라도 비면 빌드가 멈춰서 떠 있는 사이트는 그대로. 브라우저가 쓰는 값이라 배포된 사이트에선 보임(진짜 숨길 값은 아래 스크립트 속성).
  - Apps Script: 폴더 id·외부 주소는 로컬 `Code.gs`(저장소에 없음) 맨 위 `CONFIG` — `GALLERY_FOLDER_ID`, `CHAT_FOLDER_ID`, `AVATAR_FOLDER_ID`(비우면 자동 생성 후 스크립트 속성에 저장), `SOMOIM_URL`, `SNOWLIVE_API`. 코드는 `config('이름')` = 같은 이름 스크립트 속성 → 없으면 `CONFIG`. 비어 있으면 해당 기능 '준비 중'/오류. `authorizeDrive` 실행하면 빠진 값을 알려 줌. 테스트는 `CONFIG`를 비우고 `load()`의 `props`에 가짜 값.
- 헤더/푸터 마크업은 페이지마다 복사돼 있음. 메뉴 항목을 바꾸면 헤더가 있는 페이지 전부(`index`, `gallery`, `webcam`, `login`, `signup`, `members`, `rank`, `shredlog`, `seasonroom`) 수정. 메뉴는 SEASON·GALLERY·WEBCAM·MEMBERS·CHAT RANK·SHRED LOG·RIDE & STAY 7개(`password` 페이지 헤더도)(RIDE·FAQ는 사용자 요청으로 뺌, 섹션은 메인에 그대로). 1200px 이하는 ☰ 메뉴(`ride.css` 미디어쿼리 + `session.ts`의 `min-width: 1201px`, 실제 필요 폭 약 1170px — 메뉴를 늘리면 다시 재서 바꿀 것) — 메뉴를 더 늘리면 이 값도 늘릴 것.
- `src/scripts/session.ts`: 에디토리얼 페이지 공통 클라이언트 모듈. 헤더 스크롤 배경(`.is-solid`), 로그인 상태면 헤더 버튼 LOGIN→LOGOUT, 토큰 저장(`store`), Apps Script 호출(`call`). 각 페이지 `<script>`에서 import.
- `ride.css`의 `[hidden] { display: none !important }` — display를 지정한 요소에 `hidden`을 써도 숨겨지게(빠뜨리면 폼/완료 화면이 같이 보이는 버그).
- 헤더 오른쪽 버튼(`.nav-join`)은 **LOGIN** → `/login/` (로그인 상태면 LOGOUT). MEMBERS 메뉴 → `/members/`. 오픈채팅(`club.joinUrl`)은 메인 히어로 `KAKAO OPEN CHAT` 버튼, 로그인 화면의 가입 문의 버튼, 푸터 링크로 연결.

## 경로 규칙 (중요)

- 내부 링크·에셋은 항상 `` `${base}/...` ``, `const base = import.meta.env.BASE_URL.replace(/\/$/, '')` — 끝 슬래시를 떼서 지금(루트)은 `''`. 그냥 `BASE_URL`을 쓰면 루트에선 `/`라 `${base}/`가 `//…`(다른 사이트 주소)로 깨짐.
- 나중에 하위 경로로 옮기면 `astro.config.mjs`에 `base`만 다시 넣으면 됨(위 패턴이 그대로 동작). `redirects` 대상엔 base가 자동으로 안 붙으니 직접 적을 것.

## 에셋

- `public/hero.mp4`(H.264 1280×720, AAC, 약 14초, 4.5MB) + `public/hero.jpg`(포스터): 메인 히어로. 동호회 자체 촬영 영상.
- 원본 영상 `public/2526_*.mp4`는 **`.gitignore`로 배포 제외** (HEVC라 Chrome/Firefox 재생 불가, 용량 큼).
- 영상 교체: `scripts/make-hero.swift` (macOS AVFoundation. 로컬 ffmpeg는 x265 라이브러리 문제로 깨져 있음). HEVC → H.264, 2.5Mbps, 소리 유지. 세로로 저장된 가로 영상이면 회전 처리 필요(첫 영상 `2526_season.mp4`가 그랬음).
- 히어로 `<video autoplay muted loop playsinline>` — 자동재생은 음소거만 허용되므로 소리는 `.hero-sound` 버튼으로 켬. `.hero-pause` 버튼(5초 넘는 자동재생은 멈춤 수단 필요), `prefers-reduced-motion`이면 정지 상태로 시작.
- 파비콘: `public/favicon.png`(원 바깥 투명), `public/apple-touch-icon.png`(흰 배경, iOS는 투명을 검게 칠함). 원본 `public/freesnow_logo5.jpeg`.
- `public/mascot.svg`: `/cute` 픽셀 펭귄 (직접 그린 오리지널, crispEdges path).

## 웹캠 페이지 (`/webcam`)

- `regions` 배열(지역 → 스키장). 렌더링 시 지역 안에서 `localeCompare(..., 'ko')`로 가나다 정렬.
- `embed: true` → `<details>` 아코디언 안 `<iframe data-src>`; 펼칠 때만 `src` 설정, 접으면 `about:blank`(재생 중지·부하 감소).
- **스키장 공식 페이지만 iframe/링크.** 스트림(m3u8 등) 직접 핫링크·재송출은 하지 않기로 결정(스키장 허락 없음). 허락받은 스키장만 예외로 검토.
- 지산: `X-Frame-Options: SAMEORIGIN` → 링크만. 하이원 팝업 플레이어는 `http://`라 https 페이지에서 차단됨.
- 하이원 30초 / 비발디 20초 / 무주 1분 자동 종료는 각 스키장 설정(변경 불가).
- 주소 확인 날짜: 2026-10. 깨지면 해당 스키장 사이트에서 새 주소 확인.

## 갤러리 (`/gallery`)

- 운영진이 드라이브 폴더(스크립트 속성 `GALLERY_FOLDER_ID`)에 사진을 올리면 사이트에 반영 — 코드 수정·배포 불필요. 폴더는 '링크가 있는 모든 사용자' 보기 권한이어야 이미지가 보임.
- `action:'gallery'` → `DriveApp`으로 폴더의 이미지 파일만 최신순(생성일) `[{id, caption}]`. 5분 `CacheService` 캐시(새 사진은 최대 5분 뒤). caption = 파일 이름(확장자 제외, `_`→공백), 휴대폰 기본 이름(IMG_…, KakaoTalk… 등)이면 ''.
- 이미지 주소 `https://lh3.googleusercontent.com/d/{id}=w720`(격자) / `=w1800`(크게) — 드라이브가 크기 조절. 비공식 주소라 막히면 `https://drive.google.com/thumbnail?id={id}&sz=w720`로 바꿔 볼 것.
- 파일 이름은 `textContent`·속성으로만 렌더링(HTML 주입 방지). 하위 폴더는 읽지 않음.
- 사진 목록은 `src/scripts/session.ts`의 `galleryPhotos()`로 받음: 브라우저 `localStorage`(`fs-gallery`)에 저장본이 있으면 **기다리지 않고 바로 씀**(Apps Script 응답이 1~2초라 — 2026-10-23 사용자가 느리다고 함), 10분 지났으면 뒤에서 새로 받아 다음 방문에 반영. 처음 방문만 서버를 기다림. 이미지 주소는 `driveImg(id, w)` — 메인 띠와 갤러리 격자 둘 다 `w720`(같은 주소라 브라우저 캐시 공유, 드라이브 응답 `max-age=86400`). 두 페이지 `<head>`에 Apps Script·`lh3` preconnect.
- 메인 `#ride` 섹션 = **두 줄 사진 띠**(사용자 선택 '시안 C'): 최근 20장을 두 줄로 나눠 윗줄 왼쪽·아랫줄 오른쪽으로 무한 흐름(같은 묶음 2번 이어붙임, 두 번째는 aria-hidden). 높이만 고정·가로 원래 비율(잘림 없음). hover·멈춤 버튼으로 정지, 모션 줄이기면 정지+가로 스크롤. 사진 클릭 → `/gallery`.

## 오픈채팅 랭킹 (`/rank` + `apps-script` chatrank)

- 카카오는 오픈채팅을 읽는 공식 API가 없음 → 운영진이 **대화 내보내기 CSV**(`Date,User,Message`, 메시지 안 줄바꿈은 따옴표)를 스크립트 속성 `CHAT_FOLDER_ID` 드라이브 폴더에 올림. 폴더에서 가장 최근에 만든 `.csv` 하나만 셈(내보내기는 전체 기록이라). 폴더는 비공개로 둬도 됨.
- `action:'chatrank'` {token}: **회원만**. `parseChat` → `{from, to, total, ranks:[{name, count}], months:[{month:'2025-11', total, ranks}]}`(최근 달부터, 같은 개수면 그 달에 먼저 말한 순). 메시지 내용은 응답에 넣지 않음. `chatrank2:`+파일 id+수정시각을 키로 6시간 캐시(결과가 캐시 한 칸 100KB를 넘어 `bigCachePut/Get`으로 3만 자씩 나눠 저장 — 예전엔 조용히 캐시 실패해서 매번 CSV를 다시 셌음). 최신 파일 찾기도 10분 캐시(`chatrank:file`) → 새 파일은 최대 10분 뒤 반영. 화면은 지난 결과를 브라우저(`fs-chatrank`)에 저장해 바로 보여 주고 뒤에서 새로 받아 바뀌면 다시 그림(고른 달 유지), 로그아웃(`store.clear`) 때 지움. **응답 모양을 바꾸면 키 앞머리 숫자를 올릴 것**(안 그러면 새 버전 배포 후에도 예전 캐시가 나옴 — 실제로 달별 데이터가 안 나왔던 원인).
- 제외: `CHAT_SKIP_USERS`(방장봇), 입장·퇴장 등 `CHAT_SYSTEM` 문구. 닉네임 `이름/나이/…`는 이름/나이가 같으면 한 사람(닉네임 바꿔도 합산), 표시는 마지막 닉네임.

## SHRED LOG (`/shredlog` + `apps-script` shredlog)

- 사용자 결정(2026-10-22): **비회원도 쓸 수 있게** 브라우저 `localStorage`(`fs-shredlog`)에 저장하고 로그인 버튼으로 유도. **시트에는 로그인한 회원 기록만** 저장.
- 로그인 상태면 화면은 서버 응답만 그림(저장할 때마다 서버가 내 기록 전체를 돌려줌). 브라우저에 로그인 전 기록이 있으면 '내 계정으로 옮기기' 버튼 → `op:'add'`로 한 번에 보내고 브라우저 기록 삭제. 토큰 만료면 브라우저 저장으로 돌아가고 안내.
- `action:'shredlog'` {token, op?: 'add'|'delete'} → `{visits, expenses, pass}`(본인 것만). add = {visits?, expenses?, pass?: {'25-26': {price, day}}}, 같은 ID는 건너뜀(옮기기 재시도해도 중복 없음). delete = {visit?(묶인 지출도), expense?} — **연락처가 본인인 줄만** 지움. `LockService` 잠금, 회원당 3000줄 상한, ID·날짜·금액 형식 검사, 글자 칸은 `clean`(수식 주입 방지).
- 탭(같은 스프레드시트, 없으면 자동 생성): **'출격기록'** `연락처|ID|날짜|스키장|시간대|설질|스타일|날씨|동행|기온|런수|라이딩시간|만족도|세팅|메모|기록일시`, **'지출기록'** `연락처|ID|날짜|분류|금액|메모|출격ID|기록일시`, **'시즌권'** `연락처|시즌|시즌권가격|일일권가격|변경일시`(회원·시즌당 한 줄). 화면 필드 ↔ 머리글은 `LOG_VISIT_COL`.
- 기록 수정 기능 없음(지우고 다시 추가).
- **시즌 오픈일** `SEASON_OPEN`(shredlog.astro 스크립트, 지금 `{'26-27': '2026-11-28'}` — 사용자 지정): 그 날 전에는 시즌 버튼에 'OPEN 11.28', 고르면 '아직 오픈 전이에요' 안내, 처음 열 때 지난 시즌을 보여 줌. 그 날부터 자동으로 사라짐(브라우저 날짜 기준). 오픈 전에도 기록은 가능(시즌권 미리 산 것 등). 새 시즌 추가할 때 `seasons`와 함께 갱신.
- 시즌권 계산은 **'계산하기' 버튼을 눌러야**(사용자 요구, 자동 계산 X): 가격 저장 → 라이딩 일수로 1회당 단가·본전. 시즌권 칸은 시즌을 바꾸거나 기록을 새로 불러올 때만 저장된 값으로 채움(입력 중 값 안 덮게).
- **출격 일수 = SHRED LOG 출격 날짜 ∪ 스노우라이브 기록 날짜**(같은 날 한 번). 출격 칸·1회 평균·시즌권 1회당 단가·비교표가 이 값을 씀(스노우라이브만 연결하고 출격을 안 적어도 단가 계산되게 — 사용자 요구).
- **스노우라이브 연동**(사용자 결정 2026-10-22, 공식 API 아님 — 앱이 쓰는 `friend-detail-page` 주소(스크립트 속성 `SNOWLIVE_API`)를 허락 없이 사용하는 것에 동의함): 회원이 SHRED LOG에서 스노우라이브 공유 링크/ID를 연결 → 연결 정보도 아래 '스노우라이브기록' 탭 하나에(따로 탭 없음 — 사용자 요구로 합침). 연결 직후 가져오기 전이면 `시즌` 빈 줄로 연결만 표시, 첫 시즌을 가져오면 그 줄을 채움. 회원의 연결 ID도 1시간 캐시(`snowliveid:`+연락처, 연결·해제 때 지움). `action:'snowlive'` {token, season, op?: 'link'|'unlink', id?} → `parseSnowlive`가 라이딩 통계만(총 런·점수·랭킹·상위%·티어·슬로프 TOP10·날짜별 런) 골라 보냄 — **성별 등 다른 항목은 버림**, `hide_profile`이면 통계 없이 `{hidden:true}`. 스노우라이브 시즌 = 10/1~3/31. 가져온 통계(라이딩 통계만)는 **'스노우라이브기록'** 탭(`연락처|스노우라이브ID|시즌|데이터(JSON)|가져온시각`)에 시즌별 한 칸 JSON으로 저장(사용자 요구, API 재호출 줄이기). 읽는 순서: **캐시(1시간) → 시트 → 스노우라이브**. 끝난 시즌(4/1 이후)은 저장된 것만 쓰고 다시 요청 안 함, 진행 중 시즌은 1시간 지나면 새로 요청, 요청 실패 시 저장된 것 사용. 다른 ID로 바꾸면 예전 ID 기록, 연결 해제하면 전부 삭제. **'재연결' 버튼**(`op:'refresh'`) = 캐시·시트 무시하고 스노우라이브에서 새로 → 시트·캐시 갱신, 1분 안에 또 누르면 저장된 것(스노우라이브 서버 보호). 날짜별 런은 출격 표 '스노우라이브' 칸에도 표시. API가 인증 없이 아무 ID나 받아 줌(입력한 ID가 본인 것인지 확인 불가). 응답 모양이 바뀌면 '불러오지 못했어요' → `parseSnowlive`와 `Code.test.mjs` 10번 수정.

## RIDE & STAY = 출격·시즌방 체크 (`/seasonroom` + `apps-script` seasonroom)

- 사용자 요구(2026-10-22): 시즌방에서 누가 언제 썼는지 확인. **회원 전체**가 체크, 방 2개지만 구분 없음, 정원 없음, 지난 날짜도 자유롭게. 정산 **숙박 1박 10,000원 / 4시간 휴식 5,000원**(`ROOM_PRICES`), **시즌방 주주는 제외**.
- **'시즌방'** 탭 `날짜|이름|연락처|체크시각|구분` — 회원·날짜당 한 줄, 구분 = 숙박/휴식/**취소**. **취소해도 줄을 지우지 않고 구분만 '취소'**(사용자 요구), 체크시각 = 마지막으로 바꾼 때. 다시 체크하면 같은 줄을 고침. 구분 열은 나중에 붙인 열이라 예전 탭이면 자동으로 추가, 빈 칸은 숙박.
- **'시즌방주주'** 탭 `시즌|이름|연락처` — 운영진이 **시즌별로**(예 `26-27`) 적음, 주주는 시즌마다 다름.
- **출격 체크**(사용자 요구 2026-10-23, 페이지 이름도 SEASON ROOM → RIDE & STAY): 그날 스키장 가는 사람. 시즌방과 따로(숙박 없이 출격만 가능), 정산 없음. **'출격체크'** 탭 `날짜|이름|연락처|체크시각|구분(출격/취소)` — 시즌방 탭과 같은 규칙(회원·날짜당 한 줄, 취소도 남김). SHRED LOG의 '출격기록'(개인 기록)과는 다른 탭.
- `action:'seasonroom'` {token, season, op?: 'add'|'remove', date?, kind?: '숙박'|'휴식'|'출격'} → `{season, prices, nights: [{date, name, kind, me, owner}], rides: [{date, name, me}]}`(취소 제외). kind '출격'이면 출격체크 탭. 회원에게 **이름만**(연락처 X). 본인 줄만 바꿈, `LockService`. 연락처는 `normPhone`으로 비교(하이픈·띄어쓰기·앞 0 빠진 숫자 모두 같은 사람). 시즌 = 7/1~6/30.
- 화면(사용자 요구 2026-10-23): 넓은 화면은 **늘 한 달**(옆 명단 칸 높이가 3주 달력에 안 맞아서 — 보기 버튼 숨김). **860px 이하(모바일)만 기본 3주**(지난주·이번 주·다음 주) + '한 달 보기' 버튼(고른 보기는 `localStorage` `fs-room-view`에 기억, 창 폭이 바뀌면 그 규칙으로). ‹ ›는 3주면 한 주씩, 한 달이면 한 달씩. 달력 칸엔 **숫자만** '출격 N명'·'숙박 N명'(휴식 포함). 넓은 화면은 달력 **오른쪽**에 고른 날 칸(달력 높이만큼, 넘치면 안에서 스크롤 — `height: 0; min-height: 100%`), 860px 이하는 아래. 고른 날 칸: 출격 명단 + [출격]/[출격 취소], 시즌방 명단 + [시즌방 숙박][4시간 휴식] 또는 [다른 쪽으로 변경][취소](누른 버튼만 스피너). **명단엔 주주 표시 안 함**. 아래 '**N월 시즌방 사용 이력**'(고른 날의 달) 표: 이름·숙박·휴식·금액, **주주는 0원**(이름 옆 '· 주주'), 내 시즌 합계. 시즌은 화면에 보이는 날짜 기준으로 불러옴(3주가 7/1에 걸치면 두 시즌).
- 응답에 `rides`가 없으면(출격 기능 없는 예전 Apps Script) 출격 칸을 숨김 — 예전 서버는 kind '출격'을 숙박으로 저장해 버리므로. **Apps Script를 먼저 새 버전으로 배포한 뒤 사이트 배포.**
- 모바일에서 버튼 글씨가 가끔 안 보이던 문제: 터치 화면은 누른 뒤 `:hover`가 남아 검은 바탕 + 잠긴 버튼 회색 글씨가 됨 → `ride.css`에서 `.btn-ink`·`.btn-line-dark`의 hover는 `@media (hover: hover)` 안에만, `.btn-line-dark`는 글자색 직접 지정 + `:disabled` 스타일.

## THE SEASON = 소모임 정모 (`/` + `apps-script` somoim)

- 사용자 결정(2026-10-21): THE SEASON은 **소모임 모임 공개 페이지의 '정모 일정'**을 보여주고, 참석은 소모임에서 받음. 사이트의 참석/취소 UI는 쓰지 않음(아래 events·rsvp 서버 코드는 남아 있지만 현재 화면에서 호출 안 함).
- `action:'somoim'`: `UrlFetchApp`으로 스크립트 속성 `SOMOIM_URL`(=`club.somoimUrl`) 공개 페이지를 읽어 `parseSomoim` → `[{title, date, time, start, place, fee, count, cap}]`. **1시간 `CacheService` 캐시** → 소모임에는 시간당 1회만 접근. 참석자 얼굴·이름은 가져오지 않음.
- **이력 저장**(사용자 요구 2026-10-23, 나중에 소모임 없이 사이트에서 모임 만들기·참석/취소로 옮길 준비): 읽을 때마다(1시간에 한 번) `saveSomoim` → **'소모임정모'** 탭 `키(시작ISO|제목)|제목|시작|시간|장소|회비|인원|정원|처음본시각|마지막본시각`, 정모마다 한 줄, 다시 보면 인원·마지막본시각만 갱신, 지난 정모도 안 지움. 저장 실패해도 화면은 그대로. Worker 쪽은 `meetups`(source somoim/club) + `meetup_attendees`(자체 모임 참석, 아직 안 씀) 테이블 — `backend/migrations/0003_meetups.sql`, `src/somoim.ts`(한국 시간으로 계산, D1 `cache` 1시간).
- 파싱: '정모 일정' 이후 `<div class="flex space-x-3">` 단위로 나눔. 날짜는 정모 이미지 파일명의 `yyyymmddHHMM`(예 `…202611071300s1.png`), 없으면 화면의 `11/7(토) 오후 1:00`에서 연도 추정. 장소·회비는 `i_location`·`i_currency` 아이콘 다음 `<p>`, 인원은 끝의 `18 / 30`.
- 공식 API 아님 → 소모임이 페이지 구조를 바꾸면 빈 목록/오류 → 화면엔 '정모 일정을 불러오지 못했어요' + '소모임에서 전체 일정 보기 ↗' 링크. 고칠 땐 공개 페이지 HTML을 다시 보고 `parseSomoim`만 수정 + `Code.test.mjs` 7번 픽스처 갱신.
- 권한: `appsscript.json`에 `script.external_request` 추가(재승인 필요).

## (현재 미사용) 모임 참석 (`/` THE SEASON + `apps-script` events·rsvp)

- 모임은 시트 **'모임'** 탭(`ID | 시작일 | 종료일 | 장소 | 내용 | 태그 | 정원`, 없으면 자동 생성; 예전 `날짜` 열은 시작일로 읽음, 종료일 비우면 하루짜리)에서 관리. 운영진이 한 줄 추가하면 메인 THE SEASON에 표시(배포 불필요). ID 비우면 첫 조회 때 자동으로 채움(참석 기록과 잇는 키라 바꾸지 말 것). 정원 비우면 제한 없음. 종료일(없으면 시작일)이 오늘보다 이전이면 표시·신청 안 됨. 화면엔 시작일 + 아래 작게 '~ 종료일', 참석 탭 날짜는 '01.10 토 ~ 01.11 일'. 날짜는 날짜 셀 또는 `2026-12-13`.
- 참석 기록은 **'참석'** 탭(`모임ID | 날짜 | 장소 | 이름 | 연락처 | 상태(참석/취소) | 변경일시`). 회원·모임당 한 줄, 다시 신청하면 같은 줄의 상태만 바꿈.
- `action:'events'`(token 선택): 다가오는 모임 + 인원(`count`). **회원 토큰일 때만** `mine`과 참석자 이름 `names`(사용자 요구) — 비회원에겐 이름 안 보냄, 연락처는 누구에게도 안 보냄.
- `action:'rsvp'` {token, id, go}: 회원만(토큰 검증), `LockService` 잠금 안에서 정원 확인 → 정원 넘으면 '정원이 다 찼어요.' 응답은 갱신된 `events` 전체.
- 참석 인원 UI: 정원 바(남은 2자리 이하 '마감 임박' 주황, 다 차면 '마감'), 회원에겐 참석자 칩(이름 끝 두 글자 원 + 이름, 내 칩 주황 '(나)' 맨 앞, 12명 넘으면 +N), 비회원에겐 '참석자 명단은 회원에게만 보여요.' 행 스타일은 `.trip-list > li`(칩 `li`에 번지지 않게 자식 선택자 유지).
- 화면: 비회원 '로그인 후 참석'(`/login/?next=/#season` → 로그인 후 돌아옴; `next`는 base로 시작하는 사이트 내부 주소만 허용), 회원 '참석' / '참석 중 ✓ · 취소', 정원 차면 '마감'. 모임 목록은 캐시하지 않음(인원이 최신이어야 함). `src/data/club.ts`의 `trips`는 이제 `/cute`에서만 씀.

## 프로필 사진 (`/members` + `apps-script` avatar)

- 회원이 `/members`에서 사진을 고르면 브라우저가 가운데 정사각형 256px JPG(약 10~60KB)로 줄여 `action:'avatar'` {token, data}로 보냄. 삭제는 {token, remove:true}.
- **권한(scope)**: 사진 저장엔 `https://www.googleapis.com/auth/drive` 필요. 자동 감지가 예전 `drive.readonly`에 머물러 `createFile` 권한 오류가 났었음 → `apps-script/appsscript.json`에 `oauthScopes`를 직접 적어 둠(spreadsheets, drive, userinfo.email). 이 파일을 Apps Script 프로젝트 매니페스트에 그대로 넣고 `authorizeDrive` 실행으로 재승인. 명시하면 자동 감지가 꺼지므로 새 서비스(예: UrlFetchApp) 쓰면 여기에 scope 추가.
- 저장: 스크립트 속성 `AVATAR_FOLDER_ID` 드라이브 폴더(운영진 지정; 비우면 '프리스노우 프로필사진' 자동 생성 후 속성에 저장, 지정 폴더를 못 열면 오류 → 시트 작은 사진으로 대체). 파일은 '링크가 있는 사용자 보기'로 공유, 파일 이름에 번호 안 넣음(`avatar-xxxx.jpg`). 바꾸면 예전 사진은 휴지통.
- 누가 어떤 사진인지는 **'프로필'** 탭(`연락처 | 사진ID | 변경일시 | 사진데이터`) — 회원현황 탭은 안 건드림.
- **대체 저장**: 브라우저는 256px(드라이브용)과 96px(`small`, ≈4~8KB)을 같이 보냄. 드라이브에 파일 만들기가 실패하면(쓰기 권한 미승인 등) 96px를 '사진데이터' 칸에 `data:image/jpeg…`로 저장. 링크 공유(`setSharing`)만 실패하면 파일은 그대로 씀(폴더를 '링크가 있는 모든 사용자' 공유하면 보임). 드라이브가 다시 되면 다음 업로드부터 드라이브로, 사진데이터는 비움.
- 사진 값은 드라이브 id 또는 data URL → 화면은 `photoSrc(photo, w)`로 표시.
- `me`는 `photo`(파일 id)를, `events`는 회원에게 `people: [{name, photo}]`(예전 `names`도 같이)를 줌. 참석자 칩 동그라미에 사진(없으면 이름 끝 두 글자). 사진 주소는 `driveImg(id, w)`.
- 이미지 주소를 아는 사람은 사진을 볼 수 있음(드라이브 링크 공유 방식의 한계).

## 회원 로그인 (`/members` + `apps-script/`)

흐름:

```
브라우저 /members ──POST(text/plain JSON)──▶ Apps Script 웹앱 ──▶ 구글 시트 회원명부(비공개)
  {action:'login', phone, birth}            시트 읽어 비교 → HMAC 토큰 발급 (화면 표기: 아이디/비밀번호)
  {action:'me', token}                      토큰 검증 → 본인 정보만 응답
```

- 회원은 **구글 로그인 없음**. 화면에는 **아이디 / 비밀번호**로만 표기(사용자 요청: '전화번호', '생년월일', 형식 안내·placeholder를 비밀번호 칸에 노출하지 않음). 아이디 = 비상연락망에서 010 뺀 8자리(`normPhone`이 8자리면 010을 붙임), 비밀번호 = 생년월일 8자리. Apps Script는 "실행: 나 / 액세스: 모든 사용자"로 배포 → 운영진 권한으로 시트를 읽음.
- 시트 양식(머리글 이름으로 열을 찾음, 위에 제목 줄 허용, 탭 `회원명부` 없으면 첫 탭):
  `No | 구분 | 거주지 | 이름 | 성별 | 나이(=출생연도) | (생일)월 | (생일)일 | 비상연락망 | 비공개연락처`
- 생년월일 = `나이` + `(생일)월` 2자리 + `(생일)일` 2자리 (예 1996, 2, 12 → `19960212`). 값이 이상하면 로그인 불가.
- 전화번호 정규화(`normPhone`): 하이픈 제거, `+82 10…`(12자리 이상 `8210…`만 국가번호로 봄 — 아이디 `82xx…`를 국가번호로 오해하던 버그 수정), 시트가 앞 0을 지운 숫자(`1012345678`), 8자리 아이디 → `010` 붙임.
- 보안 규칙 — **바꿀 때 반드시 유지**:
  - 응답에 생년월일·나이·성별·비공개연락처 **절대 포함 금지** (`COL`에 없는 열은 읽지도 않음).
  - **다른 회원 정보(명단)는 어떤 형태로도 응답하지 않음** (사용자 결정, 2026-10-20). 응답은 `{ok, me:{name, grade, area, phone}}`뿐. 화면에서 숨기는 것으론 부족하므로 서버(Code.gs)에서 막음.
  - 실패 메시지는 번호/생일 중 무엇이 틀렸는지 구분하지 않음.
  - 번호당 5회 실패 → 1시간 잠금 (`CacheService`).
  - 토큰 = `base64(phone|exp).HMAC-SHA256`, 비밀키는 스크립트 속성 `TOKEN_SECRET`(코드·저장소에 넣지 않음). **항상 30일**(사용자 요구 2026-10-23: 최대한 안 풀리게 — '로그인 상태 유지' 체크박스 없앰). 사이트를 쓰는 동안 `session.ts`가 하루에 한 번 `action:'renew'` → 새 30일 토큰(`fs-member-renewed`에 마지막 연장 시각). 한 달 안에 한 번만 들어와도 유지. Safari는 7일 넘게 안 들어온 사이트의 `localStorage`를 지울 수 있어서 그런 경우엔 다시 로그인(홈 화면에 추가하면 예외). 시트에서 지운 회원은 즉시 차단.
  - 아이디(`fs-member-id`)는 늘 기억해 다음 로그인 때 채움. 비밀번호는 저장 안 함. 내 이름(`fs-member-name`)은 참석자 칩의 '(나)' 표시용일 뿐 권한 판단엔 안 씀.
  - 클라이언트는 시트 값을 `textContent`로만 렌더링(HTML 주입 방지). 토큰은 `localStorage`(try/catch).
  - Content-Type 헤더를 붙이지 않은 `fetch` POST(text/plain) → CORS 사전요청 없이 Apps Script 호출. 헤더 추가 금지.
- 저장소가 public이므로 API 키·비밀값·실제 회원 데이터를 코드에 넣지 말 것. 테스트는 가짜 데이터만.
- `club.membersApi`가 빈 문자열이면 `/login`, `/signup`은 "준비 중" 표시.

회원가입(`action:'signup'`):
- 같은 시트의 **'가입신청'** 탭(없으면 생성)에 `신청일시|이름|성별|나이|(생일)월|(생일)일|거주지|비상연락망|상태('대기')` 한 줄 추가. 회원명부에 바로 넣지 않음(신청자가 곧바로 로그인되면 안 됨) — 운영진이 확인 후 회원명부로 옮김.
- 회원명부 탭을 이름(`회원명부`)으로 못 찾을 때 대체 탭은 '가입신청'이 아닌 첫 탭.
- 서버 검증: 개인정보 동의(`agree === true`) 필수, 필드 형식, 이미 회원·이미 신청한 연락처 거부, 시간당 30건 상한, 숨은 칸(`website`) 채워지면 저장 없이 ok, `=+-@`로 시작하는 값은 `'` 붙여 수식 주입 방지, `LockService`로 동시 신청 중복 방지. 응답은 `{ok}`/`{ok:false,error}`뿐.
- 완료 화면에 로그인 방법(아이디·비밀번호 형식)은 안내하지 않음 — 운영진이 따로 안내.

가입 승인(`onEdit` 단순 트리거, 설치 불필요 — 저장된 최신 코드로 실행):
- '가입신청' 탭 머리글: `신청일시|이름|성별|나이|(생일)월|(생일)일|시도|거주지|비상연락망|상태`. 1행 머리글 이름으로 읽음(`applyTable`). **상태 열은 대기/승인 드롭다운** — 신청이 들어올 때마다 상태 열 2행~끝 전체에 다시 적용(`applyStatusDropdown`, 예전에 만든 탭도 자동으로 선택식이 됨).
- 상태를 `승인`으로 바꾸면 `approve()`가 회원 탭에 한 줄 끼워 넣음. 결과는 상태 칸 메모.
- 회원 탭: `MEMBER_SHEETS = ['회원현황', '회원명부']` 순서로 찾고, 없으면 '가입신청'이 아닌 첫 탭.
- **구분 = 신청한 시도**(예 `경기도`, `서울특별시`), 거주지 = 시군구에서 시·군 뗀 값(`normArea`: 의정부시→의정부, 노원구 그대로).
- **운영진·마스터(`FIXED_GRADES`) 행은 절대 건드리지 않음**(사용자 요구): 위치 탐색에서 제외, 그 블록 안/바로 아래 거주지 일치로 끼우지 않음, `renumber`도 그 블록 아래부터만 씀.
- **회원 줄 판단 = 구분 칸이 채워진 줄**(이름은 안 봄 — 사용자 요구, 이름 없이 구분·거주지만 채운 줄이 있어도 자리 찾기가 맞아야 함). `renumber`는 **No 칸에 `=ROW()-머리글행` 수식**을 넣음(사용자 요구: 행 번호 기준) — 운영진·마스터 블록 아래 구분 있는 줄에만, 운영진·마스터 No는 원래 값 유지.
- 위치 `insertAfter`(운영진·마스터 블록 아래 회원만 대상): 같은 시도+같은 거주지 마지막 줄 → **(경기) 같은 북부·남부 블록 마지막 줄**(`GYEONGGI_NORTH` 목록이면 북부, 김포 포함 — 동호회 기준) → 같은 시도 마지막 줄 → 마지막 회원 줄. `gyeonggiZone`: 구분이 경기북부/경기남부면 그대로, '경기도'면 거주지로 판단. 시도 비교는 `sidoKey`(서울특별시·서울 → 서울, 경기도·경기북부·경기남부 → 경기, 강원특별자치도·강원도 → 강원, 인천광역시·인천광역 → 인천, 충청·경상·전라는 남북 구분) — 시트에 예전 구분 이름(서울, 경기북부 …)이 남아 있어도 같은 블록으로 묶임.
- 이미 회원 탭에 있는 연락처는 추가하지 않음(승인↔대기 반복해도 중복 없음). 시도 칸이 빈 예전 신청 줄은 추가하지 않음.
- `Code.gs` 수정 후: `node apps-script/Code.test.mjs`로 검증(Apps Script 전역을 mock해서 vm으로 실행) → 사용자가 Apps Script에 다시 붙여넣고 "배포 관리 → 새 버전" 해야 반영됨.

## 작업 방식

- 변경 후 `npm run build`로 확인. UI 변경은 headless Chrome(`/Applications/Google Chrome.app`) 스크린샷이나 CDP 스크립트로 실제 화면·클릭 동작 확인. Chrome 헤드리스는 최소 창 폭이 있어 모바일은 375px iframe으로 확인.
- 개발 서버 주소는 `http://localhost:4321/`.
- 커밋/푸시는 사용자가 요청할 때만. 커밋 메시지 끝에 Co-Authored-By 줄.
- push 인증: `gh`는 `yunjeong-reco` 계정으로 로그인돼 있어 push 권한 없음. 사용자가 준 토큰은 명령 한 번에만 헤더로 넘김(`git -c http.https://github.com/.extraheader=…`) — 토큰을 git 설정·remote URL·파일·메모리에 저장하지 말 것. 조직 저장소에 쓰려면 토큰 권한에 `freesnow-kr` 조직이 들어가 있어야 함.
- 다른 사이트(Kizupi, Burton 등)를 참고할 때 코드·이미지·문구를 복사하지 않고 디자인 방향만 참고해 새로 작성.

## 백엔드 이전 (Cloudflare Workers + D1, 진행 중)

- 문서는 `docs/migration/`. 1차 분석 `01-analysis.md`(2026-10-23) — 기능·API·시트 구조, 보안 위험, D1 초안, 단계 계획, 사용자 확인이 필요한 항목.
- 설계 `02-design.md`(2026-10-23) — 사용자 결정: workers.dev(`https://api.freesnow.workers.dev`, 계정 `yunj213@gmail.com`, 하위 도메인 `freesnow`, Worker 이름 `api`), 최고관리자 = 마스터, 탈퇴 회원 기록은 그대로, 비밀번호 초기화는 공용 초기화 비밀번호(Worker Secret, 초기화 대기 72시간 동안 그 회원에게만 통함).
- 코드는 **같은 저장소 `backend/`**(사용자 결정). 의존성은 `wrangler` 하나(사이트 쪽 `package.json`과 별개), 프레임워크 없음. `src/index.ts`(라우팅·CORS·body 600KB 제한·오류), `src/auth.ts`(로그인·세션·비밀번호·권한·초기화), `src/lib.ts`(normPhone — Apps Script와 같은 규칙, PBKDF2·HMAC), `migrations/0001_init.sql`.
  - 테스트 `cd backend && npm test` = `node --test`(Node가 TS를 바로 실행) + wrangler `getPlatformProxy`의 진짜 로컬 D1, 가짜 회원만. 로컬 서버 `npm run db:local` 후 `npm run dev`(http://localhost:8787, 비밀값은 `.dev.vars` — 양식 `.dev.vars.example`).
  - 인증 규칙: 비밀번호 없는 회원(첫 전환)은 생년월일로 한 번 → `mustChange` 세션은 `password`·`logout`만 됨. 초기화(마스터만) = 해시 삭제 + 그 회원 세션 전부 폐기 + 72시간 동안 공용 `RESET_PASSWORD`만 통함. 실패 문구 하나, 아이디 5회·IP 30회/1시간 잠금(`login_logs`로 셈). 세션 토큰은 SHA-256만 저장, 로그인 이력엔 비밀번호·토큰·전화·IP 원문 없음.
  - 옮긴 action(응답 모양 Apps Script와 같음, 테스트가 `Code.test.mjs`와 같은 경우): `seasonroom`(+출격 `ride_checks`, `0002`), `shredlog`(메모 앞 `'` 안 붙임 — 시트로 내보낼 때 막을 것), `snowlive`(저장된 기록이 캐시 역할), `somoim`(+`meetups` 이력, `0003`). 세션 30일, 하루 넘게 지났으면 쓸 때마다 다시 30일(`need()`), `renew`는 토큰 그대로.
  - 화면: `session.ts` `call()`은 `club.api`만 부름. 로그인 응답 `mustChange`면 `/password/?first`로, 다른 action이 `mustChange`면 `call()`이 비밀번호 화면으로 보내고 응답을 돌려주지 않음(페이지 alert 방지). 로그아웃은 `logout()`(서버 세션도 끝냄).
  - 시즌방 Worker 다른 점: 이름은 저장 당시 값이 아니라 지금 회원 이름, 연락처 대신 회원 ID로 연결. 시트 이전 때 할 일: 구분 빈 칸 → 숙박, 연락처는 `normPhone`으로 회원 찾기(하이픈·띄어쓰기·앞 0 빠짐), 같은 회원·날짜가 여러 줄이면 마지막 체크시각 것.
  - 테스트 공통 `test/setup.ts`: `useDb(회원, seed)`, `post`, `sessionFor(회원ID)`(로그인 없이 세션).
  - PBKDF2 10만 회: 로컬 workerd ≈ 6ms(무료 CPU 10ms) → 실제 Cloudflare에서 다시 잴 것.
- 사용자 원칙: 분석·설계를 먼저 보고하고 실제 변경은 따로 지시받아서. 기존 사이트·Apps Script·시트는 검증 전까지 건드리지 않음.

## 남은 일 / 주의

- 회원명부 테스트 시트가 "링크가 있는 모든 사용자"로 공개돼 있었음(테스트 데이터라고 함). 실제 데이터 넣기 전 "제한됨"으로 바꾸도록 안내.
- `trips`, `faqs`는 예시 내용. 실제 정모 일정 받으면 교체.
- 메인 영상에 배경음악이 있으면 저작권 확인 필요(소리 버튼으로 재생 가능한 상태).
- 대화에 노출된 GitHub PAT 폐기 권장(사용자에게 안내함).

---

## Astro 개발 참고

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Full documentation: https://docs.astro.build

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Adding styles](https://docs.astro.build/en/guides/styling/)
