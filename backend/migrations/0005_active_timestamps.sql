-- 모든 테이블에 is_active(소프트 삭제: 0이면 지운 것), created_at, updated_at (사용자 요구 2026-10-23)
-- SQLite는 ADD COLUMN에 시각 기본값을 못 줘서: 열 추가 → 기존 줄은 그 테이블의 시각 열로 채움 → 트리거가 앞으로 자동으로 채움
--   INSERT 뒤: 비어 있으면 created_at·updated_at = 지금 / UPDATE 뒤: updated_at을 직접 안 바꿨으면 지금
-- 시각 = UTC ISO ('2026-10-23T05:00:00.000Z', 앱과 같은 형식)

-- members
ALTER TABLE members ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
CREATE TRIGGER members_stamp_insert AFTER INSERT ON members WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE members SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER members_stamp_update AFTER UPDATE ON members WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE members SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- member_credentials
ALTER TABLE member_credentials ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE member_credentials ADD COLUMN created_at TEXT;
UPDATE member_credentials SET created_at = coalesce(changed_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE member_credentials ADD COLUMN updated_at TEXT;
UPDATE member_credentials SET updated_at = coalesce(changed_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER member_credentials_stamp_insert AFTER INSERT ON member_credentials WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE member_credentials SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER member_credentials_stamp_update AFTER UPDATE ON member_credentials WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE member_credentials SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- sessions
ALTER TABLE sessions ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE sessions ADD COLUMN updated_at TEXT;
UPDATE sessions SET updated_at = coalesce(created_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER sessions_stamp_insert AFTER INSERT ON sessions WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE sessions SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sessions_stamp_update AFTER UPDATE ON sessions WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- login_logs
ALTER TABLE login_logs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE login_logs ADD COLUMN created_at TEXT;
UPDATE login_logs SET created_at = coalesce(at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE login_logs ADD COLUMN updated_at TEXT;
UPDATE login_logs SET updated_at = coalesce(at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER login_logs_stamp_insert AFTER INSERT ON login_logs WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE login_logs SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER login_logs_stamp_update AFTER UPDATE ON login_logs WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE login_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- admin_logs
ALTER TABLE admin_logs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE admin_logs ADD COLUMN created_at TEXT;
UPDATE admin_logs SET created_at = coalesce(at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE admin_logs ADD COLUMN updated_at TEXT;
UPDATE admin_logs SET updated_at = coalesce(at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER admin_logs_stamp_insert AFTER INSERT ON admin_logs WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE admin_logs SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER admin_logs_stamp_update AFTER UPDATE ON admin_logs WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE admin_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- signup_requests
ALTER TABLE signup_requests ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE signup_requests ADD COLUMN updated_at TEXT;
UPDATE signup_requests SET updated_at = coalesce(coalesce(decided_at, created_at), created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER signup_requests_stamp_insert AFTER INSERT ON signup_requests WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE signup_requests SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER signup_requests_stamp_update AFTER UPDATE ON signup_requests WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE signup_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- profiles
ALTER TABLE profiles ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE profiles ADD COLUMN created_at TEXT;
UPDATE profiles SET created_at = coalesce(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER profiles_stamp_insert AFTER INSERT ON profiles WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE profiles SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER profiles_stamp_update AFTER UPDATE ON profiles WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- ride_logs
ALTER TABLE ride_logs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE ride_logs ADD COLUMN updated_at TEXT;
UPDATE ride_logs SET updated_at = coalesce(created_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER ride_logs_stamp_insert AFTER INSERT ON ride_logs WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE ride_logs SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER ride_logs_stamp_update AFTER UPDATE ON ride_logs WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE ride_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- expense_logs
ALTER TABLE expense_logs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE expense_logs ADD COLUMN updated_at TEXT;
UPDATE expense_logs SET updated_at = coalesce(created_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER expense_logs_stamp_insert AFTER INSERT ON expense_logs WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE expense_logs SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER expense_logs_stamp_update AFTER UPDATE ON expense_logs WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE expense_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- season_passes
ALTER TABLE season_passes ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE season_passes ADD COLUMN created_at TEXT;
UPDATE season_passes SET created_at = coalesce(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER season_passes_stamp_insert AFTER INSERT ON season_passes WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE season_passes SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER season_passes_stamp_update AFTER UPDATE ON season_passes WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE season_passes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- snowlive_links
ALTER TABLE snowlive_links ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE snowlive_links ADD COLUMN created_at TEXT;
UPDATE snowlive_links SET created_at = coalesce(linked_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE snowlive_links ADD COLUMN updated_at TEXT;
UPDATE snowlive_links SET updated_at = coalesce(linked_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER snowlive_links_stamp_insert AFTER INSERT ON snowlive_links WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE snowlive_links SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER snowlive_links_stamp_update AFTER UPDATE ON snowlive_links WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE snowlive_links SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- snowlive_records
ALTER TABLE snowlive_records ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE snowlive_records ADD COLUMN created_at TEXT;
UPDATE snowlive_records SET created_at = coalesce(fetched_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE snowlive_records ADD COLUMN updated_at TEXT;
UPDATE snowlive_records SET updated_at = coalesce(fetched_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER snowlive_records_stamp_insert AFTER INSERT ON snowlive_records WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE snowlive_records SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER snowlive_records_stamp_update AFTER UPDATE ON snowlive_records WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE snowlive_records SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- room_stays
ALTER TABLE room_stays ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE room_stays ADD COLUMN created_at TEXT;
UPDATE room_stays SET created_at = coalesce(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER room_stays_stamp_insert AFTER INSERT ON room_stays WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE room_stays SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER room_stays_stamp_update AFTER UPDATE ON room_stays WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE room_stays SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- room_owners
ALTER TABLE room_owners ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE room_owners ADD COLUMN created_at TEXT;
UPDATE room_owners SET created_at = coalesce(NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE room_owners ADD COLUMN updated_at TEXT;
UPDATE room_owners SET updated_at = coalesce(NULL, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER room_owners_stamp_insert AFTER INSERT ON room_owners WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE room_owners SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER room_owners_stamp_update AFTER UPDATE ON room_owners WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE room_owners SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- cache
ALTER TABLE cache ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE cache ADD COLUMN created_at TEXT;
UPDATE cache SET created_at = coalesce(NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE cache ADD COLUMN updated_at TEXT;
UPDATE cache SET updated_at = coalesce(NULL, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER cache_stamp_insert AFTER INSERT ON cache WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE cache SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER cache_stamp_update AFTER UPDATE ON cache WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE cache SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- ride_checks
ALTER TABLE ride_checks ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE ride_checks ADD COLUMN created_at TEXT;
UPDATE ride_checks SET created_at = coalesce(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER ride_checks_stamp_insert AFTER INSERT ON ride_checks WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE ride_checks SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER ride_checks_stamp_update AFTER UPDATE ON ride_checks WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE ride_checks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- meetups
ALTER TABLE meetups ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE meetups ADD COLUMN created_at TEXT;
UPDATE meetups SET created_at = coalesce(first_seen_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER meetups_stamp_insert AFTER INSERT ON meetups WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE meetups SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER meetups_stamp_update AFTER UPDATE ON meetups WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE meetups SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- meetup_attendees
ALTER TABLE meetup_attendees ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE meetup_attendees ADD COLUMN created_at TEXT;
UPDATE meetup_attendees SET created_at = coalesce(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER meetup_attendees_stamp_insert AFTER INSERT ON meetup_attendees WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE meetup_attendees SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER meetup_attendees_stamp_update AFTER UPDATE ON meetup_attendees WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE meetup_attendees SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- photos
ALTER TABLE photos ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE photos ADD COLUMN updated_at TEXT;
UPDATE photos SET updated_at = coalesce(created_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER photos_stamp_insert AFTER INSERT ON photos WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE photos SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER photos_stamp_update AFTER UPDATE ON photos WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE photos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
