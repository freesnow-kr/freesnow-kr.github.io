-- 가입 정보 줄이기 (사용자 요구 2026-10-26, 동호회 안에서 개인정보를 너무 많이 받는다는 의견)
-- 받는 것: 아이디·비밀번호(직접 정함)·이름·성별(필수), 출생연도·시도·시군구(선택). 휴대폰·생년월일(월일)·비공개 연락처는 안 받고 지금 값도 지움
-- members: phone·birth·private_contact 빼고 login_id(로그인 아이디 fs_숫자4, 탈퇴하면 NULL)·birth_year. 지금 회원은 fs_ + 지우기 전 휴대폰 뒷자리(실서버 10명 겹치지 않음 확인), 비밀번호는 그대로
-- signup_requests: 신청은 0건이라 새로 만듦. 비밀번호는 신청할 때 해시로 받아 승인하면 member_credentials로
PRAGMA defer_foreign_keys = true;
CREATE TABLE members_new (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'withdrawn')),
  login_id TEXT UNIQUE,                       -- fs_ + 숫자 4자리, 탈퇴하면 NULL (같은 아이디로 다시 가입 가능)
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('남', '여') OR gender IS NULL),
  birth_year INTEGER,                         -- 선택
  region TEXT NOT NULL DEFAULT '',            -- 선택 (경기북부·서울 …)
  area TEXT NOT NULL DEFAULT '',              -- 선택 (구리·노원구 …)
  email TEXT,                                 -- 운영진 알림용, 운영진이 입력
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'master', 'staff', 'admin')),
  sort_no INTEGER,
  joined_at TEXT,
  approved_at TEXT,
  agreed_at TEXT,                             -- 필수 항목 동의 + 만 14세 이상 확인 시각 (가입 신청 때, 이 변경 전 회원은 NULL)
  agreed_opt_at TEXT,                         -- 선택 항목(출생연도·거주지) 동의 시각, 안 했으면 NULL
  policy TEXT,                                -- 동의할 때의 개인정보처리방침 시행일 (예 2026-10-26)
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO members_new (id, status, login_id, name, gender, birth_year, region, area, email, role, sort_no, joined_at, approved_at, created_at, updated_at)
SELECT id, status,
       CASE WHEN status = 'withdrawn' THEN NULL ELSE 'fs_' || substr(phone, -4) END,
       name, gender, CAST(substr(birth, 1, 4) AS INTEGER), region, area, email, role, sort_no, joined_at, approved_at, created_at, updated_at
FROM members;
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

DROP TABLE signup_requests;
CREATE TABLE signup_requests (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  login_id TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('남', '여')),
  birth_year INTEGER,
  sido TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  pw_hash TEXT NOT NULL,                      -- PBKDF2 (member_credentials와 같은 방식), 승인·거절하면 비움
  pw_salt TEXT NOT NULL,
  pw_iter INTEGER NOT NULL,
  agreed_at TEXT NOT NULL,                    -- 필수 항목 동의 + 만 14세 이상 확인 시각
  agreed_opt_at TEXT,                         -- 선택 항목 동의 시각 (안 했으면 NULL, 그땐 출생연도·거주지도 안 받음)
  policy TEXT NOT NULL,                       -- 동의할 때의 개인정보처리방침 시행일
  decided_by TEXT,
  decided_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX signup_pending_login ON signup_requests(login_id) WHERE status = 'pending' AND is_active = 1;
CREATE TRIGGER signup_requests_stamp_insert AFTER INSERT ON signup_requests WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE signup_requests SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER signup_requests_stamp_update AFTER UPDATE ON signup_requests WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE signup_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- 운영 기록에 남은 예전 값도 지움 (회원 수정 전후 값)
UPDATE admin_logs SET detail = json_remove(detail, '$.before.phone', '$.before.birth', '$.before.private_contact', '$.after.phone', '$.after.birth', '$.after.private_contact')
WHERE action = 'member.update' AND json_valid(detail);
PRAGMA defer_foreign_keys = false;
