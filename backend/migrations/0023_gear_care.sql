-- 장비 관리 기록 (사용자 요구 2026-10-29, SHRED LOG): 왁싱, 엣지, 튠업 날짜와 메모. 회원 본인만 봄, 탈퇴하면 진짜 삭제
-- 규칙대로 is_active(소프트 삭제), created_at, updated_at 맨 뒤 + 시각 트리거
CREATE TABLE gear_care (
  member_id TEXT NOT NULL REFERENCES members(id),
  id TEXT NOT NULL,                           -- 화면이 만든 ID (다시 보내도 중복 없음)
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('왁싱', '엣지', '튠업', '기타')),
  memo TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (member_id, id)
);
CREATE TRIGGER gear_care_stamp_insert AFTER INSERT ON gear_care WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE gear_care SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER gear_care_stamp_update AFTER UPDATE ON gear_care WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE gear_care SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
