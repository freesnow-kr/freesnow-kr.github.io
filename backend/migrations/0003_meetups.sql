-- 모임: 지금은 소모임 정모를 읽을 때마다 여기에 이력으로 저장(source = 'somoim'). 지난 정모도 지우지 않음
-- 나중에 소모임 없이 사이트에서 직접 모임을 만들면 source = 'club' + 참석/취소는 meetup_attendees (사용자 요구 2026-10-23)
CREATE TABLE meetups (
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
  created_by TEXT REFERENCES members(id),     -- 자체 모임을 만든 운영진
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX meetups_start ON meetups(starts_at);

-- 자체 모임 참석 (아직 안 씀). 회원·모임당 한 줄, 취소해도 남김. 정원 확인은 조건부 INSERT 한 문장으로 (동시에 눌러도 안 넘침)
CREATE TABLE meetup_attendees (
  meetup_id TEXT NOT NULL REFERENCES meetups(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  status TEXT NOT NULL CHECK (status IN ('going', 'cancelled')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (meetup_id, member_id)
);
CREATE INDEX meetup_attendees_member ON meetup_attendees(member_id);
