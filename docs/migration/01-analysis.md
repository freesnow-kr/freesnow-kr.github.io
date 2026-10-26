# 백엔드 이전 1차 분석 — Apps Script → Cloudflare Workers + D1

- 작성: 2026-10-23 (Phase 1, 분석만 — 코드, 데이터, 배포 변경 없음)
- 범위: 저장소 전체 + 로컬 `apps-script/Code.gs`(1078줄, 저장소엔 없음) 직접 읽음. `node apps-script/Code.test.mjs` 통과, `npm run build` 10페이지 성공.
- **확인 못 함**: 실제 구글 시트 데이터, Apps Script 편집기에 배포된 코드가 로컬 `Code.gs`와 같은지, 스크립트 속성 값, 드라이브 폴더 권한, Cloudflare 최신 무료 플랜 한도.

표시: 【확인】 코드 직접 확인, 실행 | 【문서】 AGENTS.md/테스트에서만 | 【미확인】 | 【제안】 새 설계

---

## 1. 전체 구조 【확인】

```
브라우저 ── GitHub Pages (Astro 정적, freesnow-kr.github.io)
   │  fetch POST text/plain JSON {action, token, ...}   ← CORS 사전요청 회피
   ▼
Google Apps Script 웹앱 (단일 doPost, 실행: 소유자 / 접근: 익명 포함 모두)
   ├─ SpreadsheetApp: 한 스프레드시트의 여러 탭 = DB
   ├─ DriveApp: 갤러리 / 프로필사진 / 채팅 CSV 폴더
   ├─ CacheService: 로그인 실패 횟수, 응답 캐시
   ├─ LockService: 쓰기 직렬화 (스크립트 전체 잠금 1개)
   └─ UrlFetchApp: 소모임 공개 페이지, 스노우라이브 비공식 API
```

## 2. 저장소 구조 【확인】

| 구분 | 파일 |
|---|---|
| 설정 | `package.json`(의존성 `astro ^7.4.1` 하나), `astro.config.mjs`(`site`, `/ride→/` 리다이렉트, base 없음), `tsconfig.json`, `.env.example`(PUBLIC_* 3개) |
| 배포 | `.github/workflows/deploy.yml`: main push → Secrets 검사 → withastro/action(Node 24) → deploy-pages |
| 페이지 | `src/pages/`: index, gallery, webcam, login, signup, members, rank, shredlog, seasonroom, cute |
| 공통 | `src/scripts/session.ts`(토큰 `store`, API `call`, `busy`, 헤더/메뉴), `src/components/Meta.astro`(OG), `src/data/club.ts`(링크는 env, `trips`/`faqs`), `src/data/regions.json` |
| 스타일 | `src/styles/ride.css`(전역). `cute.astro`만 자체 전역 스타일 |
| 서버 | `apps-script/Code.gs`(**gitignore, 로컬에만**), `Code.test.mjs`(vm 목업 테스트), `appsscript.json`(scope 4개, `USER_DEPLOYING`/`ANYONE_ANONYMOUS`) |
| 도구 | `scripts/make-hero.swift`, `scripts/make-regions.mjs` |

프론트엔드 테스트는 없음. 백엔드 테스트는 `Code.test.mjs` 하나.

## 3. 기능 목록 【확인】

| 기능 | 사용 | 프론트 | action | 데이터 | 인증 | 쓰기 | 이전 난이도 |
|---|---|---|---|---|---|---|---|
| 메인/소모임 정모 | 사용 | index | `somoim` | 소모임 HTML 스크래핑, 캐시 1h | 없음 | ✕ | 낮음 |
| 회원가입 신청 | 사용 | signup | `signup` | 가입신청 탭 | 없음(허니팟, 전체 시간당 30건) | ○ | 낮음 |
| 가입 승인 | 사용 | (시트) | `onEdit` 트리거 | 가입신청 → 회원현황 줄 삽입, No 수식 | 시트 편집 권한 | ○ | **높음**(배치 규칙 복잡, 관리자 화면으로 대체) |
| 로그인/로그아웃 | 사용 | login, 헤더 | `login` | 회원현황 | 전화+생일 | ✕(캐시만) | 중간 |
| 내 정보 | 사용 | members | `me` | 회원현황, 프로필 | 토큰 | ✕ | 낮음 |
| 프로필 사진 | 사용 | members | `avatar` | 드라이브 폴더 + 프로필 탭 | 토큰 | ○ | **높음**(드라이브 쓰기) |
| 갤러리 | 사용 | gallery, index | `gallery` | 드라이브 폴더 목록, 캐시 5m | 없음 | ✕ | 중간 |
| 채팅 랭킹 | 사용 | rank | `chatrank` | 드라이브 CSV, 캐시 6h 분할 | 토큰 | ✕ | 중간(CSV 파싱 CPU) |
| 출격/지출/시즌권 | 사용 | shredlog | `shredlog` | 출격기록/지출기록/시즌권 탭 | 토큰(비회원은 브라우저 저장) | ○ | 낮음 |
| 스노우라이브 | 사용 | shredlog | `snowlive` | 스노우라이브기록 탭 + 외부 API | 토큰 | ○ | 낮음 |
| 시즌방 | 사용 | seasonroom | `seasonroom` | 시즌방, 시즌방주주 탭 | 토큰 | ○ | 낮음 |
| 자체 모임/참석 | **미사용**(화면에서 호출 안 함) | — | `events`, `rsvp` | 모임, 참석 탭 | 토큰 선택 | ○ | 낮음 |
| 웹캠 | 사용 | webcam | — | 정적 iframe/링크 | 없음 | ✕ | 해당 없음 |
| /cute | 사용 | cute | — | `club.ts` trips, faqs | 없음 | ✕ | 해당 없음 |

**없는 기능(신규 개발)**: 관리자 페이지, 권한 체계, 로그인 이력, 감사 로그, 비밀번호 재설정, 회의/안건/업무, 공지/게시판, 회비.

## 4. API 목록 【확인】

공통: `POST` 하나, body `{action,...}`. 응답 `{ok:true,...}` 또는 `{ok:false,error,expired?}`, 예외도 JSON으로 감쌈. 출처(Origin) 제한, 요청 크기 제한, 요청 횟수 제한(로그인, 가입 제외) 없음.

| action | 주요 파라미터 | 응답 | 동시성/중복 | 캐시 |
|---|---|---|---|---|
| login | phone, birth, keep | token, name, exp | — | 실패 횟수 `fail:전화`, 5회 1h 잠금 |
| me | token | me{name, grade, area, phone, photo} | — | — |
| signup | name, gender, year, month, day, sido, sigungu, phone, agree, website | ok | 스크립트 잠금, 같은 연락처 거부 | `signups` 카운터 |
| avatar | token, data, small / remove | photo | 잠금, 회원당 1줄 | — |
| gallery | — | photos[{id, caption}] | — | 5m |
| chatrank | token | from, to, total, ranks, months[] | — | 파일 10m, 결과 6h |
| shredlog | token, op?, visits, expenses, pass, visit, expense | visits, expenses, pass | 잠금, 클라이언트 ID로 중복 무시, 회원당 3000줄 | — |
| snowlive | token, season, op?(link/unlink/refresh), id | id, stats | 잠금 **없음**(시트 쓰기 있음) | 1h + 시트 |
| seasonroom | token, season, op?, date, kind | season, prices, nights[{date, name, kind, me, owner}] | 잠금, 회원, 날짜당 1줄 | — |
| somoim | — | url, meetups[] | — | 1h |
| events | token? | member, events[] | 읽을 때 빈 ID를 시트에 **씀** | — |
| rsvp | token, id, go | events와 같음 | 잠금 안에서 정원 확인 | — |

## 5. 구글 시트 구조

열 구성은 【확인】(코드의 머리글 정의). 실제 시트 내용, 건수는 【미확인】.

| 탭 | 열 | 개인정보 | 식별 키 | D1 이전 시 변환 |
|---|---|---|---|---|
| 회원현황(또는 회원명부) | No(수식) / 구분 / 거주지 / 이름 / 성별 / 나이(출생연도) / (생일)월 / (생일)일 / 비상연락망 / 비공개연락처【문서】 | **높음** | 전화 | 내부 ID 부여, 생일 3칸 → date, 운영진/마스터는 구분 칸 |
| 가입신청 | 신청일시 / 이름 / 성별 / 나이 / 월 / 일 / 시도 / 거주지 / 비상연락망 / 상태(대기/승인) | 높음 | 전화 | 상태 + 승인 결과 메모 |
| 프로필 | 연락처 / 사진ID / 변경일시 / 사진데이터(data URL) | 중간 | 전화 | 드라이브 ID 그대로 |
| 출격기록 | 연락처 / ID / 날짜 / 스키장 / 시간대 / 설질 / 스타일 / 날씨 / 동행 / 기온 / 런수 / 라이딩시간 / 만족도 / 세팅 / 메모 / 기록일시 | 낮음 | 전화 + 클라이언트 ID | 시트가 날짜를 Date로 바꿈 → `ymd` 규칙 |
| 지출기록 | 연락처 / ID / 날짜 / 분류 / 금액 / 메모 / 출격ID / 기록일시 | 낮음 | 전화 + ID | 금액 정수 |
| 시즌권 | 연락처 / 시즌 / 시즌권가격 / 일일권가격 / 변경일시 | 낮음 | 전화 + 시즌(1줄) | UNIQUE(member, season) |
| 스노우라이브기록 | 연락처 / 스노우라이브ID / 시즌 / 데이터(JSON) / 가져온시각 | 중간(외부 프로필명) | 전화 + 시즌 | 시즌 빈 줄 = 연결만 한 상태 |
| 시즌방 | 날짜 / 이름 / 연락처 / 체크시각 / 구분(숙박/휴식/취소, 빈 칸=숙박) | 중간 | 전화 + 날짜(1줄) | 이름은 저장 당시 값 → member_id로 연결 |
| 시즌방주주 | 시즌 / 이름 / 연락처 | 중간 | 시즌 + 전화 | 운영진 수기 입력 |
| 모임 / 참석 | ID / 시작일 / 종료일 / 장소 / 내용 / 태그 / 정원 | 모임ID / 날짜 / 장소 / 이름 / 연락처 / 상태 / 변경일시 | 중간 | — | 미사용 기능 |

데이터 위험 【확인】:
- 모든 탭이 **전화번호**로 연결됨(`normPhone`: 하이픈, 앞 0 빠짐, +82, 8자리 아이디 통일). 번호를 바꾸면 기록이 모두 끊김.
- 시트를 손으로 고칠 수 있어 중복 줄이 생길 수 있음. 코드는 처음 찾은 줄만 씀.
- **로그인 이력 탭 없음**(실패 횟수만 캐시에 1시간). 이전할 과거 로그인 기록도 없음.

## 6. 구글 드라이브 연동 【확인】

- 갤러리: 폴더 목록 → `lh3.googleusercontent.com/d/{id}`(비공식 주소). 폴더가 '링크가 있는 모든 사용자' 공유여야 보임.
- 프로필 사진: 소유자 드라이브 폴더에 `createFile`, 파일마다 `ANYONE_WITH_LINK`. 실패하면 96px를 시트 칸에.
- 채팅 CSV: 비공개 폴더의 가장 최근 `.csv`.
- **Workers 이전 위험 【제안/미확인】**: 서비스 계정은 개인 드라이브(My Drive) 저장 공간이 없어 업로드가 실패할 가능성이 높음(공유 드라이브는 Workspace 전용). 대안: 소유자 OAuth 리프레시 토큰을 Workers Secret에, 또는 **드라이브 작업만 Apps Script에 남기고 Worker가 서버끼리 호출**(추천 — 사진 URL, 파일 ID 그대로).

## 7. 로그인, 인증 【확인】

- 아이디 = 전화번호(010 뺀 8자리 허용), 비밀번호 = **생년월일 8자리**.
- 토큰 = `base64(phone|exp).HMAC-SHA256(TOKEN_SECRET)`, 서버 저장 없음, 12h / '로그인 상태 유지' 30일. `localStorage` `fs-member-token`.
- 요청마다 `readMembers()`가 회원 탭 전체를 읽음 → 시트에서 지우면 즉시 차단.

문제점:
1. 비밀번호가 생년월일 — 회원, 지인은 알 수 있고 가능한 값도 몇만 개. 잠금은 번호별 5회/1h뿐, IP, 전체 기준 제한 없음.
2. 회원 여부 노출: 로그인 문구는 구분 안 하지만 **가입 신청이 '이미 신청했거나 가입된 연락처'라고 알려 줌**.
3. 서버 세션 없음 → 로그아웃해도 토큰은 만료 전까지 유효. 강제 종료는 `TOKEN_SECRET` 교체(전원 로그아웃)뿐.
4. 토큰이 `localStorage` → XSS 시 탈취 가능(현재 코드는 `textContent` 원칙 지킴).
5. HMAC 비교가 상수 시간 아님(위험 작음).
6. **관리자 권한 체계 없음**. 구분 칸에 운영진/마스터가 있지만 서버 권한 판단엔 안 씀. 지금은 '운영 = 시트 편집 권한'.

## 8. 개인정보, 보안 위험

| # | 위험 | 상태 |
|---|---|---|
| 1 | 공개 저장소 git 기록에 예전 `Code.gs`가 남아 있음: 드라이브 폴더 ID 3개, 소모임 URL, 스노우라이브 API, Apps Script URL. `TOKEN_SECRET` 같은 비밀값은 없음 | 【확인】 |
| 2 | 실행 계정 = 소유자, scope = `drive` 전체 → 버그 시 소유자 드라이브 전체 영향 가능 | 【확인】 |
| 3 | 프로필 사진, 갤러리는 링크를 아는 누구나 볼 수 있음 | 【확인】 |
| 4 | 회원 탭을 '링크가 있는 모든 사용자'로 공개했던 적 있음, 현재 상태 모름 | 【문서】/【미확인】 |
| 5 | 스노우라이브 API 인증 없음 → 남의 ID 연결을 막을 수 없음 | 【확인】 |
| 6 | 가입 신청 전체 시간당 30건 → 스팸이 몰리면 정상 신청도 막힘 | 【확인】 |
| 7 | 응답에서 생일, 성별, 비공개연락처 제외, 다른 회원 번호 안 보냄(시즌방, 참석은 이름만) | 【확인】 지켜지고 있음 |
| 8 | 수식 주입은 `clean()`으로 막음. 시즌방 이름은 시트 값을 다시 씀 | 【확인】 |
| 9 | 쓰기는 스크립트 잠금 하나로 직렬화(10초 대기, 넘으면 '서버 오류'). `snowlive` 쓰기엔 잠금 없음 | 【확인】 |

## 9. 관리자 시스템 — 지금 있는 기반

- 권한 근거로 쓸 수 있는 데이터: 회원 탭 `구분`(운영진/마스터) → D1 `members.role`.
- 화면으로 옮길 운영 업무: 가입 승인(시트 드롭다운), 회원 정보 수정(시트 편집), 시즌방 주주 입력, 모임 탭, 사진, CSV 업로드(드라이브).
- 기존 데이터가 전혀 없는 것: 로그인 이력, 감사 로그, 회의, 업무, 회비, 공지, 게시판 → 새로 설계.

## 10. Workers 구조 초안 【제안】

```
backend/  (별도 package.json, wrangler — 기존 Astro 빌드와 무관)
  src/index.ts        라우터 — POST /api 하나로 기존 {action} 계약 유지 + /admin/* 새 경로
  src/auth.ts         세션, 비밀번호, 권한 검사
  src/actions/*.ts    기존 action 1:1 (shredlog, seasonroom, …)
  src/admin/*.ts
  src/drive.ts        Apps Script 드라이브 어댑터 호출 (공유 비밀키 헤더)
  migrations/0001_*.sql
  test/               vitest + miniflare(로컬 D1)
```

결정할 것:
- **쿠키 vs 토큰**: `github.io`와 `workers.dev`는 다른 사이트이고 `github.io`는 Public Suffix List에 있음 → 쿠키가 제3자 쿠키가 되어 Safari, Chrome 제한으로 HttpOnly 쿠키 인증이 안정적으로 안 됨.
  - A안: 커스텀 도메인(예 `freesnow.kr` + `api.freesnow.kr`) → 같은 사이트 → `HttpOnly; Secure; SameSite=Lax` 쿠키 + Origin 검사 + CSRF 토큰. 도메인 비용(연 1~2만 원대, 확인 필요).
  - B안: 도메인 없이 불투명 세션 ID를 Bearer 헤더로, D1에서 서버가 관리(폐기, 만료 가능). 브라우저 저장은 지금처럼, CORS는 `https://freesnow-kr.github.io`만.
  - 추천: **B안으로 시작, 도메인 생기면 A안**.
- **비밀번호 해시**: Workers WebCrypto PBKDF2-SHA256 + 사용자별 salt. 무료 플랜 CPU 제한(요청당 약 10ms로 기억)과 PBKDF2 반복 상한(약 10만 회로 기억)은 **공식 문서 확인 필요**. Argon2(wasm)는 무료 CPU 한도 초과 위험.
- **무료 플랜**: 회원 200명이면 Workers, D1 한도 안일 것으로 **추정**(수치 【미확인】). 채팅 CSV 파싱은 CPU가 커서 Apps Script에서 미리 계산하거나 결과를 D1에 저장해야 함.

## 11. D1 테이블 초안 【제안】(실제 데이터 확인 후 확정)

- `members` (id TEXT PK, name, gender, birth_date, sido, area, phone UNIQUE, role CHECK(member/staff/admin), status CHECK(active/suspended/withdrawn), joined_at, approved_at)
- `member_credentials` (member_id PK, hash, salt, iter, must_reset, updated_at)
- `member_sessions` (id_hash PK, member_id, created_at, expires_at, revoked_at, ua)
- `password_reset_tokens` (token_hash PK, member_id, created_by, expires_at, used_at)
- `login_audit_logs` (id, at, member_id NULL, id_hmac, ok, reason, ip_masked, ua) — 90일 보관, Cron 삭제
- `admin_audit_logs` (id, at, actor_id, action, target_type, target_id, before_json, after_json)
- `signup_requests`, `member_profiles`(photo_drive_id, photo_small)
- `ride_logs`(id PK = 클라이언트 ID, member_id, …), `expense_logs`, `season_passes` UNIQUE(member_id, season), `snowlive_records` UNIQUE(member_id, season)
- `seasonroom_records` (member_id, date, kind CHECK(숙박/휴식/취소), updated_at, **UNIQUE(member_id, date)**) — 지금 규칙(취소한 줄 유지, 같은 줄 다시 씀)과 같음, UPSERT 한 문장
- `seasonroom_owners` UNIQUE(season, member_id)
- 회의, 업무, 공지, 게시판, 회비, 방 예약은 Phase 7에서 설계. 방 정원 예약을 도입하면 `INSERT … SELECT … WHERE (SELECT count(*) …) < cap` 조건부 INSERT 한 문장 + UNIQUE 검토(D1은 문장 단위 원자적).

날짜 규칙: 날짜 `YYYY-MM-DD` KST 문자열, 시각 UTC ISO. 시즌 기준이 기능마다 다름(SHRED LOG, 시즌방 7/1~6/30, 스노우라이브 10/1~3/31).

## 12. 파일 분류

| 분류 | 파일 |
|---|---|
| 그대로 유지 | 모든 페이지 디자인, 마크업, `ride.css`, `Meta.astro`, `club.ts`(trips/faqs), `regions.json`, webcam/cute/gallery 화면, `deploy.yml` 구조, `Code.gs`(삭제하지 않고 보관) |
| 변경 필요(이전 시) | `src/scripts/session.ts`(`call` 대상을 기능별로 바꾸는 스위치, 세션 헤더), `login.astro`(비밀번호 체계), `members.astro`(비밀번호 변경), `.env.example`, `deploy.yml`(새 env), `AGENTS.md`/`README.md` |
| 새로 만들 것 | `backend/**`, `src/pages/admin/**`, `src/pages/reset/`(재설정 화면), Apps Script 드라이브 어댑터 action(서버 간 비밀키 확인) |
| 백업할 데이터 | 스프레드시트 전체(사본 + 탭별 CSV, **저장소 밖**), Apps Script 코드, 배포 버전 번호, 스크립트 속성 키 목록(값 제외), 드라이브 3개 폴더 파일 목록(ID/이름/생성일) |
| 먼저 확인할 것 | 실제 시트 탭, 열, 건수, 중복, 배포된 Apps Script 버전 = 로컬 `Code.gs`인지, 시트, 폴더 공유 상태, 커스텀 도메인 여부, 회원 탭 실제 열(비공개연락처 등) |

## 13. 백업, 이전 전략 【제안】

1. 시트는 "사본 만들기"로 원본을 그대로 두고, 이전 스크립트는 **사본에서만 읽음**.
2. 기능별로 데이터 주인은 하나: 전환 전 시트 → 전환 때 시트 읽기 전용으로 잠그고 최종 이전 → 전환 후 D1. 양쪽에 같이 쓰는 기간 없음.
3. 검증: 탭별, 회원별 건수, 금액 합계, 날짜 최소/최대 비교 + `normPhone` → member_id 연결 안 되는 줄 0개.
4. 롤백: 프론트 기능별 스위치를 Apps Script로 되돌림 + 전환 후 D1에 쓰인 데이터를 시트로 되돌리는 스크립트 준비.

## 14. 단계별 계획 【제안】

| 순서 | 내용 | 롤백 조건 |
|---|---|---|
| P2 | 설계서 확정(도메인 A/B안, 탈퇴 정책, 권한 표) | — |
| P3 | `backend/`, 로컬 D1, 가짜 데이터, CI 테스트(배포 안 함) | — |
| P4 | 인증: 첫 로그인 때 생일로 확인 → **새 비밀번호 강제 설정**, 세션, 로그인 이력, 잠금 | 로그인 실패율 오르면 Apps Script 로그인으로 |
| P5 | 관리자: 회원명부, 승인, 정지, 재설정 링크 발급, 이력, 감사 로그 | 시트 운영 병행 가능 |
| P6 | 이전 순서: 시즌방 → SHRED LOG/시즌권 → 스노우라이브 → 프로필(드라이브 어댑터) → 갤러리/채팅 랭킹 → 모임 | 기능별 스위치 |
| P7 | 회의, 업무, 공지, 회비, 게시판 | — |
| P8~9 | 통합 테스트(권한 우회, 개인정보 노출, 동시성), 기능별 운영 전환 | — |

가장 위험한 지점은 회원 데이터 주인을 D1으로 옮기는 P4~P5. 그전까지 회원현황 시트를 원본으로 두고 D1엔 읽기 전용 동기화 추천.

## 15. 사용자 확인 필요

1. 커스텀 도메인 사용 가능 여부 — 쿠키 방식 가능 여부가 이걸로 정해짐
2. 실제 시트 확인 방법(탭별 머리글, 건수, 또는 개인정보 가린 사본)
3. 탈퇴 시 개인정보와 활동 기록(출격, 시즌방 정산) 처리
4. 최고관리자 = 마스터인지, 운영진, 마스터 권한 구분
5. 비밀번호 재설정 링크 전달 시 본인 확인 방법(카톡 직접 전달이면 되는지)
6. 시즌방 운영 규칙 변경 여부(정원, 방 구분)
7. git 기록의 폴더 ID, URL: 그대로 둘지, 폴더 공유 점검 / Apps Script 새 URL 재배포할지 (기록 재작성은 비추천)
8. Cloudflare 계정 소유자(조직에 넘길 수 있게)
