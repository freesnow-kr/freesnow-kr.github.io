-- 출격 체크 (시즌방 페이지): 그날 스키장 가는 사람. 시즌방 숙박과 따로, 정산 없음. 회원·날짜당 한 줄, 취소도 남김
-- (SHRED LOG의 ride_logs는 개인 기록이라 다른 테이블)
CREATE TABLE ride_checks (
  member_id TEXT NOT NULL REFERENCES members(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('출격', '취소')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (member_id, date)
);
CREATE INDEX ride_checks_date ON ride_checks(date);
