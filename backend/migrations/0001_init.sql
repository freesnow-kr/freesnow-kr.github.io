-- 시각 = UTC ISO 문자열, 날짜 = 'YYYY-MM-DD' (KST). 설계: docs/migration/02-design.md §8

CREATE TABLE members (
  id TEXT PRIMARY KEY,                        -- 무작위, 영구 (전화번호는 바뀔 수 있어서 키로 안 씀)
  phone TEXT NOT NULL UNIQUE,                 -- 숫자 11자리 = 로그인 아이디
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('남', '여') OR gender IS NULL),
  birth TEXT,                                 -- 'YYYY-MM-DD' — 응답에 절대 안 나감 (첫 전환 로그인 확인용)
  grade TEXT NOT NULL DEFAULT '',             -- 시트 '구분' 원래 값 (경기도, 운영진 …)
  area TEXT NOT NULL DEFAULT '',
  private_contact TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'staff', 'master')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'withdrawn')),
  sort_no INTEGER,
  joined_at TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 줄 없음 = 첫 전환 전(생년월일로 한 번 로그인). hash NULL = 초기화됨(reset_until까지 공용 초기화 비밀번호)
CREATE TABLE member_credentials (
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  hash TEXT,
  salt TEXT,
  iter INTEGER,
  reset_until TEXT,
  changed_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                -- SHA-256(토큰). 토큰 원문은 저장 안 함
  member_id TEXT NOT NULL REFERENCES members(id),
  must_change INTEGER NOT NULL DEFAULT 0,     -- 새 비밀번호 정하기 전 세션
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ua TEXT
);
CREATE INDEX sessions_member ON sessions(member_id);

-- 비밀번호·토큰은 절대 안 적음. login_key = HMAC(아이디)
CREATE TABLE login_logs (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  member_id TEXT,
  login_key TEXT NOT NULL,
  ok INTEGER NOT NULL,
  reason TEXT,
  ip_masked TEXT,
  ip_hash TEXT,
  ua TEXT
);
CREATE INDEX login_logs_key ON login_logs(login_key, at);
CREATE INDEX login_logs_ip ON login_logs(ip_hash, at);
CREATE INDEX login_logs_at ON login_logs(at);

CREATE TABLE admin_logs (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  detail TEXT                                 -- JSON (바꾸기 전·후). 비밀번호 값은 절대 없음
);
CREATE INDEX admin_logs_at ON admin_logs(at);

CREATE TABLE signup_requests (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT,
  birth TEXT,
  sido TEXT,
  area TEXT,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by TEXT,
  decided_at TEXT
);
CREATE UNIQUE INDEX signup_pending_phone ON signup_requests(phone) WHERE status = 'pending';

CREATE TABLE profiles (
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  photo TEXT NOT NULL,                        -- 드라이브 파일 ID 또는 data:image/jpeg… (지금과 같음)
  updated_at TEXT NOT NULL
);

CREATE TABLE ride_logs (
  member_id TEXT NOT NULL REFERENCES members(id),
  id TEXT NOT NULL,                           -- 화면이 만든 ID (다시 보내도 중복 없음)
  date TEXT NOT NULL,
  resort TEXT NOT NULL,
  slot TEXT, snow TEXT, style TEXT, weather TEXT, crew TEXT,
  temp REAL, runs INTEGER, hours REAL, rating INTEGER,
  gear TEXT, memo TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, id)
);

CREATE TABLE expense_logs (
  member_id TEXT NOT NULL REFERENCES members(id),
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  cat TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  memo TEXT,
  visit_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, id)
);

CREATE TABLE season_passes (
  member_id TEXT NOT NULL REFERENCES members(id),
  season TEXT NOT NULL,                       -- '25-26'
  price INTEGER NOT NULL DEFAULT 0,
  day_price INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (member_id, season)
);

CREATE TABLE snowlive_links (
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  snowlive_id TEXT NOT NULL,
  linked_at TEXT NOT NULL
);

CREATE TABLE snowlive_records (
  member_id TEXT NOT NULL REFERENCES members(id),
  season TEXT NOT NULL,
  data TEXT NOT NULL,                         -- 라이딩 통계 JSON만
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (member_id, season)
);

-- 회원·날짜당 한 줄. 취소도 지우지 않고 kind = '취소' (지금 시트 규칙)
CREATE TABLE room_stays (
  member_id TEXT NOT NULL REFERENCES members(id),
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('숙박', '휴식', '취소')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (member_id, date)
);
CREATE INDEX room_stays_date ON room_stays(date);

CREATE TABLE room_owners (
  season TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id),
  PRIMARY KEY (season, member_id)
);

CREATE TABLE cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
