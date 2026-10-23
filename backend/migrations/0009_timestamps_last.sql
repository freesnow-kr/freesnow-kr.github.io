-- created_at, updated_at을 모든 테이블의 맨 뒤 열로 (사용자 요구 2026-10-23: 시각 열은 항상 마지막)
-- SQLite는 열 순서를 못 바꿔서: 트리거 잠시 지움 → 맨 뒤에 새 열 두 개 → 값 복사 → 예전 열 지움 → 이름 되돌림 → 트리거 다시
-- 앞으로 열을 추가할 땐 시각 열이 마지막이 되게 이 방식으로 (AGENTS.md)

-- expense_logs
DROP TRIGGER IF EXISTS expense_logs_stamp_insert;
DROP TRIGGER IF EXISTS expense_logs_stamp_update;
ALTER TABLE expense_logs ADD COLUMN created_at_new TEXT;
ALTER TABLE expense_logs ADD COLUMN updated_at_new TEXT;
UPDATE expense_logs SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE expense_logs DROP COLUMN created_at;
ALTER TABLE expense_logs DROP COLUMN updated_at;
ALTER TABLE expense_logs RENAME COLUMN created_at_new TO created_at;
ALTER TABLE expense_logs RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER expense_logs_stamp_insert AFTER INSERT ON expense_logs WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE expense_logs SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER expense_logs_stamp_update AFTER UPDATE ON expense_logs WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE expense_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- meetup_attendees
DROP TRIGGER IF EXISTS meetup_attendees_stamp_insert;
DROP TRIGGER IF EXISTS meetup_attendees_stamp_update;
ALTER TABLE meetup_attendees ADD COLUMN created_at_new TEXT;
ALTER TABLE meetup_attendees ADD COLUMN updated_at_new TEXT;
UPDATE meetup_attendees SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE meetup_attendees DROP COLUMN created_at;
ALTER TABLE meetup_attendees DROP COLUMN updated_at;
ALTER TABLE meetup_attendees RENAME COLUMN created_at_new TO created_at;
ALTER TABLE meetup_attendees RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER meetup_attendees_stamp_insert AFTER INSERT ON meetup_attendees WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE meetup_attendees SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER meetup_attendees_stamp_update AFTER UPDATE ON meetup_attendees WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE meetup_attendees SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- meetups
DROP TRIGGER IF EXISTS meetups_stamp_insert;
DROP TRIGGER IF EXISTS meetups_stamp_update;
ALTER TABLE meetups ADD COLUMN created_at_new TEXT;
ALTER TABLE meetups ADD COLUMN updated_at_new TEXT;
UPDATE meetups SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE meetups DROP COLUMN created_at;
ALTER TABLE meetups DROP COLUMN updated_at;
ALTER TABLE meetups RENAME COLUMN created_at_new TO created_at;
ALTER TABLE meetups RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER meetups_stamp_insert AFTER INSERT ON meetups WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE meetups SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER meetups_stamp_update AFTER UPDATE ON meetups WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE meetups SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- members
DROP TRIGGER IF EXISTS members_stamp_insert;
DROP TRIGGER IF EXISTS members_stamp_update;
ALTER TABLE members ADD COLUMN created_at_new TEXT;
ALTER TABLE members ADD COLUMN updated_at_new TEXT;
UPDATE members SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE members DROP COLUMN created_at;
ALTER TABLE members DROP COLUMN updated_at;
ALTER TABLE members RENAME COLUMN created_at_new TO created_at;
ALTER TABLE members RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER members_stamp_insert AFTER INSERT ON members WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE members SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER members_stamp_update AFTER UPDATE ON members WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE members SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- photos
DROP TRIGGER IF EXISTS photos_stamp_insert;
DROP TRIGGER IF EXISTS photos_stamp_update;
DROP INDEX photos_uploader;
ALTER TABLE photos ADD COLUMN created_at_new TEXT;
ALTER TABLE photos ADD COLUMN updated_at_new TEXT;
UPDATE photos SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE photos DROP COLUMN created_at;
ALTER TABLE photos DROP COLUMN updated_at;
ALTER TABLE photos RENAME COLUMN created_at_new TO created_at;
ALTER TABLE photos RENAME COLUMN updated_at_new TO updated_at;
CREATE INDEX photos_uploader ON photos(uploaded_by, created_at);
CREATE TRIGGER photos_stamp_insert AFTER INSERT ON photos WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE photos SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER photos_stamp_update AFTER UPDATE ON photos WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE photos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- profiles
DROP TRIGGER IF EXISTS profiles_stamp_insert;
DROP TRIGGER IF EXISTS profiles_stamp_update;
ALTER TABLE profiles ADD COLUMN created_at_new TEXT;
ALTER TABLE profiles ADD COLUMN updated_at_new TEXT;
UPDATE profiles SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE profiles DROP COLUMN created_at;
ALTER TABLE profiles DROP COLUMN updated_at;
ALTER TABLE profiles RENAME COLUMN created_at_new TO created_at;
ALTER TABLE profiles RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER profiles_stamp_insert AFTER INSERT ON profiles WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE profiles SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER profiles_stamp_update AFTER UPDATE ON profiles WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- ride_checks
DROP TRIGGER IF EXISTS ride_checks_stamp_insert;
DROP TRIGGER IF EXISTS ride_checks_stamp_update;
ALTER TABLE ride_checks ADD COLUMN created_at_new TEXT;
ALTER TABLE ride_checks ADD COLUMN updated_at_new TEXT;
UPDATE ride_checks SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE ride_checks DROP COLUMN created_at;
ALTER TABLE ride_checks DROP COLUMN updated_at;
ALTER TABLE ride_checks RENAME COLUMN created_at_new TO created_at;
ALTER TABLE ride_checks RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER ride_checks_stamp_insert AFTER INSERT ON ride_checks WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE ride_checks SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER ride_checks_stamp_update AFTER UPDATE ON ride_checks WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE ride_checks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- ride_logs
DROP TRIGGER IF EXISTS ride_logs_stamp_insert;
DROP TRIGGER IF EXISTS ride_logs_stamp_update;
ALTER TABLE ride_logs ADD COLUMN created_at_new TEXT;
ALTER TABLE ride_logs ADD COLUMN updated_at_new TEXT;
UPDATE ride_logs SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE ride_logs DROP COLUMN created_at;
ALTER TABLE ride_logs DROP COLUMN updated_at;
ALTER TABLE ride_logs RENAME COLUMN created_at_new TO created_at;
ALTER TABLE ride_logs RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER ride_logs_stamp_insert AFTER INSERT ON ride_logs WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE ride_logs SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER ride_logs_stamp_update AFTER UPDATE ON ride_logs WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE ride_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- room_stays
DROP TRIGGER IF EXISTS room_stays_stamp_insert;
DROP TRIGGER IF EXISTS room_stays_stamp_update;
ALTER TABLE room_stays ADD COLUMN created_at_new TEXT;
ALTER TABLE room_stays ADD COLUMN updated_at_new TEXT;
UPDATE room_stays SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE room_stays DROP COLUMN created_at;
ALTER TABLE room_stays DROP COLUMN updated_at;
ALTER TABLE room_stays RENAME COLUMN created_at_new TO created_at;
ALTER TABLE room_stays RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER room_stays_stamp_insert AFTER INSERT ON room_stays WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE room_stays SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER room_stays_stamp_update AFTER UPDATE ON room_stays WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE room_stays SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- season_passes
DROP TRIGGER IF EXISTS season_passes_stamp_insert;
DROP TRIGGER IF EXISTS season_passes_stamp_update;
ALTER TABLE season_passes ADD COLUMN created_at_new TEXT;
ALTER TABLE season_passes ADD COLUMN updated_at_new TEXT;
UPDATE season_passes SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE season_passes DROP COLUMN created_at;
ALTER TABLE season_passes DROP COLUMN updated_at;
ALTER TABLE season_passes RENAME COLUMN created_at_new TO created_at;
ALTER TABLE season_passes RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER season_passes_stamp_insert AFTER INSERT ON season_passes WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE season_passes SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER season_passes_stamp_update AFTER UPDATE ON season_passes WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE season_passes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- sessions
DROP TRIGGER IF EXISTS sessions_stamp_insert;
DROP TRIGGER IF EXISTS sessions_stamp_update;
ALTER TABLE sessions ADD COLUMN created_at_new TEXT;
ALTER TABLE sessions ADD COLUMN updated_at_new TEXT;
UPDATE sessions SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE sessions DROP COLUMN created_at;
ALTER TABLE sessions DROP COLUMN updated_at;
ALTER TABLE sessions RENAME COLUMN created_at_new TO created_at;
ALTER TABLE sessions RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER sessions_stamp_insert AFTER INSERT ON sessions WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE sessions SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sessions_stamp_update AFTER UPDATE ON sessions WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- signup_requests
DROP TRIGGER IF EXISTS signup_requests_stamp_insert;
DROP TRIGGER IF EXISTS signup_requests_stamp_update;
ALTER TABLE signup_requests ADD COLUMN created_at_new TEXT;
ALTER TABLE signup_requests ADD COLUMN updated_at_new TEXT;
UPDATE signup_requests SET created_at_new = created_at, updated_at_new = updated_at;
ALTER TABLE signup_requests DROP COLUMN created_at;
ALTER TABLE signup_requests DROP COLUMN updated_at;
ALTER TABLE signup_requests RENAME COLUMN created_at_new TO created_at;
ALTER TABLE signup_requests RENAME COLUMN updated_at_new TO updated_at;
CREATE TRIGGER signup_requests_stamp_insert AFTER INSERT ON signup_requests WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE signup_requests SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER signup_requests_stamp_update AFTER UPDATE ON signup_requests WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE signup_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
