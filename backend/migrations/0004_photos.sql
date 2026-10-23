-- 갤러리 사진 (사용자 요구 2026-10-23): 회원 누구나 올림, 원본 그대로 R2에. 최근 두 시즌(이번·지난)만 R2,
-- 그보다 오래된 시즌은 구글 드라이브 '프리스노우 {시즌}' 폴더로 옮기고 R2에서 지움 (storage = 'drive', drive_id)
-- R2 키: orig/{id} (원본), large/{id} (1800px JPG, 크게 보기), thumb/{id} (720px JPG, 격자)
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  season TEXT NOT NULL,                       -- '25-26' (찍은 날 기준, 7/1 ~ 6/30)
  taken_at TEXT NOT NULL,                     -- UTC ISO (파일 날짜)
  caption TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT REFERENCES members(id),
  content_type TEXT NOT NULL,                 -- 원본 형식
  size INTEGER NOT NULL,                      -- 원본 바이트
  storage TEXT NOT NULL DEFAULT 'r2' CHECK (storage IN ('r2', 'drive')),
  drive_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX photos_taken ON photos(taken_at);
CREATE INDEX photos_season ON photos(season, storage);
CREATE INDEX photos_uploader ON photos(uploaded_by, created_at);
