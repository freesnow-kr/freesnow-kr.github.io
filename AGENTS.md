# Free Snow — AI 작업 가이드

스키·스노우보드 동호회 사이트. 이 문서는 AI가 프로젝트 흐름과 결정 이유를 빠르게 파악하기 위한 것. 사람용 요약은 `README.md`.

## 한눈에

- **스택**: Astro 7 정적 사이트 (프레임워크·CSS 라이브러리 없음, 의존성 `astro` 하나). Node ≥ 22.22 (로컬 24).
- **호스팅**: GitHub Pages, 저장소 `yunj8649/free-snow` (public), `main` push → `.github/workflows/deploy.yml` (withastro/action, `node-version: 24`).
- **주소**: `https://yunj8649.github.io/free-snow/` — `astro.config.mjs`의 `base: '/free-snow'`.
- **사용자**: 한국어 사용. 화면 문구는 한국어 존댓말(해요체), 디자인 문구는 영문 대문자.

## 라우트와 파일

| 라우트 | 파일 | 스타일 |
|---|---|---|
| `/` | `src/pages/index.astro` | 에디토리얼(Burton 느낌): 영상 히어로, 티커, THE SEASON, SKI/SNOWBOARD, FAQ |
| `/webcam/` | `src/pages/webcam.astro` | 같은 에디토리얼 스타일 |
| `/login/` | `src/pages/login.astro` | 로그인 폼 + 회원가입 버튼. 이미 로그인 상태면 `/members`로 |
| `/signup/` | `src/pages/signup.astro` | 회원가입 신청 폼 (개인정보 동의 필수) |
| `/members/` | `src/pages/members.astro` | 회원 전용, **본인 정보만**. 토큰 없거나 만료면 `/login`(`?expired`)으로 |
| `/cute/` | `src/pages/cute.astro` | 픽셀아트(Kizupi 느낌), 자체 `<style is:global>` |
| `/ride/` | `astro.config.mjs` `redirects` | 예전 공개 주소 → `/free-snow/` |

- `src/styles/ride.css`: `/`, `/webcam`, `/members` 공통 전역 CSS (토큰, 고정 헤더, 버튼, 푸터). 각 페이지는 `import '../styles/ride.css'` + 페이지 전용 `<style>`.
- `src/data/regions.json`: 가입 거주지 선택 목록(시도 → 시군구). `node scripts/make-regions.mjs data/list_20260630.csv`로 법정동 CSV에서 생성(원본 CSV는 `data/`, gitignore). 시도는 서울·경기 먼저 그다음 가나다, 시군구는 가나다, 시 아래 일반구(수원시장안구 등) 제외.
- `src/data/club.ts`: **공통 데이터** — `club.joinUrl`(카카오 오픈채팅), `club.membersApi`(Apps Script URL), `trips`(시즌 일정), `faqs`. 여러 페이지가 import하므로 문구·링크는 여기서 수정.
- 헤더/푸터 마크업은 페이지마다 복사돼 있음. 메뉴 항목을 바꾸면 `index`, `webcam`, `members` 세 곳 모두 수정.
- `src/scripts/session.ts`: 에디토리얼 페이지 공통 클라이언트 모듈. 헤더 스크롤 배경(`.is-solid`), 로그인 상태면 헤더 버튼 LOGIN→LOGOUT, 토큰 저장(`store`), Apps Script 호출(`call`). 각 페이지 `<script>`에서 import.
- `ride.css`의 `[hidden] { display: none !important }` — display를 지정한 요소에 `hidden`을 써도 숨겨지게(빠뜨리면 폼/완료 화면이 같이 보이는 버그).
- 헤더 오른쪽 버튼(`.nav-join`)은 **LOGIN** → `/login/` (로그인 상태면 LOGOUT). MEMBERS 메뉴 → `/members/`. 오픈채팅(`club.joinUrl`)은 메인 히어로 `KAKAO OPEN CHAT` 버튼, 로그인 화면의 가입 문의 버튼, 푸터 링크로 연결.

## 경로 규칙 (중요)

- 내부 링크·에셋은 항상 `` `${import.meta.env.BASE_URL}/...` `` (`const base = import.meta.env.BASE_URL`). `BASE_URL`은 끝 슬래시 없는 `/free-snow`.
- `redirects` 대상에는 base가 자동으로 안 붙음 → 직접 `/free-snow/...`로 작성.
- base를 없애면 `${base}/` 패턴이 `//`가 되어 깨짐. 커스텀 도메인 연결 전까지 base 유지.

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
  - 토큰 = `base64(phone|exp).HMAC-SHA256`, 비밀키는 스크립트 속성 `TOKEN_SECRET`(코드·저장소에 넣지 않음), 12시간 유효. 시트에서 지운 회원은 즉시 차단.
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
- 개발 서버 주소는 `http://localhost:4321/free-snow/`(base 포함).
- 커밋/푸시는 사용자가 요청할 때만. 커밋 메시지 끝에 Co-Authored-By 줄.
- push 인증: `gh`는 `yunjeong-reco` 계정으로 로그인돼 있어 `yunj8649/free-snow`에 push 권한 없음. 사용자가 yunj8649로 `gh auth login` 하거나 직접 push. 토큰을 git 설정·remote URL·파일에 저장하지 말 것.
- 다른 사이트(Kizupi, Burton 등)를 참고할 때 코드·이미지·문구를 복사하지 않고 디자인 방향만 참고해 새로 작성.

## 남은 일 / 주의

- `club.membersApi` 비어 있음 — 사용자가 Apps Script 배포 후 URL 전달 예정.
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
