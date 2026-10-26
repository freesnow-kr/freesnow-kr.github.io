-- 앱 알림(웹 푸시) 구독 (사용자 요구 2026-10-26): 기기(브라우저·홈 화면 앱)마다 한 줄. 운영진 알림(강습 요청·가입 신청)을 보냄 — src/push.ts
-- endpoint = 푸시 서비스 주소(기기마다 다름), p256dh·auth = 내용 암호화용 기기 공개키·비밀값(브라우저가 줌, base64url)
-- 끄면 is_active = 0, 다시 켜면 되살림. 푸시 서비스가 404·410(만료)이면 서버가 is_active = 0
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX push_subscriptions_member ON push_subscriptions(is_active, member_id);
CREATE TRIGGER push_subscriptions_stamp_insert AFTER INSERT ON push_subscriptions WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE push_subscriptions SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER push_subscriptions_stamp_update AFTER UPDATE ON push_subscriptions WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE push_subscriptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
