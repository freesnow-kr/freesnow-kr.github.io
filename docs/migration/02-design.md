# 백엔드 이전 2차 — 설계 (Phase 2)

- 작성: 2026-10-23. 설계만 — 코드, 데이터, 배포 변경 없음. 바탕: [`01-analysis.md`](01-analysis.md)
- 표시: 【확인】 공식 문서, 코드로 확인 | 【제안】 설계 | 【측정 필요】 Phase 3에서 실제로 재야 함

## 0. 사용자 결정 (2026-10-23)

| 항목 | 결정 |
|---|---|
| 도메인 | 우선 **workers.dev** — `https://api.freesnow.workers.dev` (계정 하위 도메인 `freesnow` 지정 완료, Worker 이름 `api`). 커스텀 도메인은 나중에 |
| 최고관리자 | **마스터** (회원 탭 구분 = 마스터) |
| 탈퇴 회원 기록 | **그대로 둠** (일단) — 상태만 탈퇴, 출격, 시즌방 기록 삭제 안 함 |
| 비밀번호 초기화 | **공용 초기화 비밀번호 하나**를 정해 두고 사용 (§3-3) |

## 1. 구조 【제안】

```
브라우저 (GitHub Pages, 그대로)
   │  POST https://api.freesnow.workers.dev   {action, ...}  + Authorization: Bearer <세션>
   ▼
Cloudflare Worker "api"  ── D1 "freesnow" (회원, 인증, 기록, 로그, 캐시)
   │                      └─ 직접 fetch: 소모임 페이지, 스노우라이브 API
   │  서버끼리 POST {action:'drive.*', secret}
   ▼
Google Apps Script (드라이브 전용으로 축소: 갤러리 목록, 채팅 CSV 집계, 프로필 사진 저장)
```

- 기존 `{action}` 요청, 응답 모양 유지 → 화면 코드는 거의 그대로, `src/scripts/session.ts`의 `call`만 바뀜.
- 드라이브를 Apps Script에 남기는 이유: 서비스 계정은 개인 드라이브에 파일을 못 만들고(저장 공간 없음), 사진 파일 ID, 주소를 그대로 유지할 수 있음.
- Apps Script `doPost`는 요청 헤더를 못 읽음 → 어댑터 비밀키는 **body**에 (`ADAPTER_SECRET`, Worker Secret + Apps Script 스크립트 속성).

## 2. 무료 플랜 확인 【확인】(공식 문서, 2026-10-23)

| 항목 | 무료 한도 | Free Snow 예상 |
|---|---|---|
| Workers 요청 | 100,000 / 일 | 회원 200명 × 하루 수십 번 → 수천 |
| Workers CPU | **요청당 10ms** (네트워크, DB 대기는 안 셈) | 대부분 1~3ms. **비밀번호 해시가 위험** (§3-1) |
| 하위 요청(fetch) | 50 / 요청 | 1~2 |
| D1 쿼리 | 50 / 요청 | 수 개 |
| D1 크기 | DB당 500MB, 계정 5GB | 수 MB |
| D1 읽기 / 쓰기 | 500만 행 / 일, 10만 행 / 일 | 인덱스 쓰면 여유. 넘으면 그날 UTC 0시까지 DB 오류 |
| D1 Time Travel | 7일 (특정 시점 복구) | 복구 수단으로 씀 |
| `batch()` | 트랜잭션 — 하나 실패하면 전체 롤백 | 여러 줄 쓰기에 사용 |
| Cache API | 문서상 커스텀 도메인 Worker에서 동작 → **workers.dev에선 못 쓴다고 보고** D1 `cache` 테이블 사용 |

결론: 무료 플랜으로 충분. 유료 전환이 필요해지는 경우는 비밀번호 해시 CPU 하나뿐(§3-1에서 측정).

## 3. 인증 【제안】

### 3-1. 비밀번호

- WebCrypto **PBKDF2-SHA256**, 회원별 무작위 salt 16바이트, 반복 횟수는 행마다 저장(나중에 올릴 수 있게).
- 【측정 필요】 무료 CPU 10ms 안에 들어가는 반복 횟수를 Phase 3에서 실제 Worker로 잼. 목표 10만 회, 안 되면 들어가는 최대치(로그인 잠금, 횟수 제한과 함께 쓰면 충분). 그래도 부족하면 Workers 유료($5/월) 검토 — 그때 다시 상의.
- 새 비밀번호 규칙: 8자 이상, 생년월일, 전화번호, 초기화 비밀번호와 같으면 거부.

### 3-2. 처음 전환할 때 (기존 회원)

1. 이전 직후 모든 회원은 비밀번호가 없음(`member_credentials` 없음).
2. 로그인 화면은 그대로 아이디(전화) + 비밀번호. 비밀번호가 없는 회원은 **생년월일 8자리로 한 번만** 로그인 → 곧바로 '새 비밀번호 설정' 화면, 설정 전엔 다른 기능 안 됨.
3. 설정하면 그 뒤로 생년월일은 안 통함.
- 위험: 생년월일을 아는 사람이 먼저 로그인해 비밀번호를 정해 버릴 수 있음(지금과 같은 수준의 위험). 그런 회원은 운영진 초기화로 되찾음. 전환 공지 때 "빨리 비밀번호를 바꿔 주세요" 안내 권장.

### 3-3. 초기화 (사용자 결정: 공용 초기화 비밀번호)

- 공용 초기화 비밀번호는 Worker Secret `RESET_PASSWORD`(코드, 저장소, D1에 없음). 마스터가 회원에게 직접 알려 줌.
- 마스터가 관리자 화면에서 '비밀번호 초기화' → 그 회원의 비밀번호 해시 삭제, **그 회원의 세션 전부 폐기**, `reset_until = 지금 + 72시간`, 감사 로그.
- 그 회원은 72시간 안에 공용 초기화 비밀번호로 로그인 → 새 비밀번호 설정 화면만 가능 → 설정하면 끝. 72시간 지나면 다시 초기화.
- **초기화 상태가 아닌 회원에겐 공용 비밀번호가 안 통함** → 비밀번호가 새도 초기화 대기 중인 계정만 위험.
- 관리자 화면에 '초기화 대기 / 변경 완료(시각)' 표시.
- 남은 위험: 공용 비밀번호를 아는 사람이 대기 중인 다른 회원 계정을 먼저 차지할 수 있음. 더 안전한 대안은 **초기화할 때마다 무작위 임시 비밀번호를 관리자 화면에 한 번 보여 주기**(운영진 수고는 같음) — 원하면 바꿀 수 있게 만들어 둠.

### 3-4. 세션

- 로그인 성공 → 무작위 32바이트 세션 토큰. D1엔 **SHA-256 해시만** 저장. 브라우저는 지금처럼 `localStorage`(`fs-member-token`)에.
- 요청은 `Authorization: Bearer …` 헤더 → CORS 사전요청이 생기므로 Worker가 `OPTIONS` 응답, 허용 출처는 `https://freesnow-kr.github.io`(+ 개발용 `http://localhost:4321`)만.
- 유효기간: 지금과 같음 — 12시간, '로그인 상태 유지'면 30일.
- 요청마다 세션 + 회원 상태, 권한을 D1에서 함께 읽음 → **정지, 탈퇴, 권한 변경이 바로 반영**.
- 로그아웃 = 서버에서 세션 폐기. 비밀번호 변경, 초기화 = 그 회원 세션 전부 폐기(변경한 기기만 새로 발급).
- 쿠키를 쓰지 않으니 CSRF 대상 아님. 대신 XSS를 막아야 함(지금처럼 `textContent`만, 외부 스크립트 없음). 커스텀 도메인이 생기면 HttpOnly 쿠키로 옮기는 걸 검토.

### 3-5. 잠금, 이력

- 같은 아이디 5회 실패 → 1시간 잠금(지금과 같음) + 같은 IP 30회/시간 실패 → 1시간 잠금(새로). 세는 건 `login_logs`에서(별도 테이블 없음).
- 오류 문구는 지금처럼 하나("아이디 또는 비밀번호가 맞지 않아요"). 정지, 탈퇴 계정도 같은 문구.
- `login_logs`: 시각, 회원 ID(있으면), 아이디의 HMAC 값(원문 X), 성공 여부, 실패 이유, IP 앞부분만(`203.0.113.x`), IP 해시, 브라우저 종류. **비밀번호, 토큰은 절대 기록 안 함**. 90일 지나면 Cron으로 삭제.
- 기존 로그인 이력은 없음 → 전환한 날부터 기록.

## 4. 권한 【제안】

역할은 회원 탭 구분에서 가져옴: **마스터 → `master`**, **운영진 → `staff`**, 나머지 → `member`. 이후엔 관리자 화면에서 마스터만 바꿈.

| 기능 | 비회원 | member | staff | master |
|---|---|---|---|---|
| 정모 일정, 갤러리, 가입 신청 | ○ | ○ | ○ | ○ |
| 내 정보, 프로필 사진, 채팅 랭킹, SHRED LOG, 스노우라이브, 시즌방 | | ○ | ○ | ○ |
| 관리자 대시보드, 회원 목록, 상세, 회원 정보 수정 | | | ○ | ○ |
| 가입 승인, 거절, 시즌방 주주 관리 | | | ○ | ○ |
| 로그인 이력(IP 앞부분만) | | | ○ | ○ |
| 비밀번호 초기화, 정지, 해제, 탈퇴 처리, 권한 변경 | | | | ○ |
| 감사 로그 전체 | | | | ○ |

- 모든 관리자 action은 Worker가 역할을 확인. 화면에서 메뉴를 숨기는 건 편의일 뿐.
- 마스터가 자기 권한을 내리거나 마지막 마스터를 없애는 건 거부.
- 관리자가 바꾸는 것은 전부 `admin_logs`(누가, 언제, 무엇을, 바꾸기 전, 후 값 — 비밀번호 관련은 값 없이 사건만).

## 5. 전환 순서 — 왜 '로그인 + 회원 기록'은 한 번에 옮기나

기능을 하나씩 옮기려면 두 서버가 같은 로그인을 믿어야 하는데, Apps Script는 시트 회원명부로, Worker는 D1 회원으로 판단함. 그러면 가입 승인, 정지 같은 회원 변경을 양쪽에 같이 써야 하고, 그게 어긋나면 한쪽에서만 로그인되는 문제가 생김. 회원 기록 기능(SHRED LOG, 스노우라이브, 시즌방, 내 정보, 프로필)은 데이터가 작아서 **한 번에 옮기는 쪽이 더 안전하고 단순**함.

| 단계 | 옮기는 것 | 데이터 이전 | 되돌리기 |
|---|---|---|---|
| A | 로그인 필요 없는 것: `somoim`, `gallery` (Worker → 소모임 / Apps Script 어댑터) | 없음 | 화면의 API 주소만 되돌림 |
| B | 로그인, 회원, 모든 회원 기록: `login`, `me`, `signup`, `avatar`, `chatrank`, `shredlog`, `snowlive`, `seasonroom` + 새 관리자 화면 | 시트 → D1 한 번에 (§7) | §7-4 |
| C | 신규 기능(회의, 업무, 공지, 회비, 게시판) — Phase 7 | 없음 | — |

- `events`, `rsvp`(지금 안 쓰는 모임 참석)는 **옮기지 않음**. 모임, 참석 탭은 백업만. 다시 쓰게 되면 그때 만듦.
- 화면 쪽 전환 스위치: 빌드 환경변수 `PUBLIC_WORKER_API` + `session.ts`에 Worker로 보낼 action 목록. 되돌릴 땐 목록만 비우고 다시 배포.
- B 이후 가입 승인은 시트 드롭다운(`onEdit`) 대신 관리자 화면. 시트는 그때부터 보관용(읽기 전용).

## 6. Apps Script 어댑터 【제안】

기존 `Code.gs`에 action 3개만 추가(기존 action은 B 단계까지 그대로 동작, 삭제 안 함):

| action | 내용 | Worker 캐시 |
|---|---|---|
| `drive.gallery` {secret} | 기존 `gallery()` 결과 | D1 `cache` 5분 |
| `drive.chatrank` {secret} | 기존 `parseChat` 결과(이미 Apps Script가 6시간 캐시) | D1 `cache` 6시간 → Worker는 CSV를 직접 파싱하지 않음(CPU 10ms) |
| `drive.avatar` {secret, data, small, old?} | 기존 사진 저장 로직, 파일 ID 반환. 누구 사진인지는 Worker가 D1에 | — |

- `secret`이 틀리면 거부, 응답에 다른 정보 없음. 어댑터는 회원명부를 읽지도 내보내지도 않음.
- Apps Script 응답이 1~3초 걸리므로 캐시가 중요. 어댑터가 죽으면 갤러리, 랭킹은 캐시된 마지막 값, 사진 올리기만 실패.

## 7. 데이터 이전 【제안】

### 7-1. 순서 (B 단계 당일)

1. 사이트에 '점검 중'(회원 기능 30분 정도) 공지.
2. 원본 스프레드시트 **사본 만들기** + 탭별 CSV 내려받기 → 저장소 밖 비공개 위치에 보관.
3. 원본 시트의 편집 권한을 잠시 막거나 운영진에게 편집하지 말라고 공지.
4. 이전 스크립트(`backend/scripts/import.mjs`, 로컬 실행)가 **CSV만 읽어서** D1 SQL 생성 → `wrangler d1 execute`로 넣음. 원본 시트에는 아무것도 쓰지 않음.
5. 검증(§7-3) 통과 → 화면 전환 스위치 배포.

### 7-2. 변환 규칙

- 회원: 전화번호 `normPhone`으로 맞춘 숫자 11자리(중복이면 이전 중단하고 목록 보고), 생년월일 `YYYY-MM-DD`, 내부 ID 새로 발급(무작위). 운영진, 마스터 → 역할.
- 기록 탭들: 연락처 → 회원 ID로 바꿈. **연결 안 되는 줄은 버리지 않고 목록으로 보고**(번호가 바뀐 회원 등) → 사용자가 정함.
- 날짜는 시트 값이 날짜, 문자 어느 쪽이든 `ymd()`와 같은 규칙으로 `YYYY-MM-DD`(KST). 시각은 UTC ISO.
- 시즌방: 구분 빈 칸 → 숙박, 취소 줄도 그대로.
- 스노우라이브: 연결 정보와 시즌별 데이터를 두 테이블로 나눔.
- 가입신청: 대기 중인 것만 가져옴(승인된 건 회원으로 이미 있음).

### 7-3. 검증

- 탭별 줄 수 = 테이블 행 수(버린 줄은 이유와 함께 표시).
- 회원별 출격 수, 지출 합계, 시즌방 숙박/휴식 수가 시트 계산과 D1 쿼리에서 같은지.
- 날짜 최소/최대, 금액 합계 비교.
- 실제 회원 2~3명이 로그인해서 자기 기록이 그대로인지 확인.

### 7-4. 되돌리기

- 전환 후 문제가 생기면 화면 스위치를 Apps Script로 되돌림 → 시트는 전환 시점 그대로라 바로 동작.
- 전환 후 D1에 새로 쓰인 기록은 `backend/scripts/export.mjs`가 탭 양식 CSV로 내보냄 → 시트에 붙여 넣으면 이어짐(비밀번호, 로그인 이력은 시트로 안 감).
- D1 쪽 실수는 Time Travel(7일)로 복구.

## 8. D1 스키마 초안 【제안】

```sql
-- 0001_init.sql  (시각 = UTC ISO 문자열, 날짜 = 'YYYY-MM-DD' KST)
CREATE TABLE members (
  id TEXT PRIMARY KEY,                        -- 무작위, 영구
  phone TEXT NOT NULL UNIQUE,                 -- 숫자 11자리 (로그인 아이디, 바뀔 수 있음)
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('남','여') OR gender IS NULL),
  birth TEXT,                                 -- 'YYYY-MM-DD' (관리자만 봄, 응답에 안 나감)
  grade TEXT NOT NULL DEFAULT '',             -- 시트 '구분' 원래 값 (경기도, 운영진 …)
  area TEXT NOT NULL DEFAULT '',
  private_contact TEXT,                       -- 시트 '비공개연락처' (관리자만)
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','staff','master')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','withdrawn')),
  sort_no INTEGER,                            -- 시트 순서 (명부 정렬용)
  joined_at TEXT, approved_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE member_credentials (
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  hash TEXT, salt TEXT, iter INTEGER,         -- hash NULL = 비밀번호 없음(첫 전환, 초기화)
  reset_until TEXT,                           -- 초기화 대기 마감
  changed_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  must_change INTEGER NOT NULL DEFAULT 0,     -- 새 비밀번호 설정 전 세션
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, ua TEXT
);
CREATE INDEX sessions_member ON sessions(member_id);

CREATE TABLE login_logs (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, member_id TEXT, login_key TEXT NOT NULL,   -- login_key = HMAC(아이디)
  ok INTEGER NOT NULL, reason TEXT, ip_masked TEXT, ip_hash TEXT, ua TEXT
);
CREATE INDEX login_logs_key ON login_logs(login_key, at);
CREATE INDEX login_logs_ip ON login_logs(ip_hash, at);
CREATE INDEX login_logs_at ON login_logs(at);

CREATE TABLE admin_logs (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL,
  target_id TEXT, detail TEXT                 -- JSON (바꾸기 전, 후, 비밀번호 값은 절대 없음)
);
CREATE INDEX admin_logs_at ON admin_logs(at);

CREATE TABLE signup_requests (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL, name TEXT NOT NULL, gender TEXT, birth TEXT,
  sido TEXT, area TEXT, phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by TEXT, decided_at TEXT
);
CREATE UNIQUE INDEX signup_pending_phone ON signup_requests(phone) WHERE status = 'pending';

CREATE TABLE profiles (
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  photo TEXT NOT NULL,                        -- 드라이브 파일 ID 또는 data:image/jpeg… (지금과 같음)
  updated_at TEXT NOT NULL
);

CREATE TABLE ride_logs (
  member_id TEXT NOT NULL REFERENCES members(id), id TEXT NOT NULL,  -- id = 화면이 만든 ID (중복 방지)
  date TEXT NOT NULL, resort TEXT NOT NULL, slot TEXT, snow TEXT, style TEXT, weather TEXT, crew TEXT,
  temp REAL, runs INTEGER, hours REAL, rating INTEGER, gear TEXT, memo TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, id)
);
CREATE TABLE expense_logs (
  member_id TEXT NOT NULL REFERENCES members(id), id TEXT NOT NULL,
  date TEXT NOT NULL, cat TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0),
  memo TEXT, visit_id TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, id)
);
CREATE TABLE season_passes (
  member_id TEXT NOT NULL REFERENCES members(id), season TEXT NOT NULL,   -- '25-26'
  price INTEGER NOT NULL DEFAULT 0, day_price INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY (member_id, season)
);

CREATE TABLE snowlive_links (
  member_id TEXT PRIMARY KEY REFERENCES members(id), snowlive_id TEXT NOT NULL, linked_at TEXT NOT NULL
);
CREATE TABLE snowlive_records (
  member_id TEXT NOT NULL REFERENCES members(id), season TEXT NOT NULL,
  data TEXT NOT NULL, fetched_at TEXT NOT NULL,                           -- 라이딩 통계 JSON만
  PRIMARY KEY (member_id, season)
);

CREATE TABLE room_stays (
  member_id TEXT NOT NULL REFERENCES members(id), date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('숙박','휴식','취소')),               -- 취소도 남김 (지금 규칙)
  updated_at TEXT NOT NULL,
  PRIMARY KEY (member_id, date)
);
CREATE INDEX room_stays_date ON room_stays(date);
CREATE TABLE room_owners (
  season TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES members(id),
  PRIMARY KEY (season, member_id)
);

CREATE TABLE cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TEXT NOT NULL);
```

- 시즌방 체크, 취소는 `INSERT … ON CONFLICT(member_id, date) DO UPDATE SET kind = ?, updated_at = ?` 한 문장 → 중복 줄이 생길 수 없음(지금 시트는 손으로 고치면 생길 수 있었음).
- 정원제 예약을 나중에 도입하면: `rooms`, 날짜별 정원 + 조건부 INSERT(`… WHERE (SELECT count(*) …) < 정원`) 한 문장으로 경쟁 상태 방지 — **지금은 만들지 않음**(운영 규칙 미정).
- 회의, 업무, 공지, 회비, 게시판 테이블은 Phase 7에서 `0002_…sql`로.
- 탈퇴: `status = 'withdrawn'`, 세션 폐기, 기록은 그대로(사용자 결정). 개인정보를 지울지는 나중에 정함.

## 9. API 계약 【제안】

- 주소 하나 `POST https://api.freesnow.workers.dev/` body `{action, ...}`. 응답 모양은 지금 action별 응답과 같게(→ 화면 코드 그대로).
- 바뀌는 것: 토큰을 body `token` 대신 `Authorization` 헤더로(Worker는 전환 기간에 body `token`도 받음). 로그인 응답에 `mustChange: true`가 있으면 화면이 비밀번호 설정으로.
- 새 action: `password` {current, next}, `logout`, `admin.*`(대시보드, members.list/get/update/status/role/reset, signups.list/decide, logins.list, audit.list, roomOwners.set).
- 요청 body 최대 600KB(프로필 사진 기준), 넘으면 거부. 오류 응답엔 내부 정보 없음.

## 10. 저장소 구성 【제안】

```
backend/
  package.json        wrangler, vitest, @cloudflare/vitest-pool-workers (backend 안에서만 — 사이트 의존성은 그대로 astro 하나)
  wrangler.jsonc      name "api", D1 바인딩 DB, cron(로그 정리)
  migrations/0001_init.sql
  src/index.ts        라우팅, CORS, 오류 처리
  src/auth.ts         비밀번호, 세션, 권한
  src/actions/        기존 action별 파일 (기존 Code.gs 로직을 옮김)
  src/admin.ts
  scripts/import.mjs, export.mjs   (CSV ↔ D1, 실제 데이터 파일은 저장소에 안 둠)
  test/               가짜 데이터만
src/pages/admin/index.astro          관리자 화면 (기존 에디토리얼 스타일)
src/pages/password/index.astro       비밀번호 설정, 변경
```

- 비밀값(Worker Secret): `RESET_PASSWORD`, `ADAPTER_SECRET`, `LOGIN_KEY_SECRET`(로그인 이력용 HMAC). 로컬은 `backend/.dev.vars`(gitignore).
- Worker 배포는 사이트 배포와 따로(`wrangler deploy`, 나중에 GitHub Actions). 배포는 사용자 확인 후에만.

## 11. Phase 3에서 할 일 (다음 단계)

1. `backend/` 뼈대 + 로컬 D1(`wrangler dev`, 실제 Cloudflare엔 아무것도 안 만듦) + `0001_init.sql`.
2. **PBKDF2 CPU 측정** → 반복 횟수 결정(이 결과로 무료 플랜 유지 여부 확정).
3. 인증(로그인, 첫 전환, 초기화, 세션, 잠금, 로그인 이력) + 테스트.
4. 기존 action 중 `seasonroom` 하나를 먼저 옮겨서 기존 테스트(`Code.test.mjs` 11번)와 같은 결과가 나오는지 비교.

## 12. 남은 확인 사항

- 실제 시트 머리글, 건수(가린 사본 또는 탭별 머리글+줄 수) — §7 이전 스크립트 전에 필요.
- 시트 '비공개연락처' 열을 D1에 가져갈지(관리자만 보는 용도) — 안 쓰면 가져가지 않는 게 좋음.
- 전환 공지 문구와 날짜(B 단계).
