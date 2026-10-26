-- 아이디 = 010 뺀 휴대폰 번호 (사용자 결정 2026-10-26, 0017의 fs_ 아이디 대신). 번호는 화면 어디에도 안 보이고 DB에도 그대로 안 둠:
--   phone_key = HMAC(secret PHONE_KEY) — 로그인·중복 가입 확인용, 되돌릴 수 없음
--   phone_enc = AES-GCM — 비상 연락처로 쓰는 데 선택 동의한 회원만, 운영진 화면에서만 풂 (lib.ts sealPhone)
-- 지금 회원은 0017에서 번호를 지워서 phone_key가 비어 있음 → 운영진이 회원 수정에서 번호를 넣기 전까지 fs_ 아이디(login_id)로 로그인
-- 열 순서 규칙(created_at·updated_at 맨 뒤) 때문에 0017과 같이 테이블을 새로 만들어 옮김
PRAGMA defer_foreign_keys = true;
CREATE TABLE members_new (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'withdrawn')),
  login_id TEXT UNIQUE,                       -- 0017 때의 fs_ 아이디 — 휴대폰 번호를 넣기 전 회원만, 넣으면 NULL
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('남', '여') OR gender IS NULL),
  birth_year INTEGER,                         -- 선택
  region TEXT NOT NULL DEFAULT '',            -- 선택 (경기북부·서울 …)
  area TEXT NOT NULL DEFAULT '',              -- 선택 (구리·노원구 …)
  phone_key TEXT UNIQUE,                      -- 로그인 아이디(휴대폰 번호)의 HMAC, 탈퇴하면 NULL
  phone_enc TEXT,                             -- 선택: 비상 연락처(같은 번호) 암호문, 운영진만 풂
  email TEXT,                                 -- 운영진 알림용, 운영진이 입력
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'master', 'staff', 'admin')),
  sort_no INTEGER,
  joined_at TEXT,
  approved_at TEXT,
  agreed_at TEXT,                             -- 필수 항목 동의 + 만 14세 이상 확인 시각 (0017 전 회원은 NULL)
  agreed_opt_at TEXT,                         -- 선택 항목(출생연도·거주지·비상 연락처) 동의 시각, 안 했으면 NULL
  policy TEXT,                                -- 동의할 때의 개인정보처리방침 시행일
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO members_new (id, status, login_id, name, gender, birth_year, region, area, email, role, sort_no, joined_at, approved_at, agreed_at, agreed_opt_at, policy, created_at, updated_at)
SELECT id, status, login_id, name, gender, birth_year, region, area, email, role, sort_no, joined_at, approved_at, agreed_at, agreed_opt_at, policy, created_at, updated_at FROM members;
DROP TABLE members;
ALTER TABLE members_new RENAME TO members;
CREATE TRIGGER members_stamp_insert AFTER INSERT ON members WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE members SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER members_stamp_update AFTER UPDATE ON members WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE members SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

CREATE TABLE signup_requests_new (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  phone_key TEXT NOT NULL,                    -- 휴대폰 번호 HMAC (승인하면 회원으로)
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('남', '여')),
  birth_year INTEGER,
  sido TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  phone_enc TEXT,                             -- 선택: 비상 연락처 암호문
  pw_hash TEXT NOT NULL,                      -- PBKDF2 (member_credentials와 같은 방식), 승인·거절하면 비움
  pw_salt TEXT NOT NULL,
  pw_iter INTEGER NOT NULL,
  agreed_at TEXT NOT NULL,                    -- 필수 항목 동의 + 만 14세 이상 확인 시각
  agreed_opt_at TEXT,                         -- 선택 항목 동의 시각 (안 했으면 NULL, 그땐 선택 항목도 안 받음)
  policy TEXT NOT NULL,                       -- 동의할 때의 개인정보처리방침 시행일
  decided_by TEXT,
  decided_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
-- fs_ 아이디로 들어온 신청은 휴대폰 번호가 없어서 옮기지 않음 (실서버 0건 — 대기 신청이 있으면 다시 신청)
DROP TABLE signup_requests;
ALTER TABLE signup_requests_new RENAME TO signup_requests;
CREATE UNIQUE INDEX signup_pending_phone ON signup_requests(phone_key) WHERE status = 'pending' AND is_active = 1;
CREATE TRIGGER signup_requests_stamp_insert AFTER INSERT ON signup_requests WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE signup_requests SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER signup_requests_stamp_update AFTER UPDATE ON signup_requests WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE signup_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
PRAGMA defer_foreign_keys = false;
