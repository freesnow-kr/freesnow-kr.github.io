-- members.grade(시트 '구분': 지역 또는 운영진·마스터가 섞여 있던 칸) → region(지역만) (사용자 요구 2026-10-23)
-- 운영진·관리자는 role, 마스터는 honorary로 이미 따로 있음. 운영진·마스터로 적혀 있던 줄의 지역은
-- 거주지로 찾아서 따로 채움 (backend/src/region.ts regionOf — SQL로는 시도 목록을 못 써서 배포 때 UPDATE 문을 만들어 실행)
ALTER TABLE members RENAME COLUMN grade TO region;
