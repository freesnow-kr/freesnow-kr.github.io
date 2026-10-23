-- '마스터'를 따로 열(honorary) 말고 role 값으로 (사용자 요구 2026-10-23: 예전 master는 admin이 됐으니 master = 마스터(명예))
--   role: member / master(마스터 — 명예, 권한은 회원과 같음) / staff(운영진) / admin(관리자)
-- CHECK를 바꾸려면 테이블을 새로 만들어야 해서 0010과 같은 방식 (열 순서도 그대로, honorary 열만 빠짐)
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
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'master', 'staff', 'admin')),
  sort_no INTEGER,
  joined_at TEXT,
  approved_at TEXT,
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO members_new (id, status, phone, name, gender, birth, region, area, private_contact, role, sort_no, joined_at, approved_at, created_at, updated_at)
SELECT id, status, phone, name, gender, birth, region, area, private_contact,
       CASE WHEN honorary = 1 AND role = 'member' THEN 'master' ELSE role END,
       sort_no, joined_at, approved_at, created_at, updated_at
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
