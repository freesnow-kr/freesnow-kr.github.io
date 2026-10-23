-- members 열 순서 (사용자 요구 2026-10-23): id 바로 옆 status, private_contact 뒤 role(+ honorary = 마스터 명예), 시각 열은 맨 뒤
-- SQLite는 열 순서를 못 바꿔서 테이블을 새로 만들어 옮김. 다른 테이블이 members(id)를 참조해서 PRAGMA defer_foreign_keys로 커밋 때 확인
-- (실제 Cloudflare D1에서 임시 DB로 확인함. 로컬 wrangler(miniflare)는 이걸 한 번에 실행하면 internal error → 테스트는 한 문장씩)
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
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'staff', 'admin')),
  honorary INTEGER NOT NULL DEFAULT 0 CHECK (honorary IN (0, 1)),   -- 마스터(명예 명칭), 권한과 무관
  sort_no INTEGER,
  joined_at TEXT,
  approved_at TEXT,
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO members_new (id, status, phone, name, gender, birth, region, area, private_contact, role, honorary, sort_no, joined_at, approved_at, created_at, updated_at)
SELECT id, status, phone, name, gender, birth, region, area, private_contact, role, honorary, sort_no, joined_at, approved_at, created_at, updated_at FROM members;
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
