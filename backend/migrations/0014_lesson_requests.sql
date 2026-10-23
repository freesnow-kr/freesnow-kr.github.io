-- 강습 요청 (사용자 요구 2026-10-23): 출격 체크한 날에 회원이 강습을 요청 → 운영진이 /admin에서 회원 중 한 명과 연결(teacher_id)
-- 요청은 본인과 운영진만 봄(다른 회원 X), 연결(누구와 이었는지)은 운영진만 봄 — 사용자 요구. 회원·날짜당 한 줄, 취소 = is_active 0(연결도 지움),
-- 다시 요청하면 되살림. 출격을 취소하면 같이 취소
-- ride_checks에 열을 더하면 시각 열이 맨 뒤 규칙(0009)이 깨져서 따로 테이블
CREATE TABLE lesson_requests (
  member_id TEXT NOT NULL REFERENCES members(id),
  date TEXT NOT NULL,                         -- 'YYYY-MM-DD'
  teacher_id TEXT REFERENCES members(id),     -- 운영진이 연결한 회원 (없으면 아직 연결 전)
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (member_id, date)
);
CREATE INDEX lesson_requests_date ON lesson_requests(is_active, date);
CREATE TRIGGER lesson_requests_stamp_insert AFTER INSERT ON lesson_requests WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE lesson_requests SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER lesson_requests_stamp_update AFTER UPDATE ON lesson_requests WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE lesson_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
