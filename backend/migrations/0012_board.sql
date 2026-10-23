-- 게시판 (사용자 요구 2026-10-23, 소모임 게시판처럼): 말머리 공지/모임후기/가입인사/자유, 사진 첨부, 댓글, 좋아요
-- 공지만 전체 공개, 나머지는 회원만. 공지 쓰기·고정은 운영진. 지우기는 소프트 삭제(is_active = 0)
-- 규칙대로 is_active·created_at·updated_at 맨 뒤 + 시각 자동 기록 트리거

CREATE TABLE board_posts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('notice', 'review', 'greeting', 'free')),  -- 공지 / 모임후기 / 가입인사 / 자유
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL REFERENCES members(id),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),   -- 상단 고정 (운영진만, 고정 공지는 메인 NOTICE 줄에도)
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX board_posts_list ON board_posts(is_active, category, pinned, created_at);
CREATE TRIGGER board_posts_stamp_insert AFTER INSERT ON board_posts WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE board_posts SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER board_posts_stamp_update AFTER UPDATE ON board_posts WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE board_posts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

CREATE TABLE board_photos (
  id TEXT PRIMARY KEY,                        -- R2 board/{post_id}/{id}.jpg (브라우저가 1600px JPG로 줄여 올림)
  post_id TEXT NOT NULL REFERENCES board_posts(id),
  author_id TEXT NOT NULL REFERENCES members(id),
  sort INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX board_photos_post ON board_photos(post_id, is_active);
CREATE TRIGGER board_photos_stamp_insert AFTER INSERT ON board_photos WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE board_photos SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER board_photos_stamp_update AFTER UPDATE ON board_photos WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE board_photos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

CREATE TABLE board_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES board_posts(id),
  author_id TEXT NOT NULL REFERENCES members(id),
  body TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX board_comments_post ON board_comments(post_id, is_active);
CREATE TRIGGER board_comments_stamp_insert AFTER INSERT ON board_comments WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE board_comments SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER board_comments_stamp_update AFTER UPDATE ON board_comments WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE board_comments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

CREATE TABLE board_likes (
  post_id TEXT NOT NULL REFERENCES board_posts(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),   -- 좋아요 취소 = 0 (다시 누르면 1)
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (post_id, member_id)
);
CREATE TRIGGER board_likes_stamp_insert AFTER INSERT ON board_likes WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE board_likes SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER board_likes_stamp_update AFTER UPDATE ON board_likes WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE board_likes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
