-- 조 편성 (사용자 요구 2026-10-23: 정모·체육대회 때 조 짜기 + 팀 대항 점수판, free-snow-summer 홈 점수판 참고)
-- 행사 하나 = 한 줄. 참가자·팀·게임 점수는 화면에서 다루는 모양 그대로 JSON 한 칸(data)에 (행사마다 구성이 달라서)
--   data = { teams: [{name}], people: [{key, name, gender, memberId?, guest?, team}], games: [{name, points, winners: [팀 번호]}] }
CREATE TABLE team_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,                         -- 'YYYY-MM-DD'
  data TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES members(id),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX team_events_date ON team_events(is_active, date);
CREATE TRIGGER team_events_stamp_insert AFTER INSERT ON team_events WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE team_events SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER team_events_stamp_update AFTER UPDATE ON team_events WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE team_events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
