-- 외래키 모두 없앰 (사용자 요구 2026-11-03: 회원 줄을 직접 지우면 FOREIGN KEY 오류).
-- SQLite는 제약만 뺄 수 없어서 테이블마다 새로 만들어 옮김 (열, 순서, 인덱스, 트리거 그대로).
-- 다른 테이블이 가리키던 board_posts, meetups는 가리키는 쪽을 먼저 옮긴 뒤 맨 뒤에.
PRAGMA defer_foreign_keys = true;

-- member_credentials
CREATE TABLE member_credentials__new (
  member_id TEXT PRIMARY KEY,
  hash TEXT,
  salt TEXT,
  iter INTEGER,
  reset_until TEXT,
  changed_at TEXT
, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT);
INSERT INTO member_credentials__new SELECT * FROM member_credentials;
DROP TABLE member_credentials;
ALTER TABLE member_credentials__new RENAME TO member_credentials;
CREATE TRIGGER member_credentials_stamp_insert AFTER INSERT ON member_credentials WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE member_credentials SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER member_credentials_stamp_update AFTER UPDATE ON member_credentials WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE member_credentials SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- sessions
CREATE TABLE sessions__new (
  token_hash TEXT PRIMARY KEY,                -- SHA-256(토큰). 토큰 원문은 저장 안 함
  member_id TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0,     -- 새 비밀번호 정하기 전 세션
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ua TEXT
, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT);
INSERT INTO sessions__new SELECT * FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions__new RENAME TO sessions;
CREATE INDEX sessions_member ON sessions(member_id);
CREATE TRIGGER sessions_stamp_insert AFTER INSERT ON sessions WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE sessions SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER sessions_stamp_update AFTER UPDATE ON sessions WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- profiles
CREATE TABLE profiles__new (
  member_id TEXT PRIMARY KEY,
  photo TEXT NOT NULL,                        -- 드라이브 파일 ID 또는 data:image/jpeg… (지금과 같음)
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT);
INSERT INTO profiles__new SELECT * FROM profiles;
DROP TABLE profiles;
ALTER TABLE profiles__new RENAME TO profiles;
CREATE TRIGGER profiles_stamp_insert AFTER INSERT ON profiles WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE profiles SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER profiles_stamp_update AFTER UPDATE ON profiles WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- ride_logs
CREATE TABLE ride_logs__new (
  member_id TEXT NOT NULL,
  id TEXT NOT NULL,                           -- 화면이 만든 ID (다시 보내도 중복 없음)
  date TEXT NOT NULL,
  resort TEXT NOT NULL,
  slot TEXT, snow TEXT, style TEXT, weather TEXT, crew TEXT,
  temp REAL, runs INTEGER, hours REAL, rating INTEGER,
  gear TEXT, memo TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT,
  PRIMARY KEY (member_id, id)
);
INSERT INTO ride_logs__new SELECT * FROM ride_logs;
DROP TABLE ride_logs;
ALTER TABLE ride_logs__new RENAME TO ride_logs;
CREATE TRIGGER ride_logs_stamp_insert AFTER INSERT ON ride_logs WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE ride_logs SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER ride_logs_stamp_update AFTER UPDATE ON ride_logs WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE ride_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- expense_logs
CREATE TABLE expense_logs__new (
  member_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  cat TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  memo TEXT,
  visit_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT,
  PRIMARY KEY (member_id, id)
);
INSERT INTO expense_logs__new SELECT * FROM expense_logs;
DROP TABLE expense_logs;
ALTER TABLE expense_logs__new RENAME TO expense_logs;
CREATE TRIGGER expense_logs_stamp_insert AFTER INSERT ON expense_logs WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE expense_logs SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER expense_logs_stamp_update AFTER UPDATE ON expense_logs WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE expense_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- season_passes
CREATE TABLE season_passes__new (
  member_id TEXT NOT NULL,
  season TEXT NOT NULL,                       -- '25-26'
  price INTEGER NOT NULL DEFAULT 0,
  day_price INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT,
  PRIMARY KEY (member_id, season)
);
INSERT INTO season_passes__new SELECT * FROM season_passes;
DROP TABLE season_passes;
ALTER TABLE season_passes__new RENAME TO season_passes;
CREATE TRIGGER season_passes_stamp_insert AFTER INSERT ON season_passes WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE season_passes SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER season_passes_stamp_update AFTER UPDATE ON season_passes WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE season_passes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- snowlive_links
CREATE TABLE snowlive_links__new (
  member_id TEXT PRIMARY KEY,
  snowlive_id TEXT NOT NULL,
  linked_at TEXT NOT NULL
, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT);
INSERT INTO snowlive_links__new SELECT * FROM snowlive_links;
DROP TABLE snowlive_links;
ALTER TABLE snowlive_links__new RENAME TO snowlive_links;
CREATE TRIGGER snowlive_links_stamp_insert AFTER INSERT ON snowlive_links WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE snowlive_links SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER snowlive_links_stamp_update AFTER UPDATE ON snowlive_links WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE snowlive_links SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- snowlive_records
CREATE TABLE snowlive_records__new (
  member_id TEXT NOT NULL,
  season TEXT NOT NULL,
  data TEXT NOT NULL,                         -- 라이딩 통계 JSON만
  fetched_at TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT,
  PRIMARY KEY (member_id, season)
);
INSERT INTO snowlive_records__new SELECT * FROM snowlive_records;
DROP TABLE snowlive_records;
ALTER TABLE snowlive_records__new RENAME TO snowlive_records;
CREATE TRIGGER snowlive_records_stamp_insert AFTER INSERT ON snowlive_records WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE snowlive_records SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER snowlive_records_stamp_update AFTER UPDATE ON snowlive_records WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE snowlive_records SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- room_stays
CREATE TABLE room_stays__new (
  member_id TEXT NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('숙박', '휴식', '취소')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT,
  PRIMARY KEY (member_id, date)
);
INSERT INTO room_stays__new SELECT * FROM room_stays;
DROP TABLE room_stays;
ALTER TABLE room_stays__new RENAME TO room_stays;
CREATE INDEX room_stays_date ON room_stays(date);
CREATE TRIGGER room_stays_stamp_insert AFTER INSERT ON room_stays WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE room_stays SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER room_stays_stamp_update AFTER UPDATE ON room_stays WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE room_stays SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- room_owners
CREATE TABLE room_owners__new (
  season TEXT NOT NULL,
  member_id TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT,
  PRIMARY KEY (season, member_id)
);
INSERT INTO room_owners__new SELECT * FROM room_owners;
DROP TABLE room_owners;
ALTER TABLE room_owners__new RENAME TO room_owners;
CREATE TRIGGER room_owners_stamp_insert AFTER INSERT ON room_owners WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE room_owners SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER room_owners_stamp_update AFTER UPDATE ON room_owners WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE room_owners SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- ride_checks
CREATE TABLE ride_checks__new (
  member_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('출격', '취소')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT,
  PRIMARY KEY (member_id, date)
);
INSERT INTO ride_checks__new SELECT * FROM ride_checks;
DROP TABLE ride_checks;
ALTER TABLE ride_checks__new RENAME TO ride_checks;
CREATE INDEX ride_checks_date ON ride_checks(date);
CREATE TRIGGER ride_checks_stamp_insert AFTER INSERT ON ride_checks WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE ride_checks SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER ride_checks_stamp_update AFTER UPDATE ON ride_checks WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE ride_checks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- meetup_attendees
CREATE TABLE meetup_attendees__new (
  meetup_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('going', 'cancelled')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT,
  PRIMARY KEY (meetup_id, member_id)
);
INSERT INTO meetup_attendees__new SELECT * FROM meetup_attendees;
DROP TABLE meetup_attendees;
ALTER TABLE meetup_attendees__new RENAME TO meetup_attendees;
CREATE INDEX meetup_attendees_member ON meetup_attendees(member_id);
CREATE TRIGGER meetup_attendees_stamp_insert AFTER INSERT ON meetup_attendees WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE meetup_attendees SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER meetup_attendees_stamp_update AFTER UPDATE ON meetup_attendees WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE meetup_attendees SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- photos
CREATE TABLE photos__new (
  id TEXT PRIMARY KEY,
  season TEXT NOT NULL,                       -- '25-26' (찍은 날 기준, 7/1 ~ 6/30)
  taken_at TEXT NOT NULL,                     -- UTC ISO (파일 날짜)
  caption TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT,
  content_type TEXT NOT NULL,                 -- 원본 형식
  size INTEGER NOT NULL,                      -- 원본 바이트
  storage TEXT NOT NULL DEFAULT 'r2' CHECK (storage IN ('r2', 'drive')),
  drive_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT);
INSERT INTO photos__new SELECT * FROM photos;
DROP TABLE photos;
ALTER TABLE photos__new RENAME TO photos;
CREATE INDEX photos_taken ON photos(taken_at);
CREATE INDEX photos_season ON photos(season, storage);
CREATE INDEX photos_uploader ON photos(uploaded_by, created_at);
CREATE TRIGGER photos_stamp_insert AFTER INSERT ON photos WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE photos SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER photos_stamp_update AFTER UPDATE ON photos WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE photos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- board_photos
CREATE TABLE board_photos__new (
  id TEXT PRIMARY KEY,                        -- R2 board/{post_id}/{id}.jpg (브라우저가 1600px JPG로 줄여 올림)
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO board_photos__new SELECT * FROM board_photos;
DROP TABLE board_photos;
ALTER TABLE board_photos__new RENAME TO board_photos;
CREATE INDEX board_photos_post ON board_photos(post_id, is_active);
CREATE TRIGGER board_photos_stamp_insert AFTER INSERT ON board_photos WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE board_photos SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER board_photos_stamp_update AFTER UPDATE ON board_photos WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE board_photos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- board_comments
CREATE TABLE board_comments__new (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO board_comments__new SELECT * FROM board_comments;
DROP TABLE board_comments;
ALTER TABLE board_comments__new RENAME TO board_comments;
CREATE INDEX board_comments_post ON board_comments(post_id, is_active);
CREATE TRIGGER board_comments_stamp_insert AFTER INSERT ON board_comments WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE board_comments SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER board_comments_stamp_update AFTER UPDATE ON board_comments WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE board_comments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- board_likes
CREATE TABLE board_likes__new (
  post_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),   -- 좋아요 취소 = 0 (다시 누르면 1)
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (post_id, member_id)
);
INSERT INTO board_likes__new SELECT * FROM board_likes;
DROP TABLE board_likes;
ALTER TABLE board_likes__new RENAME TO board_likes;
CREATE TRIGGER board_likes_stamp_insert AFTER INSERT ON board_likes WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE board_likes SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER board_likes_stamp_update AFTER UPDATE ON board_likes WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE board_likes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- team_events
CREATE TABLE team_events__new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,                         -- 'YYYY-MM-DD'
  data TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO team_events__new SELECT * FROM team_events;
DROP TABLE team_events;
ALTER TABLE team_events__new RENAME TO team_events;
CREATE INDEX team_events_date ON team_events(is_active, date);
CREATE TRIGGER team_events_stamp_insert AFTER INSERT ON team_events WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE team_events SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER team_events_stamp_update AFTER UPDATE ON team_events WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE team_events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- lesson_requests
CREATE TABLE lesson_requests__new (
  member_id TEXT NOT NULL,
  date TEXT NOT NULL,                         -- 'YYYY-MM-DD'
  teacher_id TEXT,     -- 운영진이 연결한 회원 (없으면 아직 연결 전)
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (member_id, date)
);
INSERT INTO lesson_requests__new SELECT * FROM lesson_requests;
DROP TABLE lesson_requests;
ALTER TABLE lesson_requests__new RENAME TO lesson_requests;
CREATE INDEX lesson_requests_date ON lesson_requests(is_active, date);
CREATE TRIGGER lesson_requests_stamp_insert AFTER INSERT ON lesson_requests WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE lesson_requests SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER lesson_requests_stamp_update AFTER UPDATE ON lesson_requests WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE lesson_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- push_subscriptions
CREATE TABLE push_subscriptions__new (
  endpoint TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO push_subscriptions__new SELECT * FROM push_subscriptions;
DROP TABLE push_subscriptions;
ALTER TABLE push_subscriptions__new RENAME TO push_subscriptions;
CREATE INDEX push_subscriptions_member ON push_subscriptions(is_active, member_id);
CREATE TRIGGER push_subscriptions_stamp_insert AFTER INSERT ON push_subscriptions WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE push_subscriptions SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER push_subscriptions_stamp_update AFTER UPDATE ON push_subscriptions WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE push_subscriptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- gear_care
CREATE TABLE gear_care__new (
  member_id TEXT NOT NULL,
  id TEXT NOT NULL,                           -- 화면이 만든 ID (다시 보내도 중복 없음)
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('왁싱', '엣지', '튠업', '기타')),
  memo TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (member_id, id)
);
INSERT INTO gear_care__new SELECT * FROM gear_care;
DROP TABLE gear_care;
ALTER TABLE gear_care__new RENAME TO gear_care;
CREATE TRIGGER gear_care_stamp_insert AFTER INSERT ON gear_care WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE gear_care SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER gear_care_stamp_update AFTER UPDATE ON gear_care WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE gear_care SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- meetups
CREATE TABLE meetups__new (
  id TEXT PRIMARY KEY,                        -- 소모임: 'somoim:' + 시작시각 + '|' + 제목 / 자체: 무작위
  source TEXT NOT NULL CHECK (source IN ('somoim', 'club')),
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,                    -- UTC ISO
  ends_at TEXT,
  place TEXT NOT NULL DEFAULT '',
  fee TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  capacity INTEGER,                           -- NULL = 제한 없음
  somoim_count INTEGER,                       -- 소모임에서 마지막으로 본 참석 인원 (자체 모임은 NULL → 참석 테이블로 셈)
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_by TEXT,     -- 자체 모임을 만든 운영진
  first_seen_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)), created_at TEXT, updated_at TEXT);
INSERT INTO meetups__new SELECT * FROM meetups;
DROP TABLE meetups;
ALTER TABLE meetups__new RENAME TO meetups;
CREATE INDEX meetups_start ON meetups(starts_at);
CREATE TRIGGER meetups_stamp_insert AFTER INSERT ON meetups WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE meetups SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER meetups_stamp_update AFTER UPDATE ON meetups WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE meetups SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- board_posts
CREATE TABLE board_posts__new (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('notice', 'review', 'greeting', 'free')),  -- 공지 / 모임후기 / 가입인사 / 자유
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),   -- 상단 고정 (운영진만, 고정 공지는 메인 NOTICE 줄에도)
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO board_posts__new SELECT * FROM board_posts;
DROP TABLE board_posts;
ALTER TABLE board_posts__new RENAME TO board_posts;
CREATE INDEX board_posts_list ON board_posts(is_active, category, pinned, created_at);
CREATE TRIGGER board_posts_stamp_insert AFTER INSERT ON board_posts WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE board_posts SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER board_posts_stamp_update AFTER UPDATE ON board_posts WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE board_posts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
