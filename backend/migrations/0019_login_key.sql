-- 사용자 요구 2026-10-26:
--   members.login_id 지움 — 0017의 fs_ 아이디는 휴대폰 번호 아이디로 넘어가는 동안만 쓰던 것 (실서버 10명 모두 HMAC으로 옮겨 비어 있음)
--   phone_key → login_key 로 이름 바꾸고 name 앞으로 (members·signup_requests 둘 다). login_logs.login_key(로그인 시도 기록용 HMAC, 다른 키)와는 다른 값
-- UNIQUE 열이라 DROP COLUMN이 안 되고 열 순서도 바꿔야 해서 0018과 같이 테이블을 새로 만들어 옮김
PRAGMA defer_foreign_keys = true;
CREATE TABLE members_new (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'withdrawn')),
  login_key TEXT UNIQUE,                      -- 로그인 아이디(010 뺀 휴대폰 번호)의 HMAC(secret PHONE_KEY), 탈퇴하면 NULL
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('남', '여') OR gender IS NULL),
  birth_year INTEGER,                         -- 선택
  region TEXT NOT NULL DEFAULT '',            -- 선택 (경기북부·서울 …)
  area TEXT NOT NULL DEFAULT '',              -- 선택 (구리·노원구 …)
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
INSERT INTO members_new (id, status, login_key, name, gender, birth_year, region, area, phone_enc, email, role, sort_no, joined_at, approved_at, agreed_at, agreed_opt_at, policy, created_at, updated_at)
SELECT id, status, phone_key, name, gender, birth_year, region, area, phone_enc, email, role, sort_no, joined_at, approved_at, agreed_at, agreed_opt_at, policy, created_at, updated_at FROM members;
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
  login_key TEXT NOT NULL,                    -- 휴대폰 번호 HMAC (승인하면 회원으로)
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
INSERT INTO signup_requests_new (id, status, login_key, name, gender, birth_year, sido, area, phone_enc, pw_hash, pw_salt, pw_iter, agreed_at, agreed_opt_at, policy, decided_by, decided_at, is_active, created_at, updated_at)
SELECT id, status, phone_key, name, gender, birth_year, sido, area, phone_enc, pw_hash, pw_salt, pw_iter, agreed_at, agreed_opt_at, policy, decided_by, decided_at, is_active, created_at, updated_at FROM signup_requests;
DROP TABLE signup_requests;
ALTER TABLE signup_requests_new RENAME TO signup_requests;
CREATE UNIQUE INDEX signup_pending_login ON signup_requests(login_key) WHERE status = 'pending' AND is_active = 1;
CREATE TRIGGER signup_requests_stamp_insert AFTER INSERT ON signup_requests WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE signup_requests SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER signup_requests_stamp_update AFTER UPDATE ON signup_requests WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE signup_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
PRAGMA defer_foreign_keys = false;
