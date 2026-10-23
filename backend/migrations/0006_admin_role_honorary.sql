-- 권한과 명칭을 나눔 (사용자 요구 2026-10-23): '마스터'는 동호회의 명예 명칭(고문·선배 같은 대우)이지 사이트 권한이 아님
--   role: member / staff(운영진) / admin(관리자 — 권한·정지 변경, 운영 기록. 예전 'master')
--   honorary = 1: 마스터 (배지만, 권한은 role대로)
-- SQLite는 CHECK를 못 바꾸고, D1은 다른 테이블이 참조하는 members를 다시 만들 수 없어서(외래키):
--   예전 role 열은 role_old로 이름만 바꿔 두고(안 씀), 새 CHECK로 role 열을 다시 추가
ALTER TABLE members RENAME COLUMN role TO role_old;
ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'staff', 'admin'));
UPDATE members SET role = CASE role_old WHEN 'master' THEN 'admin' ELSE role_old END;
ALTER TABLE members ADD COLUMN honorary INTEGER NOT NULL DEFAULT 0 CHECK (honorary IN (0, 1));
UPDATE members SET honorary = 1 WHERE grade = '마스터';
