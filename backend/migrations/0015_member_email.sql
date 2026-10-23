-- 회원 메일 (사용자 요구 2026-10-23): 운영진 화면 회원 수정에서 입력. 강습 요청이 들어오면 메일이 있는 활동 운영진(staff·admin)에게만 알림
-- 열 순서 규칙(AGENTS.md '열 순서 규칙') 때문에 연락처 다음(private_contact 뒤)에 넣으려고 0011과 같은 방식으로 테이블을 새로 만듦
PRAGMA defer_foreign_keys = true;
CREATE TABLE members_new (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'withdrawn')),
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('남', '여') OR gender IS NULL),
  birth TEXT,
  region TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  private_contact TEXT,
  email TEXT,                                 -- 소문자로 저장, 없으면 NULL
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'master', 'staff', 'admin')),
  sort_no INTEGER,
  joined_at TEXT,
  approved_at TEXT,
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO members_new (id, status, phone, name, gender, birth, region, area, private_contact, role, sort_no, joined_at, approved_at, created_at, updated_at)
SELECT id, status, phone, name, gender, birth, region, area, private_contact, role, sort_no, joined_at, approved_at, created_at, updated_at
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
PRAGMA defer_foreign_keys = false;
